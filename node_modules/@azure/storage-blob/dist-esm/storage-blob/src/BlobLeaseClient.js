// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { generateUuid } from "@azure/core-http";
import { StorageClientContext } from "./generated/src/index";
import { SpanStatusCode } from "@azure/core-tracing";
import { Blob as StorageBlob, Container } from "./generated/src/operations";
import { ETagNone } from "./utils/constants";
import { convertTracingToRequestOptionsBase, createSpan } from "./utils/tracing";
/**
 * A client that manages leases for a {@link ContainerClient} or a {@link BlobClient}.
 */
export class BlobLeaseClient {
    /**
     * Creates an instance of BlobLeaseClient.
     * @param client - The client to make the lease operation requests.
     * @param leaseId - Initial proposed lease id.
     */
    constructor(client, leaseId) {
        const clientContext = new StorageClientContext(client.url, client.pipeline.toServiceClientOptions());
        this._url = client.url;
        if (client.name === undefined) {
            this._isContainer = true;
            this._containerOrBlobOperation = new Container(clientContext);
        }
        else {
            this._isContainer = false;
            this._containerOrBlobOperation = new StorageBlob(clientContext);
        }
        if (!leaseId) {
            leaseId = generateUuid();
        }
        this._leaseId = leaseId;
    }
    /**
     * Gets the lease Id.
     *
     * @readonly
     */
    get leaseId() {
        return this._leaseId;
    }
    /**
     * Gets the url.
     *
     * @readonly
     */
    get url() {
        return this._url;
    }
    /**
     * Establishes and manages a lock on a container for delete operations, or on a blob
     * for write and delete operations.
     * The lock duration can be 15 to 60 seconds, or can be infinite.
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
     * and
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-blob
     *
     * @param duration - Must be between 15 to 60 seconds, or infinite (-1)
     * @param options - option to configure lease management operations.
     * @returns Response data for acquire lease operation.
     */
    async acquireLease(duration, options = {}) {
        var _a, _b, _c, _d, _e, _f;
        const { span, updatedOptions } = createSpan("BlobLeaseClient-acquireLease", options);
        if (this._isContainer &&
            ((((_a = options.conditions) === null || _a === void 0 ? void 0 : _a.ifMatch) && ((_b = options.conditions) === null || _b === void 0 ? void 0 : _b.ifMatch) !== ETagNone) ||
                (((_c = options.conditions) === null || _c === void 0 ? void 0 : _c.ifNoneMatch) && ((_d = options.conditions) === null || _d === void 0 ? void 0 : _d.ifNoneMatch) !== ETagNone) ||
                ((_e = options.conditions) === null || _e === void 0 ? void 0 : _e.tagConditions))) {
            throw new RangeError("The IfMatch, IfNoneMatch and tags access conditions are ignored by the service. Values other than undefined or their default values are not acceptable.");
        }
        try {
            return await this._containerOrBlobOperation.acquireLease(Object.assign({ abortSignal: options.abortSignal, duration, modifiedAccessConditions: Object.assign(Object.assign({}, options.conditions), { ifTags: (_f = options.conditions) === null || _f === void 0 ? void 0 : _f.tagConditions }), proposedLeaseId: this._leaseId }, convertTracingToRequestOptionsBase(updatedOptions)));
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
     * To change the ID of the lease.
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
     * and
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-blob
     *
     * @param proposedLeaseId - the proposed new lease Id.
     * @param options - option to configure lease management operations.
     * @returns Response data for change lease operation.
     */
    async changeLease(proposedLeaseId, options = {}) {
        var _a, _b, _c, _d, _e, _f;
        const { span, updatedOptions } = createSpan("BlobLeaseClient-changeLease", options);
        if (this._isContainer &&
            ((((_a = options.conditions) === null || _a === void 0 ? void 0 : _a.ifMatch) && ((_b = options.conditions) === null || _b === void 0 ? void 0 : _b.ifMatch) !== ETagNone) ||
                (((_c = options.conditions) === null || _c === void 0 ? void 0 : _c.ifNoneMatch) && ((_d = options.conditions) === null || _d === void 0 ? void 0 : _d.ifNoneMatch) !== ETagNone) ||
                ((_e = options.conditions) === null || _e === void 0 ? void 0 : _e.tagConditions))) {
            throw new RangeError("The IfMatch, IfNoneMatch and tags access conditions are ignored by the service. Values other than undefined or their default values are not acceptable.");
        }
        try {
            const response = await this._containerOrBlobOperation.changeLease(this._leaseId, proposedLeaseId, Object.assign({ abortSignal: options.abortSignal, modifiedAccessConditions: Object.assign(Object.assign({}, options.conditions), { ifTags: (_f = options.conditions) === null || _f === void 0 ? void 0 : _f.tagConditions }) }, convertTracingToRequestOptionsBase(updatedOptions)));
            this._leaseId = proposedLeaseId;
            return response;
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
     * To free the lease if it is no longer needed so that another client may
     * immediately acquire a lease against the container or the blob.
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
     * and
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-blob
     *
     * @param options - option to configure lease management operations.
     * @returns Response data for release lease operation.
     */
    async releaseLease(options = {}) {
        var _a, _b, _c, _d, _e, _f;
        const { span, updatedOptions } = createSpan("BlobLeaseClient-releaseLease", options);
        if (this._isContainer &&
            ((((_a = options.conditions) === null || _a === void 0 ? void 0 : _a.ifMatch) && ((_b = options.conditions) === null || _b === void 0 ? void 0 : _b.ifMatch) !== ETagNone) ||
                (((_c = options.conditions) === null || _c === void 0 ? void 0 : _c.ifNoneMatch) && ((_d = options.conditions) === null || _d === void 0 ? void 0 : _d.ifNoneMatch) !== ETagNone) ||
                ((_e = options.conditions) === null || _e === void 0 ? void 0 : _e.tagConditions))) {
            throw new RangeError("The IfMatch, IfNoneMatch and tags access conditions are ignored by the service. Values other than undefined or their default values are not acceptable.");
        }
        try {
            return await this._containerOrBlobOperation.releaseLease(this._leaseId, Object.assign({ abortSignal: options.abortSignal, modifiedAccessConditions: Object.assign(Object.assign({}, options.conditions), { ifTags: (_f = options.conditions) === null || _f === void 0 ? void 0 : _f.tagConditions }) }, convertTracingToRequestOptionsBase(updatedOptions)));
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
     * To renew the lease.
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
     * and
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-blob
     *
     * @param options - Optional option to configure lease management operations.
     * @returns Response data for renew lease operation.
     */
    async renewLease(options = {}) {
        var _a, _b, _c, _d, _e, _f;
        const { span, updatedOptions } = createSpan("BlobLeaseClient-renewLease", options);
        if (this._isContainer &&
            ((((_a = options.conditions) === null || _a === void 0 ? void 0 : _a.ifMatch) && ((_b = options.conditions) === null || _b === void 0 ? void 0 : _b.ifMatch) !== ETagNone) ||
                (((_c = options.conditions) === null || _c === void 0 ? void 0 : _c.ifNoneMatch) && ((_d = options.conditions) === null || _d === void 0 ? void 0 : _d.ifNoneMatch) !== ETagNone) ||
                ((_e = options.conditions) === null || _e === void 0 ? void 0 : _e.tagConditions))) {
            throw new RangeError("The IfMatch, IfNoneMatch and tags access conditions are ignored by the service. Values other than undefined or their default values are not acceptable.");
        }
        try {
            return await this._containerOrBlobOperation.renewLease(this._leaseId, Object.assign({ abortSignal: options.abortSignal, modifiedAccessConditions: Object.assign(Object.assign({}, options.conditions), { ifTags: (_f = options.conditions) === null || _f === void 0 ? void 0 : _f.tagConditions }) }, convertTracingToRequestOptionsBase(updatedOptions)));
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
     * To end the lease but ensure that another client cannot acquire a new lease
     * until the current lease period has expired.
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
     * and
     * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-blob
     *
     * @param breakPeriod - Break period
     * @param options - Optional options to configure lease management operations.
     * @returns Response data for break lease operation.
     */
    async breakLease(breakPeriod, options = {}) {
        var _a, _b, _c, _d, _e, _f;
        const { span, updatedOptions } = createSpan("BlobLeaseClient-breakLease", options);
        if (this._isContainer &&
            ((((_a = options.conditions) === null || _a === void 0 ? void 0 : _a.ifMatch) && ((_b = options.conditions) === null || _b === void 0 ? void 0 : _b.ifMatch) !== ETagNone) ||
                (((_c = options.conditions) === null || _c === void 0 ? void 0 : _c.ifNoneMatch) && ((_d = options.conditions) === null || _d === void 0 ? void 0 : _d.ifNoneMatch) !== ETagNone) ||
                ((_e = options.conditions) === null || _e === void 0 ? void 0 : _e.tagConditions))) {
            throw new RangeError("The IfMatch, IfNoneMatch and tags access conditions are ignored by the service. Values other than undefined or their default values are not acceptable.");
        }
        try {
            const operationOptions = Object.assign({ abortSignal: options.abortSignal, breakPeriod, modifiedAccessConditions: Object.assign(Object.assign({}, options.conditions), { ifTags: (_f = options.conditions) === null || _f === void 0 ? void 0 : _f.tagConditions }) }, convertTracingToRequestOptionsBase(updatedOptions));
            return await this._containerOrBlobOperation.breakLease(operationOptions);
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
//# sourceMappingURL=BlobLeaseClient.js.map