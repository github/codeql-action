"use strict";
/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.diag = exports.propagation = exports.trace = exports.context = exports.INVALID_SPAN_CONTEXT = exports.INVALID_TRACEID = exports.INVALID_SPANID = exports.isValidSpanId = exports.isValidTraceId = exports.isSpanContextValid = exports.createTraceState = exports.baggageEntryMetadataFromString = void 0;
__exportStar(require("./baggage/types"), exports);
var utils_1 = require("./baggage/utils");
Object.defineProperty(exports, "baggageEntryMetadataFromString", { enumerable: true, get: function () { return utils_1.baggageEntryMetadataFromString; } });
__exportStar(require("./common/Exception"), exports);
__exportStar(require("./common/Time"), exports);
__exportStar(require("./common/Attributes"), exports);
__exportStar(require("./diag"), exports);
__exportStar(require("./propagation/TextMapPropagator"), exports);
__exportStar(require("./trace/attributes"), exports);
__exportStar(require("./trace/link"), exports);
__exportStar(require("./trace/ProxyTracer"), exports);
__exportStar(require("./trace/ProxyTracerProvider"), exports);
__exportStar(require("./trace/Sampler"), exports);
__exportStar(require("./trace/SamplingResult"), exports);
__exportStar(require("./trace/span_context"), exports);
__exportStar(require("./trace/span_kind"), exports);
__exportStar(require("./trace/span"), exports);
__exportStar(require("./trace/SpanOptions"), exports);
__exportStar(require("./trace/status"), exports);
__exportStar(require("./trace/trace_flags"), exports);
__exportStar(require("./trace/trace_state"), exports);
var utils_2 = require("./trace/internal/utils");
Object.defineProperty(exports, "createTraceState", { enumerable: true, get: function () { return utils_2.createTraceState; } });
__exportStar(require("./trace/tracer_provider"), exports);
__exportStar(require("./trace/tracer"), exports);
__exportStar(require("./trace/tracer_options"), exports);
var spancontext_utils_1 = require("./trace/spancontext-utils");
Object.defineProperty(exports, "isSpanContextValid", { enumerable: true, get: function () { return spancontext_utils_1.isSpanContextValid; } });
Object.defineProperty(exports, "isValidTraceId", { enumerable: true, get: function () { return spancontext_utils_1.isValidTraceId; } });
Object.defineProperty(exports, "isValidSpanId", { enumerable: true, get: function () { return spancontext_utils_1.isValidSpanId; } });
var invalid_span_constants_1 = require("./trace/invalid-span-constants");
Object.defineProperty(exports, "INVALID_SPANID", { enumerable: true, get: function () { return invalid_span_constants_1.INVALID_SPANID; } });
Object.defineProperty(exports, "INVALID_TRACEID", { enumerable: true, get: function () { return invalid_span_constants_1.INVALID_TRACEID; } });
Object.defineProperty(exports, "INVALID_SPAN_CONTEXT", { enumerable: true, get: function () { return invalid_span_constants_1.INVALID_SPAN_CONTEXT; } });
__exportStar(require("./context/context"), exports);
__exportStar(require("./context/types"), exports);
var context_1 = require("./api/context");
/** Entrypoint for context API */
exports.context = context_1.ContextAPI.getInstance();
var trace_1 = require("./api/trace");
/** Entrypoint for trace API */
exports.trace = trace_1.TraceAPI.getInstance();
var propagation_1 = require("./api/propagation");
/** Entrypoint for propagation API */
exports.propagation = propagation_1.PropagationAPI.getInstance();
var diag_1 = require("./api/diag");
/**
 * Entrypoint for Diag API.
 * Defines Diagnostic handler used for internal diagnostic logging operations.
 * The default provides a Noop DiagLogger implementation which may be changed via the
 * diag.setLogger(logger: DiagLogger) function.
 */
exports.diag = diag_1.DiagAPI.instance();
exports.default = {
    trace: exports.trace,
    context: exports.context,
    propagation: exports.propagation,
    diag: exports.diag,
};
//# sourceMappingURL=index.js.map