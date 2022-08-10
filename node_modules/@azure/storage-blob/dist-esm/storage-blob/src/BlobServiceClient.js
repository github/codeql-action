import { __asyncDelegator, __asyncGenerator, __asyncValues, __await } from "tslib";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { isTokenCredential, isNode, getDefaultProxySettings, } from "@azure/core-http";
import { SpanStatusCode } from "@azure/core-tracing";
import { Container, Service } from "./generated/src/operations";
import { newPipeline, isPipelineLike } from "./Pipeline";
import { ContainerClient, } from "./ContainerClient";
import { appendToURLPath, appendToURLQuery, extractConnectionStringParts, toTags, } from "./utils/utils.common";
import { StorageSharedKeyCredential } from "./credentials/StorageSharedKeyCredential";
import { AnonymousCredential } from "./credentials/AnonymousCredential";
import "@azure/core-paging";
import { truncatedISO8061Date } from "./utils/utils.common";
import { convertTracingToRequestOptionsBase, createSpan } from "./utils/tracing";
import { BlobBatchClient } from "./BlobBatchClient";
import { StorageClient } from "./StorageClient";
import { AccountSASPermissions } from "./sas/AccountSASPermissions";
import { generateAccountSASQueryParameters } from "./sas/AccountSASSignatureValues";
import { AccountSASServices } from "./sas/AccountSASServices";
/**
 * A BlobServiceClient represents a Client to the Azure Storage Blob service allowing you
 * to manipulate blob containers.
 */
