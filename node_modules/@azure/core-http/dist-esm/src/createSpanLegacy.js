// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
// NOTE: we've moved this code into core-tracing but these functions
// were a part of the GA'd library and can't be removed until the next major
// release. They currently get called always, even if tracing is not enabled.
import { createSpanFunction as coreTracingCreateSpanFunction } from "@azure/core-tracing";
/**
 * This function is only here for compatibility. Use createSpanFunction in core-tracing.
 *
 * @deprecated This function is only here for compatibility. Use createSpanFunction in core-tracing.
 * @hidden

 * @param spanConfig - The name of the operation being performed.
 * @param tracingOptions - The options for the underlying http request.
 */
export function createSpanFunction(args) {
    return coreTracingCreateSpanFunction(args);
}
//# sourceMappingURL=createSpanLegacy.js.map