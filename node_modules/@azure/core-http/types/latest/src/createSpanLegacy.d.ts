import { Span } from "@azure/core-tracing";
import { OperationOptions } from "./operationOptions";
/**
 * This function is only here for compatibility. Use createSpanFunction in core-tracing.
 *
 * @deprecated This function is only here for compatibility. Use core-tracing instead.
 * @hidden
 */
export interface SpanConfig {
    /**
     * Package name prefix
     */
    packagePrefix: string;
    /**
     * Service namespace
     */
    namespace: string;
}
/**
 * This function is only here for compatibility. Use createSpanFunction in core-tracing.
 *
 * @deprecated This function is only here for compatibility. Use createSpanFunction in core-tracing.
 * @hidden

 * @param spanConfig - The name of the operation being performed.
 * @param tracingOptions - The options for the underlying http request.
 */
export declare function createSpanFunction(args: SpanConfig): <T extends OperationOptions>(operationName: string, operationOptions: T) => {
    span: Span;
    updatedOptions: T;
};
//# sourceMappingURL=createSpanLegacy.d.ts.map