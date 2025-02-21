"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheServiceClientProtobuf = exports.CacheServiceClientJSON = void 0;
const cache_1 = require("./cache");
class CacheServiceClientJSON {
    constructor(rpc) {
        this.rpc = rpc;
        this.CreateCacheEntry.bind(this);
        this.FinalizeCacheEntryUpload.bind(this);
        this.GetCacheEntryDownloadURL.bind(this);
    }
    CreateCacheEntry(request) {
        const data = cache_1.CreateCacheEntryRequest.toJson(request, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        });
        const promise = this.rpc.request("github.actions.results.api.v1.CacheService", "CreateCacheEntry", "application/json", data);
        return promise.then((data) => cache_1.CreateCacheEntryResponse.fromJson(data, {
            ignoreUnknownFields: true,
        }));
    }
    FinalizeCacheEntryUpload(request) {
        const data = cache_1.FinalizeCacheEntryUploadRequest.toJson(request, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        });
        const promise = this.rpc.request("github.actions.results.api.v1.CacheService", "FinalizeCacheEntryUpload", "application/json", data);
        return promise.then((data) => cache_1.FinalizeCacheEntryUploadResponse.fromJson(data, {
            ignoreUnknownFields: true,
        }));
    }
    GetCacheEntryDownloadURL(request) {
        const data = cache_1.GetCacheEntryDownloadURLRequest.toJson(request, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        });
        const promise = this.rpc.request("github.actions.results.api.v1.CacheService", "GetCacheEntryDownloadURL", "application/json", data);
        return promise.then((data) => cache_1.GetCacheEntryDownloadURLResponse.fromJson(data, {
            ignoreUnknownFields: true,
        }));
    }
}
exports.CacheServiceClientJSON = CacheServiceClientJSON;
class CacheServiceClientProtobuf {
    constructor(rpc) {
        this.rpc = rpc;
        this.CreateCacheEntry.bind(this);
        this.FinalizeCacheEntryUpload.bind(this);
        this.GetCacheEntryDownloadURL.bind(this);
    }
    CreateCacheEntry(request) {
        const data = cache_1.CreateCacheEntryRequest.toBinary(request);
        const promise = this.rpc.request("github.actions.results.api.v1.CacheService", "CreateCacheEntry", "application/protobuf", data);
        return promise.then((data) => cache_1.CreateCacheEntryResponse.fromBinary(data));
    }
    FinalizeCacheEntryUpload(request) {
        const data = cache_1.FinalizeCacheEntryUploadRequest.toBinary(request);
        const promise = this.rpc.request("github.actions.results.api.v1.CacheService", "FinalizeCacheEntryUpload", "application/protobuf", data);
        return promise.then((data) => cache_1.FinalizeCacheEntryUploadResponse.fromBinary(data));
    }
    GetCacheEntryDownloadURL(request) {
        const data = cache_1.GetCacheEntryDownloadURLRequest.toBinary(request);
        const promise = this.rpc.request("github.actions.results.api.v1.CacheService", "GetCacheEntryDownloadURL", "application/protobuf", data);
        return promise.then((data) => cache_1.GetCacheEntryDownloadURLResponse.fromBinary(data));
    }
}
exports.CacheServiceClientProtobuf = CacheServiceClientProtobuf;
//# sourceMappingURL=cache.twirp-client.js.map