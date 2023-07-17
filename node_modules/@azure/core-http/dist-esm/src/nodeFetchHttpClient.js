// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as http from "http";
import * as https from "https";
import { AbortController, AbortError } from "@azure/abort-controller";
import { HttpHeaders } from "./httpHeaders";
import { createProxyAgent, isUrlHttps } from "./proxyAgent";
import { Transform } from "stream";
import FormData from "form-data";
import { RestError } from "./restError";
import { logger } from "./log";
import node_fetch from "node-fetch";
function getCachedAgent(isHttps, agentCache) {
    return isHttps ? agentCache.httpsAgent : agentCache.httpAgent;
}
export class ReportTransform extends Transform {
    constructor(progressCallback) {
        super();
        this.progressCallback = progressCallback;
        this.loadedBytes = 0;
    }
    _transform(chunk, _encoding, callback) {
        this.push(chunk);
        this.loadedBytes += chunk.length;
        this.progressCallback({ loadedBytes: this.loadedBytes });
        callback(undefined);
    }
}
function isReadableStream(body) {
    return body && typeof body.pipe === "function";
}
function isStreamComplete(stream, aborter) {
    return new Promise((resolve) => {
        stream.once("close", () => {
            aborter === null || aborter === void 0 ? void 0 : aborter.abort();
            resolve();
        });
        stream.once("end", resolve);
        stream.once("error", resolve);
    });
}
/**
 * Transforms a set of headers into the key/value pair defined by {@link HttpHeadersLike}
 */
export function parseHeaders(headers) {
    const httpHeaders = new HttpHeaders();
    headers.forEach((value, key) => {
        httpHeaders.set(key, value);
    });
    return httpHeaders;
}
/**
 * An HTTP client that uses `node-fetch`.
 */
