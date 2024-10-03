"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceClientGeneratorGeneric = void 0;
const ts = require("typescript");
const service_client_generator_base_1 = require("./service-client-generator-base");
const runtime_1 = require("@protobuf-ts/runtime");
class ServiceClientGeneratorGeneric extends service_client_generator_base_1.ServiceClientGeneratorBase {
    constructor() {
        super(...arguments);
        this.symbolKindInterface = 'call-client-interface';
        this.symbolKindImplementation = 'call-client';
    }
    createUnary(source, methodInfo) {
        let RpcOptions = this.imports.name(source, 'RpcOptions', this.options.runtimeRpcImportPath, true);
        let UnaryCall = this.imports.name(source, 'UnaryCall', this.options.runtimeRpcImportPath, true);
        let methodIndex = methodInfo.service.methods.indexOf(methodInfo);
        runtime_1.assert(methodIndex >= 0);
        return ts.createMethod(undefined, undefined, undefined, ts.createIdentifier(methodInfo.localName), undefined, undefined, [
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("input"), undefined, this.makeI(source, methodInfo, true)),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createTypeReferenceNode(ts.createIdentifier(RpcOptions), undefined), undefined)
        ], ts.createTypeReferenceNode(UnaryCall, [
            this.makeI(source, methodInfo, true),
            this.makeO(source, methodInfo, true),
        ]), ts.createBlock([
            // const method = this.methods[0], opt = this._transport.mergeOptions(options);
            ts.createVariableStatement(undefined, ts.createVariableDeclarationList([
                ts.createVariableDeclaration(ts.createIdentifier("method"), undefined, ts.createElementAccess(ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("methods")), ts.createNumericLiteral(methodIndex.toString()))),
                ts.createVariableDeclaration(ts.createIdentifier("opt"), undefined, ts.createCall(ts.createPropertyAccess(ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_transport")), ts.createIdentifier("mergeOptions")), undefined, [ts.createIdentifier("options")])),
            ], ts.NodeFlags.Const)),
            // return stackIntercept("unary", this._transport, method, opt, input);
            ts.createReturn(ts.createCall(ts.createIdentifier(this.imports.name(source, 'stackIntercept', this.options.runtimeRpcImportPath)), [
                this.makeI(source, methodInfo, true),
                this.makeO(source, methodInfo, true)
            ], [
                ts.createStringLiteral("unary"),
                ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_transport")),
                ts.createIdentifier("method"),
                ts.createIdentifier("opt"),
                ts.createIdentifier("input"),
            ])),
        ], true));
    }
    createServerStreaming(source, methodInfo) {
        let RpcOptions = this.imports.name(source, 'RpcOptions', this.options.runtimeRpcImportPath, true);
        let ServerStreamingCall = this.imports.name(source, 'ServerStreamingCall', this.options.runtimeRpcImportPath, true);
        let methodIndex = methodInfo.service.methods.indexOf(methodInfo);
        runtime_1.assert(methodIndex >= 0);
        return ts.createMethod(undefined, undefined, undefined, ts.createIdentifier(methodInfo.localName), undefined, undefined, [
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("input"), undefined, this.makeI(source, methodInfo, true)),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createTypeReferenceNode(ts.createIdentifier(RpcOptions), undefined), undefined)
        ], ts.createTypeReferenceNode(ServerStreamingCall, [
            this.makeI(source, methodInfo, true),
            this.makeO(source, methodInfo, true),
        ]), ts.createBlock([
            // const method = this.methods[0], opt = this._transport.mergeOptions(options);
            ts.createVariableStatement(undefined, ts.createVariableDeclarationList([
                ts.createVariableDeclaration(ts.createIdentifier("method"), undefined, ts.createElementAccess(ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("methods")), ts.createNumericLiteral(methodIndex.toString()))),
                ts.createVariableDeclaration(ts.createIdentifier("opt"), undefined, ts.createCall(ts.createPropertyAccess(ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_transport")), ts.createIdentifier("mergeOptions")), undefined, [ts.createIdentifier("options")])),
            ], ts.NodeFlags.Const)),
            // return stackIntercept("serverStreaming", this._transport, method, opt, i);
            ts.createReturn(ts.createCall(ts.createIdentifier(this.imports.name(source, 'stackIntercept', this.options.runtimeRpcImportPath)), [
                this.makeI(source, methodInfo, true),
                this.makeO(source, methodInfo, true)
            ], [
                ts.createStringLiteral("serverStreaming"),
                ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_transport")),
                ts.createIdentifier("method"),
                ts.createIdentifier("opt"),
                ts.createIdentifier("input"),
            ])),
        ], true));
    }
    createClientStreaming(source, methodInfo) {
        let RpcOptions = this.imports.name(source, 'RpcOptions', this.options.runtimeRpcImportPath, true);
        let ClientStreamingCall = this.imports.name(source, 'ClientStreamingCall', this.options.runtimeRpcImportPath, true);
        let methodIndex = methodInfo.service.methods.indexOf(methodInfo);
        runtime_1.assert(methodIndex >= 0);
        return ts.createMethod(undefined, undefined, undefined, ts.createIdentifier(methodInfo.localName), undefined, undefined, [
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createTypeReferenceNode(ts.createIdentifier(RpcOptions), undefined), undefined)
        ], ts.createTypeReferenceNode(ClientStreamingCall, [
            this.makeI(source, methodInfo, true),
            this.makeO(source, methodInfo, true),
        ]), ts.createBlock([
            // const method = this.methods[0], opt = this._transport.mergeOptions(options)
            ts.createVariableStatement(undefined, ts.createVariableDeclarationList([
                ts.createVariableDeclaration(ts.createIdentifier("method"), undefined, ts.createElementAccess(ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("methods")), ts.createNumericLiteral(methodIndex.toString()))),
                ts.createVariableDeclaration(ts.createIdentifier("opt"), undefined, ts.createCall(ts.createPropertyAccess(ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_transport")), ts.createIdentifier("mergeOptions")), undefined, [ts.createIdentifier("options")]))
            ], ts.NodeFlags.Const)),
            // return stackIntercept("clientStreaming", this._transport, methods, opt);
            ts.createReturn(ts.createCall(ts.createIdentifier(this.imports.name(source, 'stackIntercept', this.options.runtimeRpcImportPath)), [
                this.makeI(source, methodInfo, true),
                this.makeO(source, methodInfo, true)
            ], [
                ts.createStringLiteral("clientStreaming"),
                ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_transport")),
                ts.createIdentifier("method"),
                ts.createIdentifier("opt")
            ])),
        ], true));
    }
    createDuplexStreaming(source, methodInfo) {
        let RpcOptions = this.imports.name(source, 'RpcOptions', this.options.runtimeRpcImportPath, true);
        let DuplexStreamingCall = this.imports.name(source, 'DuplexStreamingCall', this.options.runtimeRpcImportPath, true);
        let methodIndex = methodInfo.service.methods.indexOf(methodInfo);
        runtime_1.assert(methodIndex >= 0);
        return ts.createMethod(undefined, undefined, undefined, ts.createIdentifier(methodInfo.localName), undefined, undefined, [
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createTypeReferenceNode(ts.createIdentifier(RpcOptions), undefined), undefined)
        ], ts.createTypeReferenceNode(DuplexStreamingCall, [
            this.makeI(source, methodInfo, true),
            this.makeO(source, methodInfo, true),
        ]), ts.createBlock([
            // const method = this.methods[0], opt = this._transport.mergeOptions(options)
            ts.createVariableStatement(undefined, ts.createVariableDeclarationList([
                ts.createVariableDeclaration(ts.createIdentifier("method"), undefined, ts.createElementAccess(ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("methods")), ts.createNumericLiteral(methodIndex.toString()))),
                ts.createVariableDeclaration(ts.createIdentifier("opt"), undefined, ts.createCall(ts.createPropertyAccess(ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_transport")), ts.createIdentifier("mergeOptions")), undefined, [ts.createIdentifier("options")]))
            ], ts.NodeFlags.Const)),
            // return stackIntercept("duplex", this._transport, this, methods, opt);
            ts.createReturn(ts.createCall(ts.createIdentifier(this.imports.name(source, 'stackIntercept', this.options.runtimeRpcImportPath)), [
                this.makeI(source, methodInfo, true),
                this.makeO(source, methodInfo, true)
            ], [
                ts.createStringLiteral("duplex"),
                ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_transport")),
                ts.createIdentifier("method"),
                ts.createIdentifier("opt")
            ])),
        ], true));
    }
}
exports.ServiceClientGeneratorGeneric = ServiceClientGeneratorGeneric;
