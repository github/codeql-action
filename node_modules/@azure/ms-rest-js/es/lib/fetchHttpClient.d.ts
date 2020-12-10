import { HttpClient } from "./httpClient";
import { WebResourceLike } from "./webResource";
import { HttpOperationResponse } from "./httpOperationResponse";
import { HttpHeadersLike } from "./httpHeaders";
export declare abstract class FetchHttpClient implements HttpClient {
    sendRequest(httpRequest: WebResourceLike): Promise<HttpOperationResponse>;
    abstract prepareRequest(httpRequest: WebResourceLike): Promise<Partial<RequestInit>>;
    abstract processRequest(operationResponse: HttpOperationResponse): Promise<void>;
    abstract fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}
export declare function parseHeaders(headers: Headers): HttpHeadersLike;
//# sourceMappingURL=fetchHttpClient.d.ts.map