export class NodeFetchHttpClient {
    constructor() {
        // a mapping of proxy settings string `${host}:${port}:${username}:${password}` to agent
        this.proxyAgentMap = new Map();
        this.keepAliveAgents = {};
    }
    /**
     * Provides minimum viable error handling and the logic that executes the abstract methods.
     * @param httpRequest - Object representing the outgoing HTTP request.
     * @returns An object representing the incoming HTTP response.
     */
    async sendRequest(httpRequest) {
        var _a;
        if (!httpRequest && typeof httpRequest !== "object") {
            throw new Error("'httpRequest' (WebResourceLike) cannot be null or undefined and must be of type object.");
        }
        const abortController = new AbortController();
        let abortListener;
        if (httpRequest.abortSignal) {
            if (httpRequest.abortSignal.aborted) {
                throw new AbortError("The operation was aborted.");
            }
            abortListener = (event) => {
                if (event.type === "abort") {
                    abortController.abort();
                }
            };
            httpRequest.abortSignal.addEventListener("abort", abortListener);
        }
        if (httpRequest.timeout) {
            setTimeout(() => {
                abortController.abort();
            }, httpRequest.timeout);
        }
        if (httpRequest.formData) {
            const formData = httpRequest.formData;
            const requestForm = new FormData();
            const appendFormValue = (key, value) => {
                // value function probably returns a stream so we can provide a fresh stream on each retry
                if (typeof value === "function") {
                    value = value();
                }
                if (value &&
                    Object.prototype.hasOwnProperty.call(value, "value") &&
                    Object.prototype.hasOwnProperty.call(value, "options")) {
                    requestForm.append(key, value.value, value.options);
                }
                else {
                    requestForm.append(key, value);
                }
            };
            for (const formKey of Object.keys(formData)) {
                const formValue = formData[formKey];
                if (Array.isArray(formValue)) {
                    for (let j = 0; j < formValue.length; j++) {
                        appendFormValue(formKey, formValue[j]);
                    }
                }
                else {
                    appendFormValue(formKey, formValue);
                }
            }
            httpRequest.body = requestForm;
            httpRequest.formData = undefined;
            const contentType = httpRequest.headers.get("Content-Type");
            if (contentType && contentType.indexOf("multipart/form-data") !== -1) {
                if (typeof requestForm.getBoundary === "function") {
                    httpRequest.headers.set("Content-Type", `multipart/form-data; boundary=${requestForm.getBoundary()}`);
                }
                else {
                    // browser will automatically apply a suitable content-type header
                    httpRequest.headers.remove("Content-Type");
                }
            }
        }
        let body = httpRequest.body
            ? typeof httpRequest.body === "function"
                ? httpRequest.body()
                : httpRequest.body
            : undefined;
        if (httpRequest.onUploadProgress && httpRequest.body) {
            const onUploadProgress = httpRequest.onUploadProgress;
            const uploadReportStream = new ReportTransform(onUploadProgress);
            if (isReadableStream(body)) {
                body.pipe(uploadReportStream);
            }
            else {
                uploadReportStream.end(body);
            }
            body = uploadReportStream;
        }
        const platformSpecificRequestInit = await this.prepareRequest(httpRequest);
        const requestInit = Object.assign({ body: body, headers: httpRequest.headers.rawHeaders(), method: httpRequest.method, 
            // the types for RequestInit are from the browser, which expects AbortSignal to
            // have `reason` and `throwIfAborted`, but these don't exist on our polyfill
            // for Node.
            signal: abortController.signal, redirect: "manual" }, platformSpecificRequestInit);
        let operationResponse;
        try {
            const response = await this.fetch(httpRequest.url, requestInit);
            const headers = parseHeaders(response.headers);
            const streaming = ((_a = httpRequest.streamResponseStatusCodes) === null || _a === void 0 ? void 0 : _a.has(response.status)) ||
                httpRequest.streamResponseBody;
            operationResponse = {
                headers: headers,
                request: httpRequest,
                status: response.status,
                readableStreamBody: streaming
                    ? response.body
                    : undefined,
                bodyAsText: !streaming ? await response.text() : undefined,
            };
            const onDownloadProgress = httpRequest.onDownloadProgress;
            if (onDownloadProgress) {
                const responseBody = response.body || undefined;
                if (isReadableStream(responseBody)) {
                    const downloadReportStream = new ReportTransform(onDownloadProgress);
                    responseBody.pipe(downloadReportStream);
                    operationResponse.readableStreamBody = downloadReportStream;
                }
                else {
                    const length = parseInt(headers.get("Content-Length")) || undefined;
                    if (length) {
                        // Calling callback for non-stream response for consistency with browser
                        onDownloadProgress({ loadedBytes: length });
                    }
                }
            }
            await this.processRequest(operationResponse);
            return operationResponse;
        }
        catch (error) {
            const fetchError = error;
            if (fetchError.code === "ENOTFOUND") {
                throw new RestError(fetchError.message, RestError.REQUEST_SEND_ERROR, undefined, httpRequest);
            }
            else if (fetchError.type === "aborted") {
                throw new AbortError("The operation was aborted.");
            }
            throw fetchError;
        }
        finally {
            // clean up event listener
            if (httpRequest.abortSignal && abortListener) {
                let uploadStreamDone = Promise.resolve();
                if (isReadableStream(body)) {
                    uploadStreamDone = isStreamComplete(body);
                }
                let downloadStreamDone = Promise.resolve();
                if (isReadableStream(operationResponse === null || operationResponse === void 0 ? void 0 : operationResponse.readableStreamBody)) {
                    downloadStreamDone = isStreamComplete(operationResponse.readableStreamBody, abortController);
                }
                Promise.all([uploadStreamDone, downloadStreamDone])
                    .then(() => {
                    var _a;
                    (_a = httpRequest.abortSignal) === null || _a === void 0 ? void 0 : _a.removeEventListener("abort", abortListener);
                    return;
                })
                    .catch((e) => {
                    logger.warning("Error when cleaning up abortListener on httpRequest", e);
                });
            }
        }
    }
    getOrCreateAgent(httpRequest) {
        var _a;
        const isHttps = isUrlHttps(httpRequest.url);
        // At the moment, proxy settings and keepAlive are mutually
        // exclusive because the 'tunnel' library currently lacks the
        // ability to create a proxy with keepAlive turned on.
        if (httpRequest.proxySettings) {
            const { host, port, username, password } = httpRequest.proxySettings;
            const key = `${host}:${port}:${username}:${password}`;
            const proxyAgents = (_a = this.proxyAgentMap.get(key)) !== null && _a !== void 0 ? _a : {};
            let agent = getCachedAgent(isHttps, proxyAgents);
            if (agent) {
                return agent;
            }
            const tunnel = createProxyAgent(httpRequest.url, httpRequest.proxySettings, httpRequest.headers);
            agent = tunnel.agent;
            if (tunnel.isHttps) {
                proxyAgents.httpsAgent = tunnel.agent;
            }
            else {
                proxyAgents.httpAgent = tunnel.agent;
            }
            this.proxyAgentMap.set(key, proxyAgents);
            return agent;
        }
        else if (httpRequest.keepAlive) {
            let agent = getCachedAgent(isHttps, this.keepAliveAgents);
            if (agent) {
                return agent;
            }
            const agentOptions = {
                keepAlive: httpRequest.keepAlive,
            };
            if (isHttps) {
                agent = this.keepAliveAgents.httpsAgent = new https.Agent(agentOptions);
            }
            else {
                agent = this.keepAliveAgents.httpAgent = new http.Agent(agentOptions);
            }
            return agent;
        }
        else {
            return isHttps ? https.globalAgent : http.globalAgent;
        }
    }
    /**
     * Uses `node-fetch` to perform the request.
     */
    // eslint-disable-next-line @azure/azure-sdk/ts-apisurface-standardized-verbs
    async fetch(input, init) {
        return node_fetch(input, init);
    }
    /**
     * Prepares a request based on the provided web resource.
     */
    async prepareRequest(httpRequest) {
        const requestInit = {};
        // Set the http(s) agent
        requestInit.agent = this.getOrCreateAgent(httpRequest);
        requestInit.compress = httpRequest.decompressResponse;
        return requestInit;
    }
    /**
     * Process an HTTP response.
     */
    async processRequest(_operationResponse) {
        /* no_op */
    }
}
//# sourceMappingURL=nodeFetchHttpClient.js.map