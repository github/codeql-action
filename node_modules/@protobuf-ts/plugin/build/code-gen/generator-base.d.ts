import { CommentGenerator } from "./comment-generator";
import { DescriptorRegistry, SymbolTable, TypeScriptImports } from "@protobuf-ts/plugin-framework";
import { Interpreter } from "../interpreter";
export declare abstract class GeneratorBase {
    protected readonly symbols: SymbolTable;
    protected readonly registry: DescriptorRegistry;
    protected readonly imports: TypeScriptImports;
    protected readonly comments: CommentGenerator;
    protected readonly interpreter: Interpreter;
    protected constructor(symbols: SymbolTable, registry: DescriptorRegistry, imports: TypeScriptImports, comments: CommentGenerator, interpreter: Interpreter);
}
