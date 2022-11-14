// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { BaseRequestPolicy, deserializationPolicy, generateUuid, HttpHeaders, WebResource, isTokenCredential, bearerTokenAuthenticationPolicy, isNode, } from "@azure/core-http";
import { SpanStatusCode } from "@azure/core-tracing";
import { AnonymousCredential } from "./credentials/AnonymousCredential";
import { BlobClient } from "./Clients";
import { Mutex } from "./utils/Mutex";
import { Pipeline } from "./Pipeline";
import { attachCredential, getURLPath, getURLPathAndQuery, iEqual } from "./utils/utils.common";
import { HeaderConstants, BATCH_MAX_REQUEST, HTTP_VERSION_1_1, HTTP_LINE_ENDING, StorageOAuthScopes, } from "./utils/constants";
import { StorageSharedKeyCredential } from "./credentials/StorageSharedKeyCredential";
import { createSpan } from "./utils/tracing";
/**
 * A BlobBatch represents an aggregated set of operations on blobs.
 * Currently, only `delete` and `setAccessTier` are supported.
 */
export class BlobBatch {
    constructor() {
        this.batch = "batch";
        this.batchRequest = new InnerBatchRequest();
    }
    /**
     * Get the value of Content-Type for a batch request.
     * The value must be multipart/mixed with a batch boundary.
     * Example: multipart/mixed; boundary=batch_a81786c8-e301-4e42-a729-a32ca24ae252
     */
    getMultiPartContentType() {
        return this.batchRequest.getMultipartContentType();
    }
    /**
     * Get assembled HTTP request body for sub requests.
     */
    getHttpRequestBody() {
        return this.batchRequest.getHttpRequestBody();
    }
    /**
     * Get sub requests that are added into the batch request.
     */
    getSubRequests() {
        return this.batchRequest.getSubRequests();
    }
    async addSubRequestInternal(subRequest, assembleSubRequestFunc) {
        await Mutex.lock(this.batch);
        try {
            this.batchRequest.preAddSubRequest(subRequest);
            await assembleSubRequestFunc();
            this.batchRequest.postAddSubRequest(subRequest);
        }
        finally {
            await Mutex.unlock(this.batch);
        }
    }
    setBatchType(batchType) {
        if (!this.batchType) {
            this.batchType = batchType;
        }
        if (this.batchType !== batchType) {
            throw new RangeError(`BlobBatch only supports one operation type per batch and it already is being used for ${this.batchType} operations.`);
        }
    }
    async deleteBlob(urlOrBlobClient, credentialOrOptions, options) {
        let url;
        let credential;
        if (typeof urlOrBlobClient === "string" &&
            ((isNode && credentialOrOptions instanceof StorageSharedKeyCredential) ||
                credentialOrOptions instanceof AnonymousCredential ||
                isTokenCredential(credentialOrOptions))) {
            // First overload
            url = urlOrBlobClient;
            credential = credentialOrOptions;
        }
        else if (urlOrBlobClient instanceof BlobClient) {
            // Second overload
            url = urlOrBlobClient.url;
            credential = urlOrBlobClient.credential;
            options = credentialOrOptions;
        }
        else {
            throw new RangeError("Invalid arguments. Either url and credential, or BlobClient need be provided.");
        }
        if (!options) {
            options = {};
        }
        const { span, updatedOptions } = createSpan("BatchDeleteRequest-addSubRequest", options);
        try {
            this.setBatchType("delete");
            await this.addSubRequestInternal({
                url: url,
                credential: credential,
            }, async () => {
                await new BlobClient(url, this.batchRequest.createPipeline(credential)).delete(updatedOptions);
            });
        }
        catch (e) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: e.message,
            });
            throw e;
        }
        finally {
            span.end();
        }
    }
    async setBlobAccessTier(urlOrBlobClient, credentialOrTier, tierOrOptions, options) {
        let url;
        let credential;
        let tier;
        if (typeof urlOrBlobClient === "string" &&
            ((isNode && credentialOrTier instanceof StorageSharedKeyCredential) ||
                credentialOrTier instanceof AnonymousCredential ||
                isTokenCredential(credentialOrTier))) {
            // First overload
            url = urlOrBlobClient;
            credential = credentialOrTier;
            tier = tierOrOptions;
        }
        else if (urlOrBlobClient instanceof BlobClient) {
            // Second overload
            url = urlOrBlobClient.url;
            credential = urlOrBlobClient.credential;
            tier = credentialOrTier;
            options = tierOrOptions;
        }
        else {
            throw new RangeError("Invalid arguments. Either url and credential, or BlobClient need be provided.");
        }
        if (!options) {
            options = {};
        }
        const { span, updatedOptions } = createSpan("BatchSetTierRequest-addSubRequest", options);
        try {
            this.setBatchType("setAccessTier");
            await this.addSubRequestInternal({
                url: url,
                credential: credential,
            }, async () => {
                await new BlobClient(url, this.batchRequest.createPipeline(credential)).setAccessTier(tier, updatedOptions);
            });
        }
        catch (e) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: e.message,
            });
            throw e;
        }
        finally {
            span.end();
        }
    }
}
/**
 * Inner batch request class which is responsible for assembling and serializing sub requests.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/blob-batch#request-body for how requests are assembled.
 */
