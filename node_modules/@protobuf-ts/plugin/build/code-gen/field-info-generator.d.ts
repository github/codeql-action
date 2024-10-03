import * as rt from "@protobuf-ts/runtime";
import * as ts from "typescript";
import { DescriptorRegistry, TypescriptFile, TypeScriptImports } from "@protobuf-ts/plugin-framework";
/**
 * Generates TypeScript code for runtime field information,
 * from runtime field information.
 */
export declare class FieldInfoGenerator {
    private readonly registry;
    private readonly imports;
    private readonly options;
    constructor(registry: DescriptorRegistry, imports: TypeScriptImports, options: {});
    createFieldInfoLiterals(source: TypescriptFile, fieldInfos: readonly rt.PartialFieldInfo[]): ts.ArrayLiteralExpression;
    createFieldInfoLiteral(source: TypescriptFile, fieldInfo: rt.PartialFieldInfo): ts.ObjectLiteralExpression;
    /**
     * Creates the interface field / oneof name based on original proto field name and naming options.
     */
    static createTypescriptLocalName(name: string, options: {
        useProtoFieldName: boolean;
    }): string;
    /**
     * Turn normalized field info returned by normalizeFieldInfo() back into
     * the minimized form.
     */
    private static denormalizeFieldInfo;
    private createMessageT;
    private createEnumT;
    private createRepeatType;
    private createScalarType;
    private createLongType;
    private createMapV;
}
