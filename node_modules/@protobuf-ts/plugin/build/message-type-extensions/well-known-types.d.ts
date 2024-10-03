import { DescriptorProto, ITypeNameLookup, TypescriptFile, TypeScriptImports } from "@protobuf-ts/plugin-framework";
import * as ts from "typescript";
import { LongType } from "@protobuf-ts/runtime";
import { CustomMethodGenerator } from "../code-gen/message-type-generator";
export declare class WellKnownTypes implements CustomMethodGenerator {
    private readonly typeNameLookup;
    private readonly imports;
    private readonly options;
    static readonly protoFilenames: string[];
    constructor(typeNameLookup: ITypeNameLookup, imports: TypeScriptImports, options: {
        normalLongType: LongType;
        runtimeImportPath: string;
        useProtoFieldName: boolean;
    });
    /**
     * Create custom methods for the handlers of well known types.
     *
     * Well known types have a custom JSON representation and we
     * also add some convenience methods, for example to convert a
     * `google.protobuf.Timestamp` to a javascript Date.
     */
    make(source: TypescriptFile, descriptor: DescriptorProto): ts.MethodDeclaration[];
    ['google.protobuf.Empty'](): void;
    ['google.protobuf.Any'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.protobuf.Timestamp'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.protobuf.Duration'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.protobuf.FieldMask'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.protobuf.Struct'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.protobuf.Value'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.protobuf.NullValue'](): void;
    ['google.protobuf.ListValue'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.protobuf.BoolValue'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.protobuf.StringValue'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.protobuf.DoubleValue'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.protobuf.FloatValue'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.protobuf.Int32Value'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.protobuf.UInt32Value'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.protobuf.Int64Value'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.protobuf.UInt64Value'](source: TypescriptFile, descriptor: DescriptorProto): string[];
    ['google.protobuf.BytesValue'](source: TypescriptFile, descriptor: DescriptorProto): string[];
}
