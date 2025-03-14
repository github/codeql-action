"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArtifactServiceClientProtobuf = exports.ArtifactServiceClientJSON = void 0;
const artifact_1 = require("./artifact");
class ArtifactServiceClientJSON {
    constructor(rpc) {
        this.rpc = rpc;
        this.CreateArtifact.bind(this);
        this.FinalizeArtifact.bind(this);
        this.ListArtifacts.bind(this);
        this.GetSignedArtifactURL.bind(this);
        this.DeleteArtifact.bind(this);
    }
    CreateArtifact(request) {
        const data = artifact_1.CreateArtifactRequest.toJson(request, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        });
        const promise = this.rpc.request("github.actions.results.api.v1.ArtifactService", "CreateArtifact", "application/json", data);
        return promise.then((data) => artifact_1.CreateArtifactResponse.fromJson(data, {
            ignoreUnknownFields: true,
        }));
    }
    FinalizeArtifact(request) {
        const data = artifact_1.FinalizeArtifactRequest.toJson(request, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        });
        const promise = this.rpc.request("github.actions.results.api.v1.ArtifactService", "FinalizeArtifact", "application/json", data);
        return promise.then((data) => artifact_1.FinalizeArtifactResponse.fromJson(data, {
            ignoreUnknownFields: true,
        }));
    }
    ListArtifacts(request) {
        const data = artifact_1.ListArtifactsRequest.toJson(request, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        });
        const promise = this.rpc.request("github.actions.results.api.v1.ArtifactService", "ListArtifacts", "application/json", data);
        return promise.then((data) => artifact_1.ListArtifactsResponse.fromJson(data, { ignoreUnknownFields: true }));
    }
    GetSignedArtifactURL(request) {
        const data = artifact_1.GetSignedArtifactURLRequest.toJson(request, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        });
        const promise = this.rpc.request("github.actions.results.api.v1.ArtifactService", "GetSignedArtifactURL", "application/json", data);
        return promise.then((data) => artifact_1.GetSignedArtifactURLResponse.fromJson(data, {
            ignoreUnknownFields: true,
        }));
    }
    DeleteArtifact(request) {
        const data = artifact_1.DeleteArtifactRequest.toJson(request, {
            useProtoFieldName: true,
            emitDefaultValues: false,
        });
        const promise = this.rpc.request("github.actions.results.api.v1.ArtifactService", "DeleteArtifact", "application/json", data);
        return promise.then((data) => artifact_1.DeleteArtifactResponse.fromJson(data, {
            ignoreUnknownFields: true,
        }));
    }
}
exports.ArtifactServiceClientJSON = ArtifactServiceClientJSON;
class ArtifactServiceClientProtobuf {
    constructor(rpc) {
        this.rpc = rpc;
        this.CreateArtifact.bind(this);
        this.FinalizeArtifact.bind(this);
        this.ListArtifacts.bind(this);
        this.GetSignedArtifactURL.bind(this);
        this.DeleteArtifact.bind(this);
    }
    CreateArtifact(request) {
        const data = artifact_1.CreateArtifactRequest.toBinary(request);
        const promise = this.rpc.request("github.actions.results.api.v1.ArtifactService", "CreateArtifact", "application/protobuf", data);
        return promise.then((data) => artifact_1.CreateArtifactResponse.fromBinary(data));
    }
    FinalizeArtifact(request) {
        const data = artifact_1.FinalizeArtifactRequest.toBinary(request);
        const promise = this.rpc.request("github.actions.results.api.v1.ArtifactService", "FinalizeArtifact", "application/protobuf", data);
        return promise.then((data) => artifact_1.FinalizeArtifactResponse.fromBinary(data));
    }
    ListArtifacts(request) {
        const data = artifact_1.ListArtifactsRequest.toBinary(request);
        const promise = this.rpc.request("github.actions.results.api.v1.ArtifactService", "ListArtifacts", "application/protobuf", data);
        return promise.then((data) => artifact_1.ListArtifactsResponse.fromBinary(data));
    }
    GetSignedArtifactURL(request) {
        const data = artifact_1.GetSignedArtifactURLRequest.toBinary(request);
        const promise = this.rpc.request("github.actions.results.api.v1.ArtifactService", "GetSignedArtifactURL", "application/protobuf", data);
        return promise.then((data) => artifact_1.GetSignedArtifactURLResponse.fromBinary(data));
    }
    DeleteArtifact(request) {
        const data = artifact_1.DeleteArtifactRequest.toBinary(request);
        const promise = this.rpc.request("github.actions.results.api.v1.ArtifactService", "DeleteArtifact", "application/protobuf", data);
        return promise.then((data) => artifact_1.DeleteArtifactResponse.fromBinary(data));
    }
}
exports.ArtifactServiceClientProtobuf = ArtifactServiceClientProtobuf;
//# sourceMappingURL=artifact.twirp-client.js.map