"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerCallContextController = void 0;
class ServerCallContextController {
    constructor(method, headers, deadline, sendResponseHeadersFn, defaultStatus = { code: 'OK', detail: '' }) {
        this._cancelled = false;
        this._listeners = [];
        this.method = method;
        this.headers = headers;
        this.deadline = deadline;
        this.trailers = {};
        this._sendRH = sendResponseHeadersFn;
        this.status = defaultStatus;
    }
    /**
     * Set the call cancelled.
     *
     * Invokes all callbacks registered with onCancel() and
     * sets `cancelled = true`.
     */
    notifyCancelled() {
        if (!this._cancelled) {
            this._cancelled = true;
            for (let l of this._listeners) {
                l();
            }
        }
    }
    /**
     * Send response headers.
     */
    sendResponseHeaders(data) {
        this._sendRH(data);
    }
    /**
     * Is the call cancelled?
     *
     * When the client closes the connection before the server
     * is done, the call is cancelled.
     *
     * If you want to cancel a request on the server, throw a
     * RpcError with the CANCELLED status code.
     */
    get cancelled() {
        return this._cancelled;
    }
    /**
     * Add a callback for cancellation.
     */
    onCancel(callback) {
        const l = this._listeners;
        l.push(callback);
        return () => {
            let i = l.indexOf(callback);
            if (i >= 0)
                l.splice(i, 1);
        };
    }
}
exports.ServerCallContextController = ServerCallContextController;
