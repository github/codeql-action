import * as ts from "typescript";
import { LongType } from "@protobuf-ts/runtime";
import { DescriptorProto, DescriptorRegistry, FileOptions_OptimizeMode as OptimizeMode, SymbolTable, TypescriptFile, TypeScriptImports } from "@protobuf-ts/plugin-framework";
import { CommentGenerator } from "./comment-generator";
import { Interpreter } from "../interpreter";
import { GeneratorBase } from "./generator-base";
export interface CustomMethodGenerator {
    make(source: TypescriptFile, descriptor: DescriptorProto): ts.MethodDeclaration[];
}
export declare class MessageTypeGenerator extends GeneratorBase {
    private readonly options;
    private readonly wellKnown;
    private readonly googleTypes;
    private readonly typeMethodCreate;
    private readonly typeMethodInternalBinaryRead;
    private readonly typeMethodInternalBinaryWrite;
    private readonly fieldInfoGenerator;
    constructor(symbols: SymbolTable, registry: DescriptorRegistry, imports: TypeScriptImports, comments: CommentGenerator, interpreter: Interpreter, options: {
        runtimeImportPath: string;
        normalLongType: LongType;
        oneofKindDiscriminator: string;
        useProtoFieldName: boolean;
    });
    /**
     * Declare a handler for the message. The handler provides
     * functions to read / write messages of the specific type.
     *
     * For the following .proto:
     *
     *   package test;
     *   message MyMessage {
     *     string str_field = 1;
     *   }
     *
     * We generate the following variable declaration:
     *
     *   import { H } from "R";
     *   const MyMessage: H<MyMessage> =
     *     new H<MyMessage>(
     *       ".test.MyMessage",
     *       [{ no: 0, name: "str_field", kind: "scalar", T: 9 }]
     *     );
     *
     * H is the concrete class imported from runtime R.
     * Some field information is passed to the handler's
     * constructor.
     */
    generateMessageType(source: TypescriptFile, descriptor: DescriptorProto, optimizeFor: OptimizeMode): void;
}
