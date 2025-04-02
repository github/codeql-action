import { CreateArtifactRequest, CreateArtifactResponse, FinalizeArtifactRequest, FinalizeArtifactResponse, ListArtifactsRequest, ListArtifactsResponse, GetSignedArtifactURLRequest, GetSignedArtifactURLResponse, DeleteArtifactRequest, DeleteArtifactResponse } from "./artifact";
interface Rpc {
    request(service: string, method: string, contentType: "application/json" | "application/protobuf", data: object | Uint8Array): Promise<object | Uint8Array>;
}
export interface ArtifactServiceClient {
    CreateArtifact(request: CreateArtifactRequest): Promise<CreateArtifactResponse>;
    FinalizeArtifact(request: FinalizeArtifactRequest): Promise<FinalizeArtifactResponse>;
    ListArtifacts(request: ListArtifactsRequest): Promise<ListArtifactsResponse>;
    GetSignedArtifactURL(request: GetSignedArtifactURLRequest): Promise<GetSignedArtifactURLResponse>;
    DeleteArtifact(request: DeleteArtifactRequest): Promise<DeleteArtifactResponse>;
}
export declare class ArtifactServiceClientJSON implements ArtifactServiceClient {
    private readonly rpc;
    constructor(rpc: Rpc);
    CreateArtifact(request: CreateArtifactRequest): Promise<CreateArtifactResponse>;
    FinalizeArtifact(request: FinalizeArtifactRequest): Promise<FinalizeArtifactResponse>;
    ListArtifacts(request: ListArtifactsRequest): Promise<ListArtifactsResponse>;
    GetSignedArtifactURL(request: GetSignedArtifactURLRequest): Promise<GetSignedArtifactURLResponse>;
    DeleteArtifact(request: DeleteArtifactRequest): Promise<DeleteArtifactResponse>;
}
export declare class ArtifactServiceClientProtobuf implements ArtifactServiceClient {
    private readonly rpc;
    constructor(rpc: Rpc);
    CreateArtifact(request: CreateArtifactRequest): Promise<CreateArtifactResponse>;
    FinalizeArtifact(request: FinalizeArtifactRequest): Promise<FinalizeArtifactResponse>;
    ListArtifacts(request: ListArtifactsRequest): Promise<ListArtifactsResponse>;
    GetSignedArtifactURL(request: GetSignedArtifactURLRequest): Promise<GetSignedArtifactURLResponse>;
    DeleteArtifact(request: DeleteArtifactRequest): Promise<DeleteArtifactResponse>;
}
export {};
