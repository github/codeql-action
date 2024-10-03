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
exports.ClientStreamingCall = void 0;
/**
 * A client streaming RPC call. This means that the clients sends 0, 1, or
 * more messages to the server, and the server replies with exactly one
 * message.
 */
class ClientStreamingCall {
    constructor(method, requestHeaders, request, headers, response, status, trailers) {
        this.method = method;
        this.requestHeaders = requestHeaders;
        this.requests = request;
        this.headers = headers;
        this.response = response;
        this.status = status;
        this.trailers = trailers;
    }
    /**
     * Instead of awaiting the response status and trailers, you can
     * just as well await this call itself to receive the server outcome.
     * Note that it may still be valid to send more request messages.
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
                headers,
                response,
                status,
                trailers
            };
        });
    }
}
exports.ClientStreamingCall = ClientStreamingCall;
