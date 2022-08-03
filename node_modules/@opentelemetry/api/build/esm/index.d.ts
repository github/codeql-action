export * from './baggage/types';
export { baggageEntryMetadataFromString } from './baggage/utils';
export * from './common/Exception';
export * from './common/Time';
export * from './common/Attributes';
export * from './diag';
export * from './propagation/TextMapPropagator';
export * from './trace/attributes';
export * from './trace/link';
export * from './trace/ProxyTracer';
export * from './trace/ProxyTracerProvider';
export * from './trace/Sampler';
export * from './trace/SamplingResult';
export * from './trace/span_context';
export * from './trace/span_kind';
export * from './trace/span';
export * from './trace/SpanOptions';
export * from './trace/status';
export * from './trace/trace_flags';
export * from './trace/trace_state';
export { createTraceState } from './trace/internal/utils';
export * from './trace/tracer_provider';
export * from './trace/tracer';
export * from './trace/tracer_options';
export { isSpanContextValid, isValidTraceId, isValidSpanId, } from './trace/spancontext-utils';
export { INVALID_SPANID, INVALID_TRACEID, INVALID_SPAN_CONTEXT, } from './trace/invalid-span-constants';
export * from './context/context';
export * from './context/types';
import { ContextAPI } from './api/context';
export type { ContextAPI } from './api/context';
/** Entrypoint for context API */
export declare const context: ContextAPI;
import { TraceAPI } from './api/trace';
export type { TraceAPI } from './api/trace';
/** Entrypoint for trace API */
export declare const trace: TraceAPI;
import { PropagationAPI } from './api/propagation';
export type { PropagationAPI } from './api/propagation';
/** Entrypoint for propagation API */
export declare const propagation: PropagationAPI;
import { DiagAPI } from './api/diag';
export type { DiagAPI } from './api/diag';
/**
 * Entrypoint for Diag API.
 * Defines Diagnostic handler used for internal diagnostic logging operations.
 * The default provides a Noop DiagLogger implementation which may be changed via the
 * diag.setLogger(logger: DiagLogger) function.
 */
export declare const diag: DiagAPI;
declare const _default: {
    trace: TraceAPI;
    context: ContextAPI;
    propagation: PropagationAPI;
    diag: DiagAPI;
};
export default _default;
//# sourceMappingURL=index.d.ts.map