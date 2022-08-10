import { CommonRequestInfo, CommonRequestInit, CommonResponse, FetchHttpClient } from "./fetchHttpClient";
import { HttpOperationResponse } from "./httpOperationResponse";
import { WebResourceLike } from "./webResource";
export declare class NodeFetchHttpClient extends FetchHttpClient {
    private readonly cookieJar;
    fetch(input: CommonRequestInfo, init?: CommonRequestInit): Promise<CommonResponse>;
    prepareRequest(httpRequest: WebResourceLike): Promise<Partial<RequestInit>>;
    processRequest(operationResponse: HttpOperationResponse): Promise<void>;
}
//# sourceMappingURL=nodeFetchHttpClient.d.ts.map