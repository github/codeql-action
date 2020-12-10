import { HttpOperationResponse } from "./httpOperationResponse";
import { WebResourceLike } from "./webResource";
export declare class RestError extends Error {
    static readonly REQUEST_SEND_ERROR: string;
    static readonly PARSE_ERROR: string;
    code?: string;
    statusCode?: number;
    request?: WebResourceLike;
    response?: HttpOperationResponse;
    details?: unknown;
    constructor(message: string, code?: string, statusCode?: number, request?: WebResourceLike, response?: HttpOperationResponse);
}
//# sourceMappingURL=restError.d.ts.map
