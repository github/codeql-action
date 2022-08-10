// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { createSpanFunction } from "@azure/core-tracing";
/**
 * Creates a span using the global tracer.
 * @internal
 */
export const createSpan = createSpanFunction({
    packagePrefix: "Azure.Storage.Blob",
    namespace: "Microsoft.Storage",
});
/**
 * @internal
 *
 * Adapt the tracing options from OperationOptions to what they need to be for
 * RequestOptionsBase (when we update to later OpenTelemetry versions this is now
 * two separate fields, not just one).
 */
export function convertTracingToRequestOptionsBase(options) {
    var _a, _b;
    return {
        // By passing spanOptions if they exist at runtime, we're backwards compatible with @azure/core-tracing@preview.13 and earlier.
        spanOptions: (_a = options === null || options === void 0 ? void 0 : options.tracingOptions) === null || _a === void 0 ? void 0 : _a.spanOptions,
        tracingContext: (_b = options === null || options === void 0 ? void 0 : options.tracingOptions) === null || _b === void 0 ? void 0 : _b.tracingContext,
    };
}
//# sourceMappingURL=tracing.js.map