import { DescriptorProto, ITypeNameLookup, TypescriptFile, TypeScriptImports } from "@protobuf-ts/plugin-framework";
import * as ts from "typescript";
import { LongType } from "@protobuf-ts/runtime";
import { CustomMethodGenerator } from "../code-gen/message-type-generator";
export declare class GoogleTypes implements CustomMethodGenerator {
    private readonly typeNameLookup;
    private readonly imports;
    private readonly options;
    constructor(typeNameLookup: ITypeNameLookup, imports: TypeScriptImports, options: {
        normalLongType: LongType;
        runtimeImportPath: string;
        useProtoFieldName: boolean;
    });
    /**
     * Create custom methods for the handlers of some google types.
     */
    make(source: TypescriptFile, descriptor: DescriptorProto): ts.MethodDeclaration[];
    ['google.type.Color'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.type.Date'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.type.DateTime'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.type.TimeOfDay'](source: TypescriptFile, descriptor: DescriptorProto): string[];
}
