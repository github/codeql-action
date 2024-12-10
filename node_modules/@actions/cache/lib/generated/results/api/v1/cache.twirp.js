"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCacheServiceServer = exports.CacheServiceMethodList = exports.CacheServiceMethod = exports.CacheServiceClientProtobuf = exports.CacheServiceClientJSON = void 0;
const twirp_ts_1 = require("twirp-ts");
const cache_1 = require("./cache");
class CacheServiceClientJSON {
    constructor(rpc) {
        this.rpc = rpc;
        this.CreateCacheEntry.bind(this);
        this.FinalizeCacheEntryUpload.bind(this);
        this.GetCacheEntryDownloadURL.bind(this);
        this.DeleteCacheEntry.bind(this);
        this.ListCacheEntries.bind(this);
        this.LookupCacheEntry.bind(this);
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
    DeleteCacheEntry(request) {
        const data = cache_1.DeleteCacheEntryRequest.toJson(request, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        });
        const promise = this.rpc.request("github.actions.results.api.v1.CacheService", "DeleteCacheEntry", "application/json", data);
        return promise.then((data) => cache_1.DeleteCacheEntryResponse.fromJson(data, {
            ignoreUnknownFields: true,
        }));
    }
    ListCacheEntries(request) {
        const data = cache_1.ListCacheEntriesRequest.toJson(request, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        });
        const promise = this.rpc.request("github.actions.results.api.v1.CacheService", "ListCacheEntries", "application/json", data);
        return promise.then((data) => cache_1.ListCacheEntriesResponse.fromJson(data, {
            ignoreUnknownFields: true,
        }));
    }
    LookupCacheEntry(request) {
        const data = cache_1.LookupCacheEntryRequest.toJson(request, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        });
        const promise = this.rpc.request("github.actions.results.api.v1.CacheService", "LookupCacheEntry", "application/json", data);
        return promise.then((data) => cache_1.LookupCacheEntryResponse.fromJson(data, {
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
        this.DeleteCacheEntry.bind(this);
        this.ListCacheEntries.bind(this);
        this.LookupCacheEntry.bind(this);
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
    DeleteCacheEntry(request) {
        const data = cache_1.DeleteCacheEntryRequest.toBinary(request);
        const promise = this.rpc.request("github.actions.results.api.v1.CacheService", "DeleteCacheEntry", "application/protobuf", data);
        return promise.then((data) => cache_1.DeleteCacheEntryResponse.fromBinary(data));
    }
    ListCacheEntries(request) {
        const data = cache_1.ListCacheEntriesRequest.toBinary(request);
        const promise = this.rpc.request("github.actions.results.api.v1.CacheService", "ListCacheEntries", "application/protobuf", data);
        return promise.then((data) => cache_1.ListCacheEntriesResponse.fromBinary(data));
    }
    LookupCacheEntry(request) {
        const data = cache_1.LookupCacheEntryRequest.toBinary(request);
        const promise = this.rpc.request("github.actions.results.api.v1.CacheService", "LookupCacheEntry", "application/protobuf", data);
        return promise.then((data) => cache_1.LookupCacheEntryResponse.fromBinary(data));
    }
}
exports.CacheServiceClientProtobuf = CacheServiceClientProtobuf;
var CacheServiceMethod;
(function (CacheServiceMethod) {
    CacheServiceMethod["CreateCacheEntry"] = "CreateCacheEntry";
    CacheServiceMethod["FinalizeCacheEntryUpload"] = "FinalizeCacheEntryUpload";
    CacheServiceMethod["GetCacheEntryDownloadURL"] = "GetCacheEntryDownloadURL";
    CacheServiceMethod["DeleteCacheEntry"] = "DeleteCacheEntry";
    CacheServiceMethod["ListCacheEntries"] = "ListCacheEntries";
    CacheServiceMethod["LookupCacheEntry"] = "LookupCacheEntry";
})(CacheServiceMethod || (exports.CacheServiceMethod = CacheServiceMethod = {}));
exports.CacheServiceMethodList = [
    CacheServiceMethod.CreateCacheEntry,
    CacheServiceMethod.FinalizeCacheEntryUpload,
    CacheServiceMethod.GetCacheEntryDownloadURL,
    CacheServiceMethod.DeleteCacheEntry,
    CacheServiceMethod.ListCacheEntries,
    CacheServiceMethod.LookupCacheEntry,
];
function createCacheServiceServer(service) {
    return new twirp_ts_1.TwirpServer({
        service,
        packageName: "github.actions.results.api.v1",
        serviceName: "CacheService",
        methodList: exports.CacheServiceMethodList,
        matchRoute: matchCacheServiceRoute,
    });
}
exports.createCacheServiceServer = createCacheServiceServer;
function matchCacheServiceRoute(method, events) {
    switch (method) {
        case "CreateCacheEntry":
            return (ctx, service, data, interceptors) => __awaiter(this, void 0, void 0, function* () {
                ctx = Object.assign(Object.assign({}, ctx), { methodName: "CreateCacheEntry" });
                yield events.onMatch(ctx);
                return handleCacheServiceCreateCacheEntryRequest(ctx, service, data, interceptors);
            });
        case "FinalizeCacheEntryUpload":
            return (ctx, service, data, interceptors) => __awaiter(this, void 0, void 0, function* () {
                ctx = Object.assign(Object.assign({}, ctx), { methodName: "FinalizeCacheEntryUpload" });
                yield events.onMatch(ctx);
                return handleCacheServiceFinalizeCacheEntryUploadRequest(ctx, service, data, interceptors);
            });
        case "GetCacheEntryDownloadURL":
            return (ctx, service, data, interceptors) => __awaiter(this, void 0, void 0, function* () {
                ctx = Object.assign(Object.assign({}, ctx), { methodName: "GetCacheEntryDownloadURL" });
                yield events.onMatch(ctx);
                return handleCacheServiceGetCacheEntryDownloadURLRequest(ctx, service, data, interceptors);
            });
        case "DeleteCacheEntry":
            return (ctx, service, data, interceptors) => __awaiter(this, void 0, void 0, function* () {
                ctx = Object.assign(Object.assign({}, ctx), { methodName: "DeleteCacheEntry" });
                yield events.onMatch(ctx);
                return handleCacheServiceDeleteCacheEntryRequest(ctx, service, data, interceptors);
            });
        case "ListCacheEntries":
            return (ctx, service, data, interceptors) => __awaiter(this, void 0, void 0, function* () {
                ctx = Object.assign(Object.assign({}, ctx), { methodName: "ListCacheEntries" });
                yield events.onMatch(ctx);
                return handleCacheServiceListCacheEntriesRequest(ctx, service, data, interceptors);
            });
        case "LookupCacheEntry":
            return (ctx, service, data, interceptors) => __awaiter(this, void 0, void 0, function* () {
                ctx = Object.assign(Object.assign({}, ctx), { methodName: "LookupCacheEntry" });
                yield events.onMatch(ctx);
                return handleCacheServiceLookupCacheEntryRequest(ctx, service, data, interceptors);
            });
        default:
            events.onNotFound();
            const msg = `no handler found`;
            throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.BadRoute, msg);
    }
}
function handleCacheServiceCreateCacheEntryRequest(ctx, service, data, interceptors) {
    switch (ctx.contentType) {
        case twirp_ts_1.TwirpContentType.JSON:
            return handleCacheServiceCreateCacheEntryJSON(ctx, service, data, interceptors);
        case twirp_ts_1.TwirpContentType.Protobuf:
            return handleCacheServiceCreateCacheEntryProtobuf(ctx, service, data, interceptors);
        default:
            const msg = "unexpected Content-Type";
            throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.BadRoute, msg);
    }
}
function handleCacheServiceFinalizeCacheEntryUploadRequest(ctx, service, data, interceptors) {
    switch (ctx.contentType) {
        case twirp_ts_1.TwirpContentType.JSON:
            return handleCacheServiceFinalizeCacheEntryUploadJSON(ctx, service, data, interceptors);
        case twirp_ts_1.TwirpContentType.Protobuf:
            return handleCacheServiceFinalizeCacheEntryUploadProtobuf(ctx, service, data, interceptors);
        default:
            const msg = "unexpected Content-Type";
            throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.BadRoute, msg);
    }
}
function handleCacheServiceGetCacheEntryDownloadURLRequest(ctx, service, data, interceptors) {
    switch (ctx.contentType) {
        case twirp_ts_1.TwirpContentType.JSON:
            return handleCacheServiceGetCacheEntryDownloadURLJSON(ctx, service, data, interceptors);
        case twirp_ts_1.TwirpContentType.Protobuf:
            return handleCacheServiceGetCacheEntryDownloadURLProtobuf(ctx, service, data, interceptors);
        default:
            const msg = "unexpected Content-Type";
            throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.BadRoute, msg);
    }
}
function handleCacheServiceDeleteCacheEntryRequest(ctx, service, data, interceptors) {
    switch (ctx.contentType) {
        case twirp_ts_1.TwirpContentType.JSON:
            return handleCacheServiceDeleteCacheEntryJSON(ctx, service, data, interceptors);
        case twirp_ts_1.TwirpContentType.Protobuf:
            return handleCacheServiceDeleteCacheEntryProtobuf(ctx, service, data, interceptors);
        default:
            const msg = "unexpected Content-Type";
            throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.BadRoute, msg);
    }
}
function handleCacheServiceListCacheEntriesRequest(ctx, service, data, interceptors) {
    switch (ctx.contentType) {
        case twirp_ts_1.TwirpContentType.JSON:
            return handleCacheServiceListCacheEntriesJSON(ctx, service, data, interceptors);
        case twirp_ts_1.TwirpContentType.Protobuf:
            return handleCacheServiceListCacheEntriesProtobuf(ctx, service, data, interceptors);
        default:
            const msg = "unexpected Content-Type";
            throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.BadRoute, msg);
    }
}
function handleCacheServiceLookupCacheEntryRequest(ctx, service, data, interceptors) {
    switch (ctx.contentType) {
        case twirp_ts_1.TwirpContentType.JSON:
            return handleCacheServiceLookupCacheEntryJSON(ctx, service, data, interceptors);
        case twirp_ts_1.TwirpContentType.Protobuf:
            return handleCacheServiceLookupCacheEntryProtobuf(ctx, service, data, interceptors);
        default:
            const msg = "unexpected Content-Type";
            throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.BadRoute, msg);
    }
}
function handleCacheServiceCreateCacheEntryJSON(ctx, service, data, interceptors) {
    return __awaiter(this, void 0, void 0, function* () {
        let request;
        let response;
        try {
            const body = JSON.parse(data.toString() || "{}");
            request = cache_1.CreateCacheEntryRequest.fromJson(body, {
                ignoreUnknownFields: true,
            });
        }
        catch (e) {
            if (e instanceof Error) {
                const msg = "the json request could not be decoded";
                throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.Malformed, msg).withCause(e, true);
            }
        }
        if (interceptors && interceptors.length > 0) {
            const interceptor = (0, twirp_ts_1.chainInterceptors)(...interceptors);
            response = yield interceptor(ctx, request, (ctx, inputReq) => {
                return service.CreateCacheEntry(ctx, inputReq);
            });
        }
        else {
            response = yield service.CreateCacheEntry(ctx, request);
        }
        return JSON.stringify(cache_1.CreateCacheEntryResponse.toJson(response, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        }));
    });
}
function handleCacheServiceFinalizeCacheEntryUploadJSON(ctx, service, data, interceptors) {
    return __awaiter(this, void 0, void 0, function* () {
        let request;
        let response;
        try {
            const body = JSON.parse(data.toString() || "{}");
            request = cache_1.FinalizeCacheEntryUploadRequest.fromJson(body, {
                ignoreUnknownFields: true,
            });
        }
        catch (e) {
            if (e instanceof Error) {
                const msg = "the json request could not be decoded";
                throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.Malformed, msg).withCause(e, true);
            }
        }
        if (interceptors && interceptors.length > 0) {
            const interceptor = (0, twirp_ts_1.chainInterceptors)(...interceptors);
            response = yield interceptor(ctx, request, (ctx, inputReq) => {
                return service.FinalizeCacheEntryUpload(ctx, inputReq);
            });
        }
        else {
            response = yield service.FinalizeCacheEntryUpload(ctx, request);
        }
        return JSON.stringify(cache_1.FinalizeCacheEntryUploadResponse.toJson(response, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        }));
    });
}
function handleCacheServiceGetCacheEntryDownloadURLJSON(ctx, service, data, interceptors) {
    return __awaiter(this, void 0, void 0, function* () {
        let request;
        let response;
        try {
            const body = JSON.parse(data.toString() || "{}");
            request = cache_1.GetCacheEntryDownloadURLRequest.fromJson(body, {
                ignoreUnknownFields: true,
            });
        }
        catch (e) {
            if (e instanceof Error) {
                const msg = "the json request could not be decoded";
                throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.Malformed, msg).withCause(e, true);
            }
        }
        if (interceptors && interceptors.length > 0) {
            const interceptor = (0, twirp_ts_1.chainInterceptors)(...interceptors);
            response = yield interceptor(ctx, request, (ctx, inputReq) => {
                return service.GetCacheEntryDownloadURL(ctx, inputReq);
            });
        }
        else {
            response = yield service.GetCacheEntryDownloadURL(ctx, request);
        }
        return JSON.stringify(cache_1.GetCacheEntryDownloadURLResponse.toJson(response, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        }));
    });
}
function handleCacheServiceDeleteCacheEntryJSON(ctx, service, data, interceptors) {
    return __awaiter(this, void 0, void 0, function* () {
        let request;
        let response;
        try {
            const body = JSON.parse(data.toString() || "{}");
            request = cache_1.DeleteCacheEntryRequest.fromJson(body, {
                ignoreUnknownFields: true,
            });
        }
        catch (e) {
            if (e instanceof Error) {
                const msg = "the json request could not be decoded";
                throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.Malformed, msg).withCause(e, true);
            }
        }
        if (interceptors && interceptors.length > 0) {
            const interceptor = (0, twirp_ts_1.chainInterceptors)(...interceptors);
            response = yield interceptor(ctx, request, (ctx, inputReq) => {
                return service.DeleteCacheEntry(ctx, inputReq);
            });
        }
        else {
            response = yield service.DeleteCacheEntry(ctx, request);
        }
        return JSON.stringify(cache_1.DeleteCacheEntryResponse.toJson(response, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        }));
    });
}
function handleCacheServiceListCacheEntriesJSON(ctx, service, data, interceptors) {
    return __awaiter(this, void 0, void 0, function* () {
        let request;
        let response;
        try {
            const body = JSON.parse(data.toString() || "{}");
            request = cache_1.ListCacheEntriesRequest.fromJson(body, {
                ignoreUnknownFields: true,
            });
        }
        catch (e) {
            if (e instanceof Error) {
                const msg = "the json request could not be decoded";
                throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.Malformed, msg).withCause(e, true);
            }
        }
        if (interceptors && interceptors.length > 0) {
            const interceptor = (0, twirp_ts_1.chainInterceptors)(...interceptors);
            response = yield interceptor(ctx, request, (ctx, inputReq) => {
                return service.ListCacheEntries(ctx, inputReq);
            });
        }
        else {
            response = yield service.ListCacheEntries(ctx, request);
        }
        return JSON.stringify(cache_1.ListCacheEntriesResponse.toJson(response, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        }));
    });
}
function handleCacheServiceLookupCacheEntryJSON(ctx, service, data, interceptors) {
    return __awaiter(this, void 0, void 0, function* () {
        let request;
        let response;
        try {
            const body = JSON.parse(data.toString() || "{}");
            request = cache_1.LookupCacheEntryRequest.fromJson(body, {
                ignoreUnknownFields: true,
            });
        }
        catch (e) {
            if (e instanceof Error) {
                const msg = "the json request could not be decoded";
                throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.Malformed, msg).withCause(e, true);
            }
        }
        if (interceptors && interceptors.length > 0) {
            const interceptor = (0, twirp_ts_1.chainInterceptors)(...interceptors);
            response = yield interceptor(ctx, request, (ctx, inputReq) => {
                return service.LookupCacheEntry(ctx, inputReq);
            });
        }
        else {
            response = yield service.LookupCacheEntry(ctx, request);
        }
        return JSON.stringify(cache_1.LookupCacheEntryResponse.toJson(response, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        }));
    });
}
function handleCacheServiceCreateCacheEntryProtobuf(ctx, service, data, interceptors) {
    return __awaiter(this, void 0, void 0, function* () {
        let request;
        let response;
        try {
            request = cache_1.CreateCacheEntryRequest.fromBinary(data);
        }
        catch (e) {
            if (e instanceof Error) {
                const msg = "the protobuf request could not be decoded";
                throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.Malformed, msg).withCause(e, true);
            }
        }
        if (interceptors && interceptors.length > 0) {
            const interceptor = (0, twirp_ts_1.chainInterceptors)(...interceptors);
            response = yield interceptor(ctx, request, (ctx, inputReq) => {
                return service.CreateCacheEntry(ctx, inputReq);
            });
        }
        else {
            response = yield service.CreateCacheEntry(ctx, request);
        }
        return Buffer.from(cache_1.CreateCacheEntryResponse.toBinary(response));
    });
}
function handleCacheServiceFinalizeCacheEntryUploadProtobuf(ctx, service, data, interceptors) {
    return __awaiter(this, void 0, void 0, function* () {
        let request;
        let response;
        try {
            request = cache_1.FinalizeCacheEntryUploadRequest.fromBinary(data);
        }
        catch (e) {
            if (e instanceof Error) {
                const msg = "the protobuf request could not be decoded";
                throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.Malformed, msg).withCause(e, true);
            }
        }
        if (interceptors && interceptors.length > 0) {
            const interceptor = (0, twirp_ts_1.chainInterceptors)(...interceptors);
            response = yield interceptor(ctx, request, (ctx, inputReq) => {
                return service.FinalizeCacheEntryUpload(ctx, inputReq);
            });
        }
        else {
            response = yield service.FinalizeCacheEntryUpload(ctx, request);
        }
        return Buffer.from(cache_1.FinalizeCacheEntryUploadResponse.toBinary(response));
    });
}
function handleCacheServiceGetCacheEntryDownloadURLProtobuf(ctx, service, data, interceptors) {
    return __awaiter(this, void 0, void 0, function* () {
        let request;
        let response;
        try {
            request = cache_1.GetCacheEntryDownloadURLRequest.fromBinary(data);
        }
        catch (e) {
            if (e instanceof Error) {
                const msg = "the protobuf request could not be decoded";
                throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.Malformed, msg).withCause(e, true);
            }
        }
        if (interceptors && interceptors.length > 0) {
            const interceptor = (0, twirp_ts_1.chainInterceptors)(...interceptors);
            response = yield interceptor(ctx, request, (ctx, inputReq) => {
                return service.GetCacheEntryDownloadURL(ctx, inputReq);
            });
        }
        else {
            response = yield service.GetCacheEntryDownloadURL(ctx, request);
        }
        return Buffer.from(cache_1.GetCacheEntryDownloadURLResponse.toBinary(response));
    });
}
function handleCacheServiceDeleteCacheEntryProtobuf(ctx, service, data, interceptors) {
    return __awaiter(this, void 0, void 0, function* () {
        let request;
        let response;
        try {
            request = cache_1.DeleteCacheEntryRequest.fromBinary(data);
        }
        catch (e) {
            if (e instanceof Error) {
                const msg = "the protobuf request could not be decoded";
                throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.Malformed, msg).withCause(e, true);
            }
        }
        if (interceptors && interceptors.length > 0) {
            const interceptor = (0, twirp_ts_1.chainInterceptors)(...interceptors);
            response = yield interceptor(ctx, request, (ctx, inputReq) => {
                return service.DeleteCacheEntry(ctx, inputReq);
            });
        }
        else {
            response = yield service.DeleteCacheEntry(ctx, request);
        }
        return Buffer.from(cache_1.DeleteCacheEntryResponse.toBinary(response));
    });
}
function handleCacheServiceListCacheEntriesProtobuf(ctx, service, data, interceptors) {
    return __awaiter(this, void 0, void 0, function* () {
        let request;
        let response;
        try {
            request = cache_1.ListCacheEntriesRequest.fromBinary(data);
        }
        catch (e) {
            if (e instanceof Error) {
                const msg = "the protobuf request could not be decoded";
                throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.Malformed, msg).withCause(e, true);
            }
        }
        if (interceptors && interceptors.length > 0) {
            const interceptor = (0, twirp_ts_1.chainInterceptors)(...interceptors);
            response = yield interceptor(ctx, request, (ctx, inputReq) => {
                return service.ListCacheEntries(ctx, inputReq);
            });
        }
        else {
            response = yield service.ListCacheEntries(ctx, request);
        }
        return Buffer.from(cache_1.ListCacheEntriesResponse.toBinary(response));
    });
}
function handleCacheServiceLookupCacheEntryProtobuf(ctx, service, data, interceptors) {
    return __awaiter(this, void 0, void 0, function* () {
        let request;
        let response;
        try {
            request = cache_1.LookupCacheEntryRequest.fromBinary(data);
        }
        catch (e) {
            if (e instanceof Error) {
                const msg = "the protobuf request could not be decoded";
                throw new twirp_ts_1.TwirpError(twirp_ts_1.TwirpErrorCode.Malformed, msg).withCause(e, true);
            }
        }
        if (interceptors && interceptors.length > 0) {
            const interceptor = (0, twirp_ts_1.chainInterceptors)(...interceptors);
            response = yield interceptor(ctx, request, (ctx, inputReq) => {
                return service.LookupCacheEntry(ctx, inputReq);
            });
        }
        else {
            response = yield service.LookupCacheEntry(ctx, request);
        }
        return Buffer.from(cache_1.LookupCacheEntryResponse.toBinary(response));
    });
}
//# sourceMappingURL=cache.twirp.js.map