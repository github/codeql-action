import { DescriptorProto, DescriptorRegistry, TypescriptFile, TypeScriptImports } from "@protobuf-ts/plugin-framework";
import * as ts from "typescript";
import { LongType } from "@protobuf-ts/runtime";
import { Interpreter } from "../interpreter";
import { CustomMethodGenerator } from "../code-gen/message-type-generator";
/**
 * Generates a "create()" method for an `IMessageType`
 */
export declare class Create implements CustomMethodGenerator {
    private readonly registry;
    private readonly imports;
    private readonly interpreter;
    private readonly options;
    constructor(registry: DescriptorRegistry, imports: TypeScriptImports, interpreter: Interpreter, options: {
        normalLongType: LongType;
        oneofKindDiscriminator: string;
        runtimeImportPath: string;
    });
    make(source: TypescriptFile, descriptor: DescriptorProto): ts.MethodDeclaration[];
    makeMethod(source: TypescriptFile, descriptor: DescriptorProto, ...bodyStatements: readonly ts.Statement[]): ts.MethodDeclaration;
    makeMessageVariable(): ts.VariableStatement;
    makeMessagePropertyAssignments(source: TypescriptFile, descriptor: DescriptorProto): ts.ExpressionStatement[];
    makeMergeIf(source: TypescriptFile, descriptor: DescriptorProto): ts.IfStatement;
}
