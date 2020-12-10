import "node-fetch";
import { FetchHttpClient } from "./fetchHttpClient";
import { HttpOperationResponse } from "./httpOperationResponse";
import { WebResourceLike } from "./webResource";
export declare class NodeFetchHttpClient extends FetchHttpClient {
    private readonly cookieJar;
    fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
    prepareRequest(httpRequest: WebResourceLike): Promise<Partial<RequestInit>>;
    processRequest(operationResponse: HttpOperationResponse): Promise<void>;
}
//# sourceMappingURL=nodeFetchHttpClient.d.ts.map