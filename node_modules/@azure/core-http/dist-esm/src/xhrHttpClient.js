// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { HttpHeaders } from "./httpHeaders";
import { AbortError } from "@azure/abort-controller";
import { RestError } from "./restError";
/**
 * A HttpClient implementation that uses XMLHttpRequest to send HTTP requests.
 */
export class XhrHttpClient {
    sendRequest(request) {
        var _a;
        const xhr = new XMLHttpRequest();
        if (request.proxySettings) {
            throw new Error("HTTP proxy is not supported in browser environment");
        }
        const abortSignal = request.abortSignal;
        if (abortSignal) {
            if (abortSignal.aborted) {
                return Promise.reject(new AbortError("The operation was aborted."));
            }
            const listener = () => {
                xhr.abort();
            };
            abortSignal.addEventListener("abort", listener);
            xhr.addEventListener("readystatechange", () => {
                if (xhr.readyState === XMLHttpRequest.DONE) {
                    abortSignal.removeEventListener("abort", listener);
                }
            });
        }
        addProgressListener(xhr.upload, request.onUploadProgress);
        addProgressListener(xhr, request.onDownloadProgress);
        if (request.formData) {
            const formData = request.formData;
            const requestForm = new FormData();
            const appendFormValue = (key, value) => {
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
            request.body = requestForm;
            request.formData = undefined;
            const contentType = request.headers.get("Content-Type");
            if (contentType && contentType.indexOf("multipart/form-data") !== -1) {
                // browser will automatically apply a suitable content-type header
                request.headers.remove("Content-Type");
            }
        }
        xhr.open(request.method, request.url);
        xhr.timeout = request.timeout;
        xhr.withCredentials = request.withCredentials;
        for (const header of request.headers.headersArray()) {
            xhr.setRequestHeader(header.name, header.value);
        }
        xhr.responseType =
            ((_a = request.streamResponseStatusCodes) === null || _a === void 0 ? void 0 : _a.size) || request.streamResponseBody ? "blob" : "text";
        // tslint:disable-next-line:no-null-keyword
        xhr.send(request.body === undefined ? null : request.body);
        if (xhr.responseType === "blob") {
            return new Promise((resolve, reject) => {
                handleBlobResponse(xhr, request, resolve, reject);
                rejectOnTerminalEvent(request, xhr, reject);
            });
        }
        else {
            return new Promise(function (resolve, reject) {
                xhr.addEventListener("load", () => resolve({
                    request,
                    status: xhr.status,
                    headers: parseHeaders(xhr),
                    bodyAsText: xhr.responseText,
                }));
                rejectOnTerminalEvent(request, xhr, reject);
            });
        }
    }
}
function handleBlobResponse(xhr, request, res, rej) {
    xhr.addEventListener("readystatechange", () => {
        var _a;
        // Resolve as soon as headers are loaded
        if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
            if (request.streamResponseBody || ((_a = request.streamResponseStatusCodes) === null || _a === void 0 ? void 0 : _a.has(xhr.status))) {
                const blobBody = new Promise((resolve, reject) => {
                    xhr.addEventListener("load", () => {
                        resolve(xhr.response);
                    });
                    rejectOnTerminalEvent(request, xhr, reject);
                });
                res({
                    request,
                    status: xhr.status,
                    headers: parseHeaders(xhr),
                    blobBody,
                });
            }
            else {
                xhr.addEventListener("load", () => {
                    // xhr.response is of Blob type if the request is sent with xhr.responseType === "blob"
                    // but the status code is not one of the stream response status codes,
                    // so treat it as text and convert from Blob to text
                    if (xhr.response) {
                        // Blob.text() is not supported in IE so using FileReader instead
                        const reader = new FileReader();
                        reader.onload = function (e) {
                            var _a;
                            const text = (_a = e.target) === null || _a === void 0 ? void 0 : _a.result;
                            res({
                                request,
                                status: xhr.status,
                                headers: parseHeaders(xhr),
                                bodyAsText: text,
                            });
                        };
                        reader.onerror = function (_e) {
                            rej(reader.error);
                        };
                        reader.readAsText(xhr.response, "UTF-8");
                    }
                    else {
                        res({
                            request,
                            status: xhr.status,
                            headers: parseHeaders(xhr),
                        });
                    }
                });
            }
        }
    });
}
function addProgressListener(xhr, listener) {
    if (listener) {
        xhr.addEventListener("progress", (rawEvent) => listener({
            loadedBytes: rawEvent.loaded,
        }));
    }
}
// exported locally for testing
export function parseHeaders(xhr) {
    const responseHeaders = new HttpHeaders();
    const headerLines = xhr
        .getAllResponseHeaders()
        .trim()
        .split(/[\r\n]+/);
    for (const line of headerLines) {
        const index = line.indexOf(":");
        const headerName = line.slice(0, index);
        const headerValue = line.slice(index + 2);
        responseHeaders.set(headerName, headerValue);
    }
    return responseHeaders;
}
function rejectOnTerminalEvent(request, xhr, reject) {
    xhr.addEventListener("error", () => reject(new RestError(`Failed to send request to ${request.url}`, RestError.REQUEST_SEND_ERROR, undefined, request)));
    const abortError = new AbortError("The operation was aborted.");
    xhr.addEventListener("abort", () => reject(abortError));
    xhr.addEventListener("timeout", () => reject(abortError));
}
//# sourceMappingURL=xhrHttpClient.js.map