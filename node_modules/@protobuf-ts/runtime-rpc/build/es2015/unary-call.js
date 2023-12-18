var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/**
 * A unary RPC call. Unary means there is exactly one input message and
 * exactly one output message unless an error occurred.
 */
export class UnaryCall {
    constructor(method, requestHeaders, request, headers, response, status, trailers) {
        this.method = method;
        this.requestHeaders = requestHeaders;
        this.request = request;
        this.headers = headers;
        this.response = response;
        this.status = status;
        this.trailers = trailers;
    }
    /**
     * If you are only interested in the final outcome of this call,
     * you can await it to receive a `FinishedUnaryCall`.
     */
    then(onfulfilled, onrejected) {
        return this.promiseFinished().then(value => onfulfilled ? Promise.resolve(onfulfilled(value)) : value, reason => onrejected ? Promise.resolve(onrejected(reason)) : Promise.reject(reason));
    }
    promiseFinished() {
        return __awaiter(this, void 0, void 0, function* () {
            let [headers, response, status, trailers] = yield Promise.all([this.headers, this.response, this.status, this.trailers]);
            return {
                method: this.method,
                requestHeaders: this.requestHeaders,
                request: this.request,
                headers,
                response,
                status,
                trailers
            };
        });
    }
}