export class BlobServiceClient extends StorageClient {
    constructor(url, credentialOrPipeline, 
    // Legacy, no fix for eslint error without breaking. Disable it for this interface.
    /* eslint-disable-next-line @azure/azure-sdk/ts-naming-options*/
    options) {
        let pipeline;
        if (isPipelineLike(credentialOrPipeline)) {
            pipeline = credentialOrPipeline;
        }
        else if ((isNode && credentialOrPipeline instanceof StorageSharedKeyCredential) ||
            credentialOrPipeline instanceof AnonymousCredential ||
            isTokenCredential(credentialOrPipeline)) {
            pipeline = newPipeline(credentialOrPipeline, options);
        }
        else {
            // The second parameter is undefined. Use anonymous credential
            pipeline = newPipeline(new AnonymousCredential(), options);
        }
        super(url, pipeline);
        this.serviceContext = new Service(this.storageClientContext);
    }
    /**
     *
     * Creates an instance of BlobServiceClient from connection string.
     *
     * @param connectionString - Account connection string or a SAS connection string of an Azure storage account.
     *                                  [ Note - Account connection string can only be used in NODE.JS runtime. ]
     *                                  Account connection string example -
     *                                  `DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=accountKey;EndpointSuffix=core.windows.net`
     *                                  SAS connection string example -
     *                                  `BlobEndpoint=https://myaccount.blob.core.windows.net/;QueueEndpoint=https://myaccount.queue.core.windows.net/;FileEndpoint=https://myaccount.file.core.windows.net/;TableEndpoint=https://myaccount.table.core.windows.net/;SharedAccessSignature=sasString`
     * @param options - Optional. Options to configure the HTTP pipeline.
     */
    static fromConnectionString(connectionString, 
    // Legacy, no fix for eslint error without breaking. Disable it for this interface.
    /* eslint-disable-next-line @azure/azure-sdk/ts-naming-options*/
    options) {
        options = options || {};
        const extractedCreds = extractConnectionStringParts(connectionString);
        if (extractedCreds.kind === "AccountConnString") {
            if (isNode) {
                const sharedKeyCredential = new StorageSharedKeyCredential(extractedCreds.accountName, extractedCreds.accountKey);
                if (!options.proxyOptions) {
                    options.proxyOptions = getDefaultProxySettings(extractedCreds.proxyUri);
                }
                const pipeline = newPipeline(sharedKeyCredential, options);
                return new BlobServiceClient(extractedCreds.url, pipeline);
            }
            else {
                throw new Error("Account connection string is only supported in Node.js environment");
            }
        }
        else if (extractedCreds.kind === "SASConnString") {
            const pipeline = newPipeline(new AnonymousCredential(), options);
            return new BlobServiceClient(extractedCreds.url + "?" + extractedCreds.accountSas, pipeline);
        }
        else {
            throw new Error("Connection string must be either an Account connection string or a SAS connection string");
        }
    }
    /**
     * Creates a {@link ContainerClient} object
     *
     * @param containerName - A container name
     * @returns A new ContainerClient object for the given container name.
     *
     * Example usage:
     *
     * ```js
     * const containerClient = blobServiceClient.getContainerClient("<container name>");
     * ```
     */
    getContainerClient(containerName) {
        return new ContainerClient(appendToURLPath(this.url, encodeURIComponent(containerName)), this.pipeline);
    }
    /**
     * Create a Blob container.
     *
     * @param containerName - Name of the container to create.
     * @param options - Options to configure Container Create operation.
     * @returns Container creation response and the corresponding container client.
     */
    async createContainer(containerName, options = {}) {
        const { span, updatedOptions } = createSpan("BlobServiceClient-createContainer", options);
        try {
            const containerClient = this.getContainerClient(containerName);
            const containerCreateResponse = await containerClient.create(updatedOptions);
            return {
                containerClient,
                containerCreateResponse,
            };
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
    /**
     * Deletes a Blob container.
     *
     * @param containerName - Name of the container to delete.
     * @param options - Options to configure Container Delete operation.
     * @returns Container deletion response.
     */
    async deleteContainer(containerName, options = {}) {
        const { span, updatedOptions } = createSpan("BlobServiceClient-deleteContainer", options);
        try {
            const containerClient = this.getContainerClient(containerName);
            return await containerClient.delete(updatedOptions);
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
    /**
     * Restore a previously deleted Blob container.
     * This API is only functional if Container Soft Delete is enabled for the storage account associated with the container.
     *
     * @param deletedContainerName - Name of the previously deleted container.
     * @param deletedContainerVersion - Version of the previously deleted container, used to uniquely identify the deleted container.
     * @param options - Options to configure Container Restore operation.
     * @returns Container deletion response.
     */
    async undeleteContainer(deletedContainerName, deletedContainerVersion, options = {}) {
        const { span, updatedOptions } = createSpan("BlobServiceClient-undeleteContainer", options);
        try {
            const containerClient = this.getContainerClient(options.destinationContainerName || deletedContainerName);
            // Hack to access a protected member.
            const containerContext = new Container(containerClient["storageClientContext"]);
            const containerUndeleteResponse = await containerContext.restore(Object.assign({ deletedContainerName,
                deletedContainerVersion }, updatedOptions));
            return { containerClient, containerUndeleteResponse };
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
    /**
     * Rename an existing Blob Container.
     *
     * @param sourceContainerName - The name of the source container.
     * @param destinationContainerName - The new name of the container.
     * @param options - Options to configure Container Rename operation.
     */
    /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
    // @ts-ignore Need to hide this interface for now. Make it public and turn on the live tests for it when the service is ready.
    async renameContainer(sourceContainerName, destinationContainerName, options = {}) {
        var _a;
        const { span, updatedOptions } = createSpan("BlobServiceClient-renameContainer", options);
        try {
            const containerClient = this.getContainerClient(destinationContainerName);
            // Hack to access a protected member.
            const containerContext = new Container(containerClient["storageClientContext"]);
            const containerRenameResponse = await containerContext.rename(sourceContainerName, Object.assign(Object.assign({}, updatedOptions), { sourceLeaseId: (_a = options.sourceCondition) === null || _a === void 0 ? void 0 : _a.leaseId }));
            return { containerClient, containerRenameResponse };
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
    /**
     * Gets the properties of a storage account’s Blob service, including properties
     * for Storage Analytics and CORS (Cross-Origin Resource Sharing) rules.
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/get-blob-service-properties
     *
     * @param options - Options to the Service Get Properties operation.
     * @returns Response data for the Service Get Properties operation.
     */
    async getProperties(options = {}) {
        const { span, updatedOptions } = createSpan("BlobServiceClient-getProperties", options);
        try {
            return await this.serviceContext.getProperties(Object.assign({ abortSignal: options.abortSignal }, convertTracingToRequestOptionsBase(updatedOptions)));
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
    /**
     * Sets properties for a storage account’s Blob service endpoint, including properties
     * for Storage Analytics, CORS (Cross-Origin Resource Sharing) rules and soft delete settings.
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/set-blob-service-properties
     *
     * @param properties -
     * @param options - Options to the Service Set Properties operation.
     * @returns Response data for the Service Set Properties operation.
     */
    async setProperties(properties, options = {}) {
        const { span, updatedOptions } = createSpan("BlobServiceClient-setProperties", options);
        try {
            return await this.serviceContext.setProperties(properties, Object.assign({ abortSignal: options.abortSignal }, convertTracingToRequestOptionsBase(updatedOptions)));
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
    /**
     * Retrieves statistics related to replication for the Blob service. It is only
     * available on the secondary location endpoint when read-access geo-redundant
     * replication is enabled for the storage account.
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/get-blob-service-stats
     *
     * @param options - Options to the Service Get Statistics operation.
     * @returns Response data for the Service Get Statistics operation.
     */
    async getStatistics(options = {}) {
        const { span, updatedOptions } = createSpan("BlobServiceClient-getStatistics", options);
        try {
            return await this.serviceContext.getStatistics(Object.assign({ abortSignal: options.abortSignal }, convertTracingToRequestOptionsBase(updatedOptions)));
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
    /**
     * The Get Account Information operation returns the sku name and account kind
     * for the specified account.
     * The Get Account Information operation is available on service versions beginning
     * with version 2018-03-28.
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/get-account-information
     *
     * @param options - Options to the Service Get Account Info operation.
     * @returns Response data for the Service Get Account Info operation.
     */
    async getAccountInfo(options = {}) {
        const { span, updatedOptions } = createSpan("BlobServiceClient-getAccountInfo", options);
        try {
            return await this.serviceContext.getAccountInfo(Object.assign({ abortSignal: options.abortSignal }, convertTracingToRequestOptionsBase(updatedOptions)));
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
    /**
     * Returns a list of the containers under the specified account.
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/list-containers2
     *
     * @param marker - A string value that identifies the portion of
     *                        the list of containers to be returned with the next listing operation. The
     *                        operation returns the continuationToken value within the response body if the
     *                        listing operation did not return all containers remaining to be listed
     *                        with the current page. The continuationToken value can be used as the value for
     *                        the marker parameter in a subsequent call to request the next page of list
     *                        items. The marker value is opaque to the client.
     * @param options - Options to the Service List Container Segment operation.
     * @returns Response data for the Service List Container Segment operation.
     */
    async listContainersSegment(marker, options = {}) {
        const { span, updatedOptions } = createSpan("BlobServiceClient-listContainersSegment", options);
        try {
            return await this.serviceContext.listContainersSegment(Object.assign(Object.assign(Object.assign({ abortSignal: options.abortSignal, marker }, options), { include: typeof options.include === "string" ? [options.include] : options.include }), convertTracingToRequestOptionsBase(updatedOptions)));
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
    /**
     * The Filter Blobs operation enables callers to list blobs across all containers whose tags
     * match a given search expression. Filter blobs searches across all containers within a
     * storage account but can be scoped within the expression to a single container.
     *
     * @param tagFilterSqlExpression - The where parameter enables the caller to query blobs whose tags match a given expression.
     *                                        The given expression must evaluate to true for a blob to be returned in the results.
     *                                        The[OData - ABNF] filter syntax rule defines the formal grammar for the value of the where query parameter;
     *                                        however, only a subset of the OData filter syntax is supported in the Blob service.
     * @param marker - A string value that identifies the portion of
     *                          the list of blobs to be returned with the next listing operation. The
     *                          operation returns the continuationToken value within the response body if the
     *                          listing operation did not return all blobs remaining to be listed
     *                          with the current page. The continuationToken value can be used as the value for
     *                          the marker parameter in a subsequent call to request the next page of list
     *                          items. The marker value is opaque to the client.
     * @param options - Options to find blobs by tags.
     */
    async findBlobsByTagsSegment(tagFilterSqlExpression, marker, options = {}) {
        const { span, updatedOptions } = createSpan("BlobServiceClient-findBlobsByTagsSegment", options);
        try {
            const response = await this.serviceContext.filterBlobs(Object.assign({ abortSignal: options.abortSignal, where: tagFilterSqlExpression, marker, maxPageSize: options.maxPageSize }, convertTracingToRequestOptionsBase(updatedOptions)));
            const wrappedResponse = Object.assign(Object.assign({}, response), { _response: response._response, blobs: response.blobs.map((blob) => {
                    var _a;
                    let tagValue = "";
                    if (((_a = blob.tags) === null || _a === void 0 ? void 0 : _a.blobTagSet.length) === 1) {
                        tagValue = blob.tags.blobTagSet[0].value;
                    }
                    return Object.assign(Object.assign({}, blob), { tags: toTags(blob.tags), tagValue });
                }) });
            return wrappedResponse;
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
    /**
     * Returns an AsyncIterableIterator for ServiceFindBlobsByTagsSegmentResponse.
     *
     * @param tagFilterSqlExpression -  The where parameter enables the caller to query blobs whose tags match a given expression.
     *                                         The given expression must evaluate to true for a blob to be returned in the results.
     *                                         The[OData - ABNF] filter syntax rule defines the formal grammar for the value of the where query parameter;
     *                                         however, only a subset of the OData filter syntax is supported in the Blob service.
     * @param marker - A string value that identifies the portion of
     *                          the list of blobs to be returned with the next listing operation. The
     *                          operation returns the continuationToken value within the response body if the
     *                          listing operation did not return all blobs remaining to be listed
     *                          with the current page. The continuationToken value can be used as the value for
     *                          the marker parameter in a subsequent call to request the next page of list
     *                          items. The marker value is opaque to the client.
     * @param options - Options to find blobs by tags.
     */
    findBlobsByTagsSegments(tagFilterSqlExpression, marker, options = {}) {
        return __asyncGenerator(this, arguments, function* findBlobsByTagsSegments_1() {
            let response;
            if (!!marker || marker === undefined) {
                do {
                    response = yield __await(this.findBlobsByTagsSegment(tagFilterSqlExpression, marker, options));
                    response.blobs = response.blobs || [];
                    marker = response.continuationToken;
                    yield yield __await(response);
                } while (marker);
            }
        });
    }
    /**
     * Returns an AsyncIterableIterator for blobs.
     *
     * @param tagFilterSqlExpression -  The where parameter enables the caller to query blobs whose tags match a given expression.
     *                                         The given expression must evaluate to true for a blob to be returned in the results.
     *                                         The[OData - ABNF] filter syntax rule defines the formal grammar for the value of the where query parameter;
     *                                         however, only a subset of the OData filter syntax is supported in the Blob service.
     * @param options - Options to findBlobsByTagsItems.
     */
    findBlobsByTagsItems(tagFilterSqlExpression, options = {}) {
        return __asyncGenerator(this, arguments, function* findBlobsByTagsItems_1() {
            var e_1, _a;
            let marker;
            try {
                for (var _b = __asyncValues(this.findBlobsByTagsSegments(tagFilterSqlExpression, marker, options)), _c; _c = yield __await(_b.next()), !_c.done;) {
                    const segment = _c.value;
                    yield __await(yield* __asyncDelegator(__asyncValues(segment.blobs)));
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) yield __await(_a.call(_b));
                }
                finally { if (e_1) throw e_1.error; }
            }
        });
    }
    /**
     * Returns an async iterable iterator to find all blobs with specified tag
     * under the specified account.
     *
     * .byPage() returns an async iterable iterator to list the blobs in pages.
     *
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/get-blob-service-properties
     *
     * Example using `for await` syntax:
     *
     * ```js
     * let i = 1;
     * for await (const blob of blobServiceClient.findBlobsByTags("tagkey='tagvalue'")) {
     *   console.log(`Blob ${i++}: ${container.name}`);
     * }
     * ```
     *
     * Example using `iter.next()`:
     *
     * ```js
     * let i = 1;
     * const iter = blobServiceClient.findBlobsByTags("tagkey='tagvalue'");
     * let blobItem = await iter.next();
     * while (!blobItem.done) {
     *   console.log(`Blob ${i++}: ${blobItem.value.name}`);
     *   blobItem = await iter.next();
     * }
     * ```
     *
     * Example using `byPage()`:
     *
     * ```js
     * // passing optional maxPageSize in the page settings
     * let i = 1;
     * for await (const response of blobServiceClient.findBlobsByTags("tagkey='tagvalue'").byPage({ maxPageSize: 20 })) {
     *   if (response.blobs) {
     *     for (const blob of response.blobs) {
     *       console.log(`Blob ${i++}: ${blob.name}`);
     *     }
     *   }
     * }
     * ```
     *
     * Example using paging with a marker:
     *
     * ```js
     * let i = 1;
     * let iterator = blobServiceClient.findBlobsByTags("tagkey='tagvalue'").byPage({ maxPageSize: 2 });
     * let response = (await iterator.next()).value;
     *
     * // Prints 2 blob names
     * if (response.blobs) {
     *   for (const blob of response.blobs) {
     *     console.log(`Blob ${i++}: ${blob.name}`);
     *   }
     * }
     *
     * // Gets next marker
     * let marker = response.continuationToken;
     * // Passing next marker as continuationToken
     * iterator = blobServiceClient
     *   .findBlobsByTags("tagkey='tagvalue'")
     *   .byPage({ continuationToken: marker, maxPageSize: 10 });
     * response = (await iterator.next()).value;
     *
     * // Prints blob names
     * if (response.blobs) {
     *   for (const blob of response.blobs) {
     *      console.log(`Blob ${i++}: ${blob.name}`);
     *   }
     * }
     * ```
     *
     * @param tagFilterSqlExpression -  The where parameter enables the caller to query blobs whose tags match a given expression.
     *                                         The given expression must evaluate to true for a blob to be returned in the results.
     *                                         The[OData - ABNF] filter syntax rule defines the formal grammar for the value of the where query parameter;
     *                                         however, only a subset of the OData filter syntax is supported in the Blob service.
     * @param options - Options to find blobs by tags.
     */
    findBlobsByTags(tagFilterSqlExpression, options = {}) {
        // AsyncIterableIterator to iterate over blobs
        const listSegmentOptions = Object.assign({}, options);
        const iter = this.findBlobsByTagsItems(tagFilterSqlExpression, listSegmentOptions);
        return {
            /**
             * The next method, part of the iteration protocol
             */
            next() {
                return iter.next();
            },
            /**
             * The connection to the async iterator, part of the iteration protocol
             */
            [Symbol.asyncIterator]() {
                return this;
            },
            /**
             * Return an AsyncIterableIterator that works a page at a time
             */
            byPage: (settings = {}) => {
                return this.findBlobsByTagsSegments(tagFilterSqlExpression, settings.continuationToken, Object.assign({ maxPageSize: settings.maxPageSize }, listSegmentOptions));
            },
        };
    }
    /**
     * Returns an AsyncIterableIterator for ServiceListContainersSegmentResponses
     *
     * @param marker - A string value that identifies the portion of
     *                        the list of containers to be returned with the next listing operation. The
     *                        operation returns the continuationToken value within the response body if the
     *                        listing operation did not return all containers remaining to be listed
     *                        with the current page. The continuationToken value can be used as the value for
     *                        the marker parameter in a subsequent call to request the next page of list
     *                        items. The marker value is opaque to the client.
     * @param options - Options to list containers operation.
     */
    listSegments(marker, options = {}) {
        return __asyncGenerator(this, arguments, function* listSegments_1() {
            let listContainersSegmentResponse;
            if (!!marker || marker === undefined) {
                do {
                    listContainersSegmentResponse = yield __await(this.listContainersSegment(marker, options));
                    listContainersSegmentResponse.containerItems =
                        listContainersSegmentResponse.containerItems || [];
                    marker = listContainersSegmentResponse.continuationToken;
                    yield yield __await(yield __await(listContainersSegmentResponse));
                } while (marker);
            }
        });
    }
    /**
     * Returns an AsyncIterableIterator for Container Items
     *
     * @param options - Options to list containers operation.
     */
    listItems(options = {}) {
        return __asyncGenerator(this, arguments, function* listItems_1() {
            var e_2, _a;
            let marker;
            try {
                for (var _b = __asyncValues(this.listSegments(marker, options)), _c; _c = yield __await(_b.next()), !_c.done;) {
                    const segment = _c.value;
                    yield __await(yield* __asyncDelegator(__asyncValues(segment.containerItems)));
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) yield __await(_a.call(_b));
                }
                finally { if (e_2) throw e_2.error; }
            }
        });
    }
    /**
     * Returns an async iterable iterator to list all the containers
     * under the specified account.
     *
     * .byPage() returns an async iterable iterator to list the containers in pages.
     *
     * Example using `for await` syntax:
     *
     * ```js
     * let i = 1;
     * for await (const container of blobServiceClient.listContainers()) {
     *   console.log(`Container ${i++}: ${container.name}`);
     * }
     * ```
     *
     * Example using `iter.next()`:
     *
     * ```js
     * let i = 1;
     * const iter = blobServiceClient.listContainers();
     * let containerItem = await iter.next();
     * while (!containerItem.done) {
     *   console.log(`Container ${i++}: ${containerItem.value.name}`);
     *   containerItem = await iter.next();
     * }
     * ```
     *
     * Example using `byPage()`:
     *
     * ```js
     * // passing optional maxPageSize in the page settings
     * let i = 1;
     * for await (const response of blobServiceClient.listContainers().byPage({ maxPageSize: 20 })) {
     *   if (response.containerItems) {
     *     for (const container of response.containerItems) {
     *       console.log(`Container ${i++}: ${container.name}`);
     *     }
     *   }
     * }
     * ```
     *
     * Example using paging with a marker:
     *
     * ```js
     * let i = 1;
     * let iterator = blobServiceClient.listContainers().byPage({ maxPageSize: 2 });
     * let response = (await iterator.next()).value;
     *
     * // Prints 2 container names
     * if (response.containerItems) {
     *   for (const container of response.containerItems) {
     *     console.log(`Container ${i++}: ${container.name}`);
     *   }
     * }
     *
     * // Gets next marker
     * let marker = response.continuationToken;
     * // Passing next marker as continuationToken
     * iterator = blobServiceClient
     *   .listContainers()
     *   .byPage({ continuationToken: marker, maxPageSize: 10 });
     * response = (await iterator.next()).value;
     *
     * // Prints 10 container names
     * if (response.containerItems) {
     *   for (const container of response.containerItems) {
     *      console.log(`Container ${i++}: ${container.name}`);
     *   }
     * }
     * ```
     *
     * @param options - Options to list containers.
     * @returns An asyncIterableIterator that supports paging.
     */
    listContainers(options = {}) {
        if (options.prefix === "") {
            options.prefix = undefined;
        }
        const include = [];
        if (options.includeDeleted) {
            include.push("deleted");
        }
        if (options.includeMetadata) {
            include.push("metadata");
        }
        if (options.includeSystem) {
            include.push("system");
        }
        // AsyncIterableIterator to iterate over containers
        const listSegmentOptions = Object.assign(Object.assign({}, options), (include.length > 0 ? { include } : {}));
        const iter = this.listItems(listSegmentOptions);
        return {
            /**
             * The next method, part of the iteration protocol
             */
            next() {
                return iter.next();
            },
            /**
             * The connection to the async iterator, part of the iteration protocol
             */
            [Symbol.asyncIterator]() {
                return this;
            },
            /**
             * Return an AsyncIterableIterator that works a page at a time
             */
            byPage: (settings = {}) => {
                return this.listSegments(settings.continuationToken, Object.assign({ maxPageSize: settings.maxPageSize }, listSegmentOptions));
            },
        };
    }
    /**
     * ONLY AVAILABLE WHEN USING BEARER TOKEN AUTHENTICATION (TokenCredential).
     *
     * Retrieves a user delegation key for the Blob service. This is only a valid operation when using
     * bearer token authentication.
     *
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/get-user-delegation-key
     *
     * @param startsOn -      The start time for the user delegation SAS. Must be within 7 days of the current time
     * @param expiresOn -     The end time for the user delegation SAS. Must be within 7 days of the current time
     */
    async getUserDelegationKey(startsOn, expiresOn, options = {}) {
        const { span, updatedOptions } = createSpan("BlobServiceClient-getUserDelegationKey", options);
        try {
            const response = await this.serviceContext.getUserDelegationKey({
                startsOn: truncatedISO8061Date(startsOn, false),
                expiresOn: truncatedISO8061Date(expiresOn, false),
            }, Object.assign({ abortSignal: options.abortSignal }, convertTracingToRequestOptionsBase(updatedOptions)));
            const userDelegationKey = {
                signedObjectId: response.signedObjectId,
                signedTenantId: response.signedTenantId,
                signedStartsOn: new Date(response.signedStartsOn),
                signedExpiresOn: new Date(response.signedExpiresOn),
                signedService: response.signedService,
                signedVersion: response.signedVersion,
                value: response.value,
            };
            const res = Object.assign({ _response: response._response, requestId: response.requestId, clientRequestId: response.clientRequestId, version: response.version, date: response.date, errorCode: response.errorCode }, userDelegationKey);
            return res;
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
    /**
     * Creates a BlobBatchClient object to conduct batch operations.
     *
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/blob-batch
     *
     * @returns A new BlobBatchClient object for this service.
     */
    getBlobBatchClient() {
        return new BlobBatchClient(this.url, this.pipeline);
    }
    /**
     * Only available for BlobServiceClient constructed with a shared key credential.
     *
     * Generates a Blob account Shared Access Signature (SAS) URI based on the client properties
     * and parameters passed in. The SAS is signed by the shared key credential of the client.
     *
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/create-account-sas
     *
     * @param expiresOn - Optional. The time at which the shared access signature becomes invalid. Default to an hour later if not provided.
     * @param permissions - Specifies the list of permissions to be associated with the SAS.
     * @param resourceTypes - Specifies the resource types associated with the shared access signature.
     * @param options - Optional parameters.
     * @returns An account SAS URI consisting of the URI to the resource represented by this client, followed by the generated SAS token.
     */
    generateAccountSasUrl(expiresOn, permissions = AccountSASPermissions.parse("r"), resourceTypes = "sco", options = {}) {
        if (!(this.credential instanceof StorageSharedKeyCredential)) {
            throw RangeError("Can only generate the account SAS when the client is initialized with a shared key credential");
        }
        if (expiresOn === undefined) {
            const now = new Date();
            expiresOn = new Date(now.getTime() + 3600 * 1000);
        }
        const sas = generateAccountSASQueryParameters(Object.assign({ permissions,
            expiresOn,
            resourceTypes, services: AccountSASServices.parse("b").toString() }, options), this.credential).toString();
        return appendToURLQuery(this.url, sas);
    }
}
//# sourceMappingURL=BlobServiceClient.js.map