// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { BaseRequestPolicy, } from "./requestPolicy";
import { SpanKind, SpanStatusCode, createSpanFunction, getTraceParentHeader, isSpanContextValid, } from "@azure/core-tracing";
import { logger } from "../log";
const createSpan = createSpanFunction({
    packagePrefix: "",
    namespace: "",
});
/**
 * Creates a policy that wraps outgoing requests with a tracing span.
 * @param tracingOptions - Tracing options.
 * @returns An instance of the {@link TracingPolicy} class.
 */
export function tracingPolicy(tracingOptions = {}) {
    return {
        create(nextPolicy, options) {
            return new TracingPolicy(nextPolicy, options, tracingOptions);
        },
    };
}
/**
 * A policy that wraps outgoing requests with a tracing span.
 */
export class TracingPolicy extends BaseRequestPolicy {
    constructor(nextPolicy, options, tracingOptions) {
        super(nextPolicy, options);
        this.userAgent = tracingOptions.userAgent;
    }
    async sendRequest(request) {
        if (!request.tracingContext) {
            return this._nextPolicy.sendRequest(request);
        }
        const span = this.tryCreateSpan(request);
        if (!span) {
            return this._nextPolicy.sendRequest(request);
        }
        try {
            const response = await this._nextPolicy.sendRequest(request);
            this.tryProcessResponse(span, response);
            return response;
        }
        catch (err) {
            this.tryProcessError(span, err);
            throw err;
        }
    }
    tryCreateSpan(request) {
        var _a;
        try {
            // Passing spanOptions as part of tracingOptions to maintain compatibility @azure/core-tracing@preview.13 and earlier.
            // We can pass this as a separate parameter once we upgrade to the latest core-tracing.
            const { span } = createSpan(`HTTP ${request.method}`, {
                tracingOptions: {
                    spanOptions: Object.assign(Object.assign({}, request.spanOptions), { kind: SpanKind.CLIENT }),
                    tracingContext: request.tracingContext,
                },
            });
            // If the span is not recording, don't do any more work.
            if (!span.isRecording()) {
                span.end();
                return undefined;
            }
            const namespaceFromContext = (_a = request.tracingContext) === null || _a === void 0 ? void 0 : _a.getValue(Symbol.for("az.namespace"));
            if (typeof namespaceFromContext === "string") {
                span.setAttribute("az.namespace", namespaceFromContext);
            }
            span.setAttributes({
                "http.method": request.method,
                "http.url": request.url,
                requestId: request.requestId,
            });
            if (this.userAgent) {
                span.setAttribute("http.user_agent", this.userAgent);
            }
            // set headers
            const spanContext = span.spanContext();
            const traceParentHeader = getTraceParentHeader(spanContext);
            if (traceParentHeader && isSpanContextValid(spanContext)) {
                request.headers.set("traceparent", traceParentHeader);
                const traceState = spanContext.traceState && spanContext.traceState.serialize();
                // if tracestate is set, traceparent MUST be set, so only set tracestate after traceparent
                if (traceState) {
                    request.headers.set("tracestate", traceState);
                }
            }
            return span;
        }
        catch (error) {
            logger.warning(`Skipping creating a tracing span due to an error: ${error.message}`);
            return undefined;
        }
    }
    tryProcessError(span, err) {
        try {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: err.message,
            });
            if (err.statusCode) {
                span.setAttribute("http.status_code", err.statusCode);
            }
            span.end();
        }
        catch (error) {
            logger.warning(`Skipping tracing span processing due to an error: ${error.message}`);
        }
    }
    tryProcessResponse(span, response) {
        try {
            span.setAttribute("http.status_code", response.status);
            const serviceRequestId = response.headers.get("x-ms-request-id");
            if (serviceRequestId) {
                span.setAttribute("serviceRequestId", serviceRequestId);
            }
            span.setStatus({
                code: SpanStatusCode.OK,
            });
            span.end();
        }
        catch (error) {
            logger.warning(`Skipping tracing span processing due to an error: ${error.message}`);
        }
    }
}
//# sourceMappingURL=tracingPolicy.js.map