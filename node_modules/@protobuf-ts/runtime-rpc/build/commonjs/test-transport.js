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
exports.TestTransport = void 0;
const rpc_error_1 = require("./rpc-error");
const runtime_1 = require("@protobuf-ts/runtime");
const rpc_output_stream_1 = require("./rpc-output-stream");
const rpc_options_1 = require("./rpc-options");
const unary_call_1 = require("./unary-call");
const server_streaming_call_1 = require("./server-streaming-call");
const client_streaming_call_1 = require("./client-streaming-call");
const duplex_streaming_call_1 = require("./duplex-streaming-call");
/**
 * Transport for testing.
 */
class TestTransport {
    /**
     * Initialize with mock data. Omitted fields have default value.
     */
    constructor(data) {
        /**
         * Suppress warning / error about uncaught rejections of
         * "status" and "trailers".
         */
        this.suppressUncaughtRejections = true;
        this.headerDelay = 10;
        this.responseDelay = 50;
        this.betweenResponseDelay = 10;
        this.afterResponseDelay = 10;
        this.data = data !== null && data !== void 0 ? data : {};
    }
    /**
     * Sent message(s) during the last operation.
     */
    get sentMessages() {
        if (this.lastInput instanceof TestInputStream) {
            return this.lastInput.sent;
        }
        else if (typeof this.lastInput == "object") {
            return [this.lastInput.single];
        }
        return [];
    }
    /**
     * Sending message(s) completed?
     */
    get sendComplete() {
        if (this.lastInput instanceof TestInputStream) {
            return this.lastInput.completed;
        }
        else if (typeof this.lastInput == "object") {
            return true;
        }
        return false;
    }
    // Creates a promise for response headers from the mock data.
    promiseHeaders() {
        var _a;
        const headers = (_a = this.data.headers) !== null && _a !== void 0 ? _a : TestTransport.defaultHeaders;
        return headers instanceof rpc_error_1.RpcError
            ? Promise.reject(headers)
            : Promise.resolve(headers);
    }
    // Creates a promise for a single, valid, message from the mock data.
    promiseSingleResponse(method) {
        if (this.data.response instanceof rpc_error_1.RpcError) {
            return Promise.reject(this.data.response);
        }
        let r;
        if (Array.isArray(this.data.response)) {
            runtime_1.assert(this.data.response.length > 0);
            r = this.data.response[0];
        }
        else if (this.data.response !== undefined) {
            r = this.data.response;
        }
        else {
            r = method.O.create();
        }
        runtime_1.assert(method.O.is(r));
        return Promise.resolve(r);
    }
    /**
     * Pushes response messages from the mock data to the output stream.
     * If an error response, status or trailers are mocked, the stream is
     * closed with the respective error.
     * Otherwise, stream is completed successfully.
     *
     * The returned promise resolves when the stream is closed. It should
     * not reject. If it does, code is broken.
     */
    streamResponses(method, stream, abort) {
        return __awaiter(this, void 0, void 0, function* () {
            // normalize "data.response" into an array of valid output messages
            const messages = [];
            if (this.data.response === undefined) {
                messages.push(method.O.create());
            }
            else if (Array.isArray(this.data.response)) {
                for (let msg of this.data.response) {
                    runtime_1.assert(method.O.is(msg));
                    messages.push(msg);
                }
            }
            else if (!(this.data.response instanceof rpc_error_1.RpcError)) {
                runtime_1.assert(method.O.is(this.data.response));
                messages.push(this.data.response);
            }
            // start the stream with an initial delay.
            // if the request is cancelled, notify() error and exit.
            try {
                yield delay(this.responseDelay, abort)(undefined);
            }
            catch (error) {
                stream.notifyError(error);
                return;
            }
            // if error response was mocked, notify() error (stream is now closed with error) and exit.
            if (this.data.response instanceof rpc_error_1.RpcError) {
                stream.notifyError(this.data.response);
                return;
            }
            // regular response messages were mocked. notify() them.
            for (let msg of messages) {
                stream.notifyMessage(msg);
                // add a short delay between responses
                // if the request is cancelled, notify() error and exit.
                try {
                    yield delay(this.betweenResponseDelay, abort)(undefined);
                }
                catch (error) {
                    stream.notifyError(error);
                    return;
                }
            }
            // error status was mocked, notify() error (stream is now closed with error) and exit.
            if (this.data.status instanceof rpc_error_1.RpcError) {
                stream.notifyError(this.data.status);
                return;
            }
            // error trailers were mocked, notify() error (stream is now closed with error) and exit.
            if (this.data.trailers instanceof rpc_error_1.RpcError) {
                stream.notifyError(this.data.trailers);
                return;
            }
            // stream completed successfully
            stream.notifyComplete();
        });
    }
    // Creates a promise for response status from the mock data.
    promiseStatus() {
        var _a;
        const status = (_a = this.data.status) !== null && _a !== void 0 ? _a : TestTransport.defaultStatus;
        return status instanceof rpc_error_1.RpcError
            ? Promise.reject(status)
            : Promise.resolve(status);
    }
    // Creates a promise for response trailers from the mock data.
    promiseTrailers() {
        var _a;
        const trailers = (_a = this.data.trailers) !== null && _a !== void 0 ? _a : TestTransport.defaultTrailers;
        return trailers instanceof rpc_error_1.RpcError
            ? Promise.reject(trailers)
            : Promise.resolve(trailers);
    }
    maybeSuppressUncaught(...promise) {
        if (this.suppressUncaughtRejections) {
            for (let p of promise) {
                p.catch(() => {
                });
            }
        }
    }
    mergeOptions(options) {
        return rpc_options_1.mergeRpcOptions({}, options);
    }
    unary(method, input, options) {
        var _a;
        const requestHeaders = (_a = options.meta) !== null && _a !== void 0 ? _a : {}, headersPromise = this.promiseHeaders()
            .then(delay(this.headerDelay, options.abort)), responsePromise = headersPromise
            .catch(_ => {
        })
            .then(delay(this.responseDelay, options.abort))
            .then(_ => this.promiseSingleResponse(method)), statusPromise = responsePromise
            .catch(_ => {
        })
            .then(delay(this.afterResponseDelay, options.abort))
            .then(_ => this.promiseStatus()), trailersPromise = responsePromise
            .catch(_ => {
        })
            .then(delay(this.afterResponseDelay, options.abort))
            .then(_ => this.promiseTrailers());
        this.maybeSuppressUncaught(statusPromise, trailersPromise);
        this.lastInput = { single: input };
        return new unary_call_1.UnaryCall(method, requestHeaders, input, headersPromise, responsePromise, statusPromise, trailersPromise);
    }
    serverStreaming(method, input, options) {
        var _a;
        const requestHeaders = (_a = options.meta) !== null && _a !== void 0 ? _a : {}, headersPromise = this.promiseHeaders()
            .then(delay(this.headerDelay, options.abort)), outputStream = new rpc_output_stream_1.RpcOutputStreamController(), responseStreamClosedPromise = headersPromise
            .then(delay(this.responseDelay, options.abort))
            .catch(() => {
        })
            .then(() => this.streamResponses(method, outputStream, options.abort))
            .then(delay(this.afterResponseDelay, options.abort)), statusPromise = responseStreamClosedPromise
            .then(() => this.promiseStatus()), trailersPromise = responseStreamClosedPromise
            .then(() => this.promiseTrailers());
        this.maybeSuppressUncaught(statusPromise, trailersPromise);
        this.lastInput = { single: input };
        return new server_streaming_call_1.ServerStreamingCall(method, requestHeaders, input, headersPromise, outputStream, statusPromise, trailersPromise);
    }
    clientStreaming(method, options) {
        var _a;
        const requestHeaders = (_a = options.meta) !== null && _a !== void 0 ? _a : {}, headersPromise = this.promiseHeaders()
            .then(delay(this.headerDelay, options.abort)), responsePromise = headersPromise
            .catch(_ => {
        })
            .then(delay(this.responseDelay, options.abort))
            .then(_ => this.promiseSingleResponse(method)), statusPromise = responsePromise
            .catch(_ => {
        })
            .then(delay(this.afterResponseDelay, options.abort))
            .then(_ => this.promiseStatus()), trailersPromise = responsePromise
            .catch(_ => {
        })
            .then(delay(this.afterResponseDelay, options.abort))
            .then(_ => this.promiseTrailers());
        this.maybeSuppressUncaught(statusPromise, trailersPromise);
        this.lastInput = new TestInputStream(this.data, options.abort);
        return new client_streaming_call_1.ClientStreamingCall(method, requestHeaders, this.lastInput, headersPromise, responsePromise, statusPromise, trailersPromise);
    }
    duplex(method, options) {
        var _a;
        const requestHeaders = (_a = options.meta) !== null && _a !== void 0 ? _a : {}, headersPromise = this.promiseHeaders()
            .then(delay(this.headerDelay, options.abort)), outputStream = new rpc_output_stream_1.RpcOutputStreamController(), responseStreamClosedPromise = headersPromise
            .then(delay(this.responseDelay, options.abort))
            .catch(() => {
        })
            .then(() => this.streamResponses(method, outputStream, options.abort))
            .then(delay(this.afterResponseDelay, options.abort)), statusPromise = responseStreamClosedPromise
            .then(() => this.promiseStatus()), trailersPromise = responseStreamClosedPromise
            .then(() => this.promiseTrailers());
        this.maybeSuppressUncaught(statusPromise, trailersPromise);
        this.lastInput = new TestInputStream(this.data, options.abort);
        return new duplex_streaming_call_1.DuplexStreamingCall(method, requestHeaders, this.lastInput, headersPromise, outputStream, statusPromise, trailersPromise);
    }
}
exports.TestTransport = TestTransport;
TestTransport.defaultHeaders = {
    responseHeader: "test"
};
TestTransport.defaultStatus = {
    code: "OK", detail: "all good"
};
TestTransport.defaultTrailers = {
    responseTrailer: "test"
};
function delay(ms, abort) {
    return (v) => new Promise((resolve, reject) => {
        if (abort === null || abort === void 0 ? void 0 : abort.aborted) {
            reject(new rpc_error_1.RpcError("user cancel", "CANCELLED"));
        }
        else {
            const id = setTimeout(() => resolve(v), ms);
            if (abort) {
                abort.addEventListener("abort", ev => {
                    clearTimeout(id);
                    reject(new rpc_error_1.RpcError("user cancel", "CANCELLED"));
                });
            }
        }
    });
}
class TestInputStream {
    constructor(data, abort) {
        this._completed = false;
        this._sent = [];
        this.data = data;
        this.abort = abort;
    }
    get sent() {
        return this._sent;
    }
    get completed() {
        return this._completed;
    }
    send(message) {
        if (this.data.inputMessage instanceof rpc_error_1.RpcError) {
            return Promise.reject(this.data.inputMessage);
        }
        const delayMs = this.data.inputMessage === undefined
            ? 10
            : this.data.inputMessage;
        return Promise.resolve(undefined)
            .then(() => {
            this._sent.push(message);
        })
            .then(delay(delayMs, this.abort));
    }
    complete() {
        if (this.data.inputComplete instanceof rpc_error_1.RpcError) {
            return Promise.reject(this.data.inputComplete);
        }
        const delayMs = this.data.inputComplete === undefined
            ? 10
            : this.data.inputComplete;
        return Promise.resolve(undefined)
            .then(() => {
            this._completed = true;
        })
            .then(delay(delayMs, this.abort));
    }
}
