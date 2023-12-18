var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { RpcError } from "./rpc-error";
import { assert } from "@protobuf-ts/runtime";
import { RpcOutputStreamController } from "./rpc-output-stream";
import { mergeRpcOptions } from "./rpc-options";
import { UnaryCall } from "./unary-call";
import { ServerStreamingCall } from "./server-streaming-call";
import { ClientStreamingCall } from "./client-streaming-call";
import { DuplexStreamingCall } from "./duplex-streaming-call";
/**
 * Transport for testing.
 */
export class TestTransport {
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
        return headers instanceof RpcError
            ? Promise.reject(headers)
            : Promise.resolve(headers);
    }
    // Creates a promise for a single, valid, message from the mock data.
    promiseSingleResponse(method) {
        if (this.data.response instanceof RpcError) {
            return Promise.reject(this.data.response);
        }
        let r;
        if (Array.isArray(this.data.response)) {
            assert(this.data.response.length > 0);
            r = this.data.response[0];
        }
        else if (this.data.response !== undefined) {
            r = this.data.response;
        }
        else {
            r = method.O.create();
        }
        assert(method.O.is(r));
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
                    assert(method.O.is(msg));
                    messages.push(msg);
                }
            }
            else if (!(this.data.response instanceof RpcError)) {
                assert(method.O.is(this.data.response));
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
            if (this.data.response instanceof RpcError) {
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
            if (this.data.status instanceof RpcError) {
                stream.notifyError(this.data.status);
                return;
            }
            // error trailers were mocked, notify() error (stream is now closed with error) and exit.
            if (this.data.trailers instanceof RpcError) {
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
        return status instanceof RpcError
            ? Promise.reject(status)
            : Promise.resolve(status);
    }
    // Creates a promise for response trailers from the mock data.
    promiseTrailers() {
        var _a;
        const trailers = (_a = this.data.trailers) !== null && _a !== void 0 ? _a : TestTransport.defaultTrailers;
        return trailers instanceof RpcError
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
        return mergeRpcOptions({}, options);
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
        return new UnaryCall(method, requestHeaders, input, headersPromise, responsePromise, statusPromise, trailersPromise);
    }
    serverStreaming(method, input, options) {
        var _a;
        const requestHeaders = (_a = options.meta) !== null && _a !== void 0 ? _a : {}, headersPromise = this.promiseHeaders()
            .then(delay(this.headerDelay, options.abort)), outputStream = new RpcOutputStreamController(), responseStreamClosedPromise = headersPromise
            .then(delay(this.responseDelay, options.abort))
            .catch(() => {
        })
            .then(() => this.streamResponses(method, outputStream, options.abort))
            .then(delay(this.afterResponseDelay, options.abort)), statusPromise = responseStreamClosedPromise
            .then(() => this.promiseStatus()), trailersPromise = responseStreamClosedPromise
            .then(() => this.promiseTrailers());
        this.maybeSuppressUncaught(statusPromise, trailersPromise);
        this.lastInput = { single: input };
        return new ServerStreamingCall(method, requestHeaders, input, headersPromise, outputStream, statusPromise, trailersPromise);
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
        return new ClientStreamingCall(method, requestHeaders, this.lastInput, headersPromise, responsePromise, statusPromise, trailersPromise);
    }
    duplex(method, options) {
        var _a;
        const requestHeaders = (_a = options.meta) !== null && _a !== void 0 ? _a : {}, headersPromise = this.promiseHeaders()
            .then(delay(this.headerDelay, options.abort)), outputStream = new RpcOutputStreamController(), responseStreamClosedPromise = headersPromise
            .then(delay(this.responseDelay, options.abort))
            .catch(() => {
        })
            .then(() => this.streamResponses(method, outputStream, options.abort))
            .then(delay(this.afterResponseDelay, options.abort)), statusPromise = responseStreamClosedPromise
            .then(() => this.promiseStatus()), trailersPromise = responseStreamClosedPromise
            .then(() => this.promiseTrailers());
        this.maybeSuppressUncaught(statusPromise, trailersPromise);
        this.lastInput = new TestInputStream(this.data, options.abort);
        return new DuplexStreamingCall(method, requestHeaders, this.lastInput, headersPromise, outputStream, statusPromise, trailersPromise);
    }
}
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
            reject(new RpcError("user cancel", "CANCELLED"));
        }
        else {
            const id = setTimeout(() => resolve(v), ms);
            if (abort) {
                abort.addEventListener("abort", ev => {
                    clearTimeout(id);
                    reject(new RpcError("user cancel", "CANCELLED"));
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
        if (this.data.inputMessage instanceof RpcError) {
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
        if (this.data.inputComplete instanceof RpcError) {
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
