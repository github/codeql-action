import * as rpc from "@protobuf-ts/runtime-rpc";
import * as ts from "typescript";
import { DescriptorRegistry, TypescriptFile, TypeScriptImports } from "@protobuf-ts/plugin-framework";
/**
 * Generates TypeScript code for runtime method information,
 * from method field information.
 */
export declare class MethodInfoGenerator {
    private readonly registry;
    private readonly imports;
    constructor(registry: DescriptorRegistry, imports: TypeScriptImports);
    createMethodInfoLiterals(source: TypescriptFile, methodInfos: readonly rpc.PartialMethodInfo[]): ts.ArrayLiteralExpression;
    createMethodInfoLiteral(source: TypescriptFile, methodInfo: rpc.PartialMethodInfo): ts.ObjectLiteralExpression;
    /**
     * Turn normalized method info returned by normalizeMethodInfo() back into
     * the minimized form.
     */
    private static denormalizeMethodInfo;
}
