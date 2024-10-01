import * as ts from "typescript";
import { ServiceClientGeneratorBase } from "./service-client-generator-base";
import * as rpc from "@protobuf-ts/runtime-rpc";
import { TypescriptFile } from "@protobuf-ts/plugin-framework";
export declare class ServiceClientGeneratorGeneric extends ServiceClientGeneratorBase {
    readonly symbolKindInterface = "call-client-interface";
    readonly symbolKindImplementation = "call-client";
    createUnary(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodDeclaration;
    createServerStreaming(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodDeclaration;
    createClientStreaming(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodDeclaration;
    createDuplexStreaming(source: TypescriptFile, methodInfo: rpc.MethodInfo): ts.MethodDeclaration;
}
