'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var api = require('@opentelemetry/api');

// Copyright (c) Microsoft Corporation.
(function (SpanKind) {
    /** Default value. Indicates that the span is used internally. */
    SpanKind[SpanKind["INTERNAL"] = 0] = "INTERNAL";
    /**
     * Indicates that the span covers server-side handling of an RPC or other
     * remote request.
     */
    SpanKind[SpanKind["SERVER"] = 1] = "SERVER";
    /**
     * Indicates that the span covers the client-side wrapper around an RPC or
     * other remote request.
     */
    SpanKind[SpanKind["CLIENT"] = 2] = "CLIENT";
    /**
     * Indicates that the span describes producer sending a message to a
     * broker. Unlike client and server, there is no direct critical path latency
     * relationship between producer and consumer spans.
     */
    SpanKind[SpanKind["PRODUCER"] = 3] = "PRODUCER";
    /**
     * Indicates that the span describes consumer receiving a message from a
     * broker. Unlike client and server, there is no direct critical path latency
     * relationship between producer and consumer spans.
     */
    SpanKind[SpanKind["CONSUMER"] = 4] = "CONSUMER";
})(exports.SpanKind || (exports.SpanKind = {}));
/**
 * Return the span if one exists
 *
 * @param context - context to get span from
 */
function getSpan(context) {
    return api.trace.getSpan(context);
}
/**
 * Set the span on a context
 *
 * @param context - context to use as parent
 * @param span - span to set active
 */
function setSpan(context, span) {
    return api.trace.setSpan(context, span);
}
/**
 * Wrap span context in a NoopSpan and set as span in a new
 * context
 *
 * @param context - context to set active span on
 * @param spanContext - span context to be wrapped
 */
function setSpanContext(context, spanContext) {
    return api.trace.setSpanContext(context, spanContext);
}
/**
 * Get the span context of the span if it exists.
 *
 * @param context - context to get values from
 */
function getSpanContext(context) {
    return api.trace.getSpanContext(context);
}
/**
 * Returns true of the given {@link SpanContext} is valid.
 * A valid {@link SpanContext} is one which has a valid trace ID and span ID as per the spec.
 *
 * @param context - the {@link SpanContext} to validate.
 *
 * @returns true if the {@link SpanContext} is valid, false otherwise.
 */
function isSpanContextValid(context) {
    return api.trace.isSpanContextValid(context);
}
function getTracer(name, version) {
    return api.trace.getTracer(name || "azure/core-tracing", version);
}
/** Entrypoint for context API */
const context = api.context;
(function (SpanStatusCode) {
    /**
     * The default status.
     */
    SpanStatusCode[SpanStatusCode["UNSET"] = 0] = "UNSET";
    /**
     * The operation has been validated by an Application developer or
     * Operator to have completed successfully.
     */
    SpanStatusCode[SpanStatusCode["OK"] = 1] = "OK";
    /**
     * The operation contains an error.
     */
    SpanStatusCode[SpanStatusCode["ERROR"] = 2] = "ERROR";
})(exports.SpanStatusCode || (exports.SpanStatusCode = {}));

// Copyright (c) Microsoft Corporation.
function isTracingDisabled() {
    var _a;
    if (typeof process === "undefined") {
        // not supported in browser for now without polyfills
        return false;
    }
    const azureTracingDisabledValue = (_a = process.env.AZURE_TRACING_DISABLED) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    if (azureTracingDisabledValue === "false" || azureTracingDisabledValue === "0") {
        return false;
    }
    return Boolean(azureTracingDisabledValue);
}
/**
 * Creates a function that can be used to create spans using the global tracer.
 *
 * Usage:
 *
 * ```typescript
 * // once
 * const createSpan = createSpanFunction({ packagePrefix: "Azure.Data.AppConfiguration", namespace: "Microsoft.AppConfiguration" });
 *
 * // in each operation
 * const span = createSpan("deleteConfigurationSetting", operationOptions);
 *    // code...
 * span.end();
 * ```
 *
 * @hidden
 * @param args - allows configuration of the prefix for each span as well as the az.namespace field.
 */
function createSpanFunction(args) {
    return function (operationName, operationOptions) {
        const tracer = getTracer();
        const tracingOptions = (operationOptions === null || operationOptions === void 0 ? void 0 : operationOptions.tracingOptions) || {};
        const spanOptions = Object.assign({ kind: exports.SpanKind.INTERNAL }, tracingOptions.spanOptions);
        const spanName = args.packagePrefix ? `${args.packagePrefix}.${operationName}` : operationName;
        let span;
        if (isTracingDisabled()) {
            span = api.trace.wrapSpanContext(api.INVALID_SPAN_CONTEXT);
        }
        else {
            span = tracer.startSpan(spanName, spanOptions, tracingOptions.tracingContext);
        }
        if (args.namespace) {
            span.setAttribute("az.namespace", args.namespace);
        }
        let newSpanOptions = tracingOptions.spanOptions || {};
        if (span.isRecording() && args.namespace) {
            newSpanOptions = Object.assign(Object.assign({}, tracingOptions.spanOptions), { attributes: Object.assign(Object.assign({}, spanOptions.attributes), { "az.namespace": args.namespace }) });
        }
        const newTracingOptions = Object.assign(Object.assign({}, tracingOptions), { spanOptions: newSpanOptions, tracingContext: setSpan(tracingOptions.tracingContext || context.active(), span) });
        const newOperationOptions = Object.assign(Object.assign({}, operationOptions), { tracingOptions: newTracingOptions });
        return {
            span,
            updatedOptions: newOperationOptions
        };
    };
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
const VERSION = "00";
/**
 * Generates a `SpanContext` given a `traceparent` header value.
 * @param traceParent - Serialized span context data as a `traceparent` header value.
 * @returns The `SpanContext` generated from the `traceparent` value.
 */
function extractSpanContextFromTraceParentHeader(traceParentHeader) {
    const parts = traceParentHeader.split("-");
    if (parts.length !== 4) {
        return;
    }
    const [version, traceId, spanId, traceOptions] = parts;
    if (version !== VERSION) {
        return;
    }
    const traceFlags = parseInt(traceOptions, 16);
    const spanContext = {
        spanId,
        traceId,
        traceFlags
    };
    return spanContext;
}
/**
 * Generates a `traceparent` value given a span context.
 * @param spanContext - Contains context for a specific span.
 * @returns The `spanContext` represented as a `traceparent` value.
 */
function getTraceParentHeader(spanContext) {
    const missingFields = [];
    if (!spanContext.traceId) {
        missingFields.push("traceId");
    }
    if (!spanContext.spanId) {
        missingFields.push("spanId");
    }
    if (missingFields.length) {
        return;
    }
    const flags = spanContext.traceFlags || 0 /* NONE */;
    const hexFlags = flags.toString(16);
    const traceFlags = hexFlags.length === 1 ? `0${hexFlags}` : hexFlags;
    // https://www.w3.org/TR/trace-context/#traceparent-header-field-values
    return `${VERSION}-${spanContext.traceId}-${spanContext.spanId}-${traceFlags}`;
}

exports.context = context;
exports.createSpanFunction = createSpanFunction;
exports.extractSpanContextFromTraceParentHeader = extractSpanContextFromTraceParentHeader;
exports.getSpan = getSpan;
exports.getSpanContext = getSpanContext;
exports.getTraceParentHeader = getTraceParentHeader;
exports.getTracer = getTracer;
exports.isSpanContextValid = isSpanContextValid;
exports.setSpan = setSpan;
exports.setSpanContext = setSpanContext;
//# sourceMappingURL=index.js.map
