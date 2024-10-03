import { GeneratorBase } from "./generator-base";
import { DescriptorRegistry, ServiceDescriptorProto, SymbolTable, TypescriptFile, TypeScriptImports } from "@protobuf-ts/plugin-framework";
import { Interpreter } from "../interpreter";
import * as ts from "typescript";
import { CommentGenerator } from "./comment-generator";
export declare class ServiceServerGeneratorGrpc extends GeneratorBase {
    private readonly options;
    private readonly symbolKindInterface;
    private readonly symbolKindDefinition;
    constructor(symbols: SymbolTable, registry: DescriptorRegistry, imports: TypeScriptImports, comments: CommentGenerator, interpreter: Interpreter, options: {});
    registerSymbols(source: TypescriptFile, descriptor: ServiceDescriptorProto): void;
    generateInterface(source: TypescriptFile, descriptor: ServiceDescriptorProto): ts.InterfaceDeclaration;
    private createMethodPropertySignature;
    generateDefinition(source: TypescriptFile, descriptor: ServiceDescriptorProto): ts.VariableStatement;
    private makeDefinitionProperty;
}
