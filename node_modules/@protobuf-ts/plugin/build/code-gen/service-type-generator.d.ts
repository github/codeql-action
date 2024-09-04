import { DescriptorRegistry, ServiceDescriptorProto, SymbolTable, TypescriptFile, TypeScriptImports } from "@protobuf-ts/plugin-framework";
import { Interpreter } from "../interpreter";
import { CommentGenerator } from "./comment-generator";
import { GeneratorBase } from "./generator-base";
export declare class ServiceTypeGenerator extends GeneratorBase {
    private readonly options;
    private readonly methodInfoGenerator;
    constructor(symbols: SymbolTable, registry: DescriptorRegistry, imports: TypeScriptImports, comments: CommentGenerator, interpreter: Interpreter, options: {
        runtimeRpcImportPath: string;
    });
    generateServiceType(source: TypescriptFile, descriptor: ServiceDescriptorProto): void;
}
