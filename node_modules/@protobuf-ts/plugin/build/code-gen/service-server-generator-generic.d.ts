import { GeneratorBase } from "./generator-base";
import { DescriptorRegistry, ServiceDescriptorProto, SymbolTable, TypescriptFile, TypeScriptImports } from "@protobuf-ts/plugin-framework";
import { Interpreter } from "../interpreter";
import * as ts from "typescript";
import { CommentGenerator } from "./comment-generator";
export declare class ServiceServerGeneratorGeneric extends GeneratorBase {
    private readonly options;
    private readonly symbolKindInterface;
    constructor(symbols: SymbolTable, registry: DescriptorRegistry, imports: TypeScriptImports, comments: CommentGenerator, interpreter: Interpreter, options: {
        runtimeRpcImportPath: string;
    });
    registerSymbols(source: TypescriptFile, descriptor: ServiceDescriptorProto): void;
    generateInterface(source: TypescriptFile, descriptor: ServiceDescriptorProto): ts.InterfaceDeclaration;
    private createUnary;
    private createServerStreaming;
    private createClientStreaming;
    private createBidi;
}
