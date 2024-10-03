import { ServiceClientGeneratorBase } from "./service-client-generator-base";
import { ServiceDescriptorProto, TypescriptFile } from "@protobuf-ts/plugin-framework";
import * as ts from "typescript";
import * as rpc from "@protobuf-ts/runtime-rpc";
export declare class ServiceClientGeneratorGrpc extends ServiceClientGeneratorBase {
    readonly symbolKindInterface = "grpc1-client-interface";
    readonly symbolKindImplementation = "grpc1-client";
    generateImplementationClass(source: TypescriptFile, descriptor: ServiceDescriptorProto): ts.ClassDeclaration;
    protected createUnarySignatures(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodSignature[];
    protected createServerStreamingSignatures(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodSignature[];
    protected createClientStreamingSignatures(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodSignature[];
    protected createDuplexStreamingSignatures(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodSignature[];
    protected createUnary(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodDeclaration;
    protected createServerStreaming(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodDeclaration;
    protected createClientStreaming(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodDeclaration;
    protected createDuplexStreaming(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodDeclaration;
}
