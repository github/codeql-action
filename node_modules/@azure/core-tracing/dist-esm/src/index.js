// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
// Tracers and wrappers
export { createSpanFunction } from "./createSpan";
// Shared interfaces
export { context, getSpan, getSpanContext, getTracer, isSpanContextValid, setSpan, setSpanContext, SpanKind, SpanStatusCode } from "./interfaces";
// Utilities
export { extractSpanContextFromTraceParentHeader, getTraceParentHeader } from "./utils/traceParentHeader";
//# sourceMappingURL=index.js.map