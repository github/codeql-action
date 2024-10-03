import { DescriptorRegistry, ServiceDescriptorProto, SymbolTable, TypescriptFile, TypeScriptImports } from "@protobuf-ts/plugin-framework";
import * as ts from "typescript";
import * as rpc from "@protobuf-ts/runtime-rpc";
import { CommentGenerator } from "./comment-generator";
import { Interpreter } from "../interpreter";
import { GeneratorBase } from "./generator-base";
export declare abstract class ServiceClientGeneratorBase extends GeneratorBase {
    protected readonly options: {
        runtimeImportPath: string;
        runtimeRpcImportPath: string;
    };
    abstract readonly symbolKindInterface: string;
    abstract readonly symbolKindImplementation: string;
    constructor(symbols: SymbolTable, registry: DescriptorRegistry, imports: TypeScriptImports, comments: CommentGenerator, interpreter: Interpreter, options: {
        runtimeImportPath: string;
        runtimeRpcImportPath: string;
    });
    registerSymbols(source: TypescriptFile, descriptor: ServiceDescriptorProto): void;
    /**
     * For the following .proto:
     *
     *   service SimpleService {
     *     rpc Get (GetRequest) returns (GetResponse);
     *   }
     *
     * We generate the following interface:
     *
     *   interface ISimpleServiceClient {
     *     get(request: GetRequest, options?: RpcOptions): UnaryCall<ExampleRequest, ExampleResponse>;
     *   }
     *
     */
    generateInterface(source: TypescriptFile, descriptor: ServiceDescriptorProto): ts.InterfaceDeclaration;
    protected createMethodSignatures(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodSignature[];
    protected createUnarySignatures(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodSignature[];
    protected createServerStreamingSignatures(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodSignature[];
    protected createClientStreamingSignatures(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodSignature[];
    protected createDuplexStreamingSignatures(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodSignature[];
    /**
     * For the following .proto:
     *
     *   service SimpleService {
     *     rpc Get (GetRequest) returns (GetResponse);
     *   }
     *
     * We generate:
     *
     *   class SimpleService implements ISimpleService {
     *     readonly typeName = ".spec.SimpleService";
     *     readonly methods: MethodInfo[] = [
     *       {name: 'Get', localName: 'get', I: GetRequest, O: GetResponse}
     *     ];
     *     ...
     *   }
     *
     */
    generateImplementationClass(source: TypescriptFile, descriptor: ServiceDescriptorProto): ts.ClassDeclaration;
    /**
     * Create any method type, switching to specific methods.
     */
    protected createMethod(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodDeclaration;
    protected abstract createUnary(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodDeclaration;
    protected abstract createServerStreaming(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodDeclaration;
    protected abstract createClientStreaming(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodDeclaration;
    protected abstract createDuplexStreaming(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodDeclaration;
    protected makeI(source: TypescriptFile, methodInfo: rpc.MethodInfo, isTypeOnly?: boolean): ts.TypeReferenceNode;
    protected makeO(source: TypescriptFile, methodInfo: rpc.MethodInfo, isTypeOnly?: boolean): ts.TypeReferenceNode;
}