class InnerBatchRequest {
    constructor() {
        this.operationCount = 0;
        this.body = "";
        const tempGuid = generateUuid();
        // batch_{batchid}
        this.boundary = `batch_${tempGuid}`;
        // --batch_{batchid}
        // Content-Type: application/http
        // Content-Transfer-Encoding: binary
        this.subRequestPrefix = `--${this.boundary}${HTTP_LINE_ENDING}${HeaderConstants.CONTENT_TYPE}: application/http${HTTP_LINE_ENDING}${HeaderConstants.CONTENT_TRANSFER_ENCODING}: binary`;
        // multipart/mixed; boundary=batch_{batchid}
        this.multipartContentType = `multipart/mixed; boundary=${this.boundary}`;
        // --batch_{batchid}--
        this.batchRequestEnding = `--${this.boundary}--`;
        this.subRequests = new Map();
    }
    /**
     * Create pipeline to assemble sub requests. The idea here is to use existing
     * credential and serialization/deserialization components, with additional policies to
     * filter unnecessary headers, assemble sub requests into request's body
     * and intercept request from going to wire.
     * @param credential -  Such as AnonymousCredential, StorageSharedKeyCredential or any credential from the `@azure/identity` package to authenticate requests to the service. You can also provide an object that implements the TokenCredential interface. If not specified, AnonymousCredential is used.
     */
    createPipeline(credential) {
        const isAnonymousCreds = credential instanceof AnonymousCredential;
        const policyFactoryLength = 3 + (isAnonymousCreds ? 0 : 1); // [deserializationPolicy, BatchHeaderFilterPolicyFactory, (Optional)Credential, BatchRequestAssemblePolicyFactory]
        const factories = new Array(policyFactoryLength);
        factories[0] = deserializationPolicy(); // Default deserializationPolicy is provided by protocol layer
        factories[1] = new BatchHeaderFilterPolicyFactory(); // Use batch header filter policy to exclude unnecessary headers
        if (!isAnonymousCreds) {
            factories[2] = isTokenCredential(credential)
                ? attachCredential(bearerTokenAuthenticationPolicy(credential, StorageOAuthScopes), credential)
                : credential;
        }
        factories[policyFactoryLength - 1] = new BatchRequestAssemblePolicyFactory(this); // Use batch assemble policy to assemble request and intercept request from going to wire
        return new Pipeline(factories, {});
    }
    appendSubRequestToBody(request) {
        // Start to assemble sub request
        this.body += [
            this.subRequestPrefix,
            `${HeaderConstants.CONTENT_ID}: ${this.operationCount}`,
            "",
            `${request.method.toString()} ${getURLPathAndQuery(request.url)} ${HTTP_VERSION_1_1}${HTTP_LINE_ENDING}`, // sub request start line with method
        ].join(HTTP_LINE_ENDING);
        for (const header of request.headers.headersArray()) {
            this.body += `${header.name}: ${header.value}${HTTP_LINE_ENDING}`;
        }
        this.body += HTTP_LINE_ENDING; // sub request's headers need be ending with an empty line
        // No body to assemble for current batch request support
        // End to assemble sub request
    }
    preAddSubRequest(subRequest) {
        if (this.operationCount >= BATCH_MAX_REQUEST) {
            throw new RangeError(`Cannot exceed ${BATCH_MAX_REQUEST} sub requests in a single batch`);
        }
        // Fast fail if url for sub request is invalid
        const path = getURLPath(subRequest.url);
        if (!path || path === "") {
            throw new RangeError(`Invalid url for sub request: '${subRequest.url}'`);
        }
    }
    postAddSubRequest(subRequest) {
        this.subRequests.set(this.operationCount, subRequest);
        this.operationCount++;
    }
    // Return the http request body with assembling the ending line to the sub request body.
    getHttpRequestBody() {
        return `${this.body}${this.batchRequestEnding}${HTTP_LINE_ENDING}`;
    }
    getMultipartContentType() {
        return this.multipartContentType;
    }
    getSubRequests() {
        return this.subRequests;
    }
}
class BatchRequestAssemblePolicy extends BaseRequestPolicy {
    constructor(batchRequest, nextPolicy, options) {
        super(nextPolicy, options);
        this.dummyResponse = {
            request: new WebResource(),
            status: 200,
            headers: new HttpHeaders(),
        };
        this.batchRequest = batchRequest;
    }
    async sendRequest(request) {
        await this.batchRequest.appendSubRequestToBody(request);
        return this.dummyResponse; // Intercept request from going to wire
    }
}
class BatchRequestAssemblePolicyFactory {
    constructor(batchRequest) {
        this.batchRequest = batchRequest;
    }
    create(nextPolicy, options) {
        return new BatchRequestAssemblePolicy(this.batchRequest, nextPolicy, options);
    }
}
class BatchHeaderFilterPolicy extends BaseRequestPolicy {
    // The base class has a protected constructor. Adding a public one to enable constructing of this class.
    /* eslint-disable-next-line @typescript-eslint/no-useless-constructor*/
    constructor(nextPolicy, options) {
        super(nextPolicy, options);
    }
    async sendRequest(request) {
        let xMsHeaderName = "";
        for (const header of request.headers.headersArray()) {
            if (iEqual(header.name, HeaderConstants.X_MS_VERSION)) {
                xMsHeaderName = header.name;
            }
        }
        if (xMsHeaderName !== "") {
            request.headers.remove(xMsHeaderName); // The subrequests should not have the x-ms-version header.
        }
        return this._nextPolicy.sendRequest(request);
    }
}
class BatchHeaderFilterPolicyFactory {
    create(nextPolicy, options) {
        return new BatchHeaderFilterPolicy(nextPolicy, options);
    }
}
//# sourceMappingURL=BlobBatch.js.map