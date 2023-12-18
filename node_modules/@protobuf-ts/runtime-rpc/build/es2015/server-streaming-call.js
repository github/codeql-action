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
 * A server streaming RPC call. The client provides exactly one input message
 * but the server may respond with 0, 1, or more messages.
 */
export class ServerStreamingCall {
    constructor(method, requestHeaders, request, headers, response, status, trailers) {
        this.method = method;
        this.requestHeaders = requestHeaders;
        this.request = request;
        this.headers = headers;
        this.responses = response;
        this.status = status;
        this.trailers = trailers;
    }
    /**
     * Instead of awaiting the response status and trailers, you can
     * just as well await this call itself to receive the server outcome.
     * You should first setup some listeners to the `request` to
     * see the actual messages the server replied with.
     */
    then(onfulfilled, onrejected) {
        return this.promiseFinished().then(value => onfulfilled ? Promise.resolve(onfulfilled(value)) : value, reason => onrejected ? Promise.resolve(onrejected(reason)) : Promise.reject(reason));
    }
    promiseFinished() {
        return __awaiter(this, void 0, void 0, function* () {
            let [headers, status, trailers] = yield Promise.all([this.headers, this.status, this.trailers]);
            return {
                method: this.method,
                requestHeaders: this.requestHeaders,
                request: this.request,
                headers,
                status,
                trailers,
            };
        });
    }
}
