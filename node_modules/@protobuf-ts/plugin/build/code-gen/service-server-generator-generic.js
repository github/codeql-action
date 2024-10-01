"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceServerGeneratorGeneric = void 0;
const generator_base_1 = require("./generator-base");
const ts = require("typescript");
const runtime_1 = require("@protobuf-ts/runtime");
const local_type_name_1 = require("./local-type-name");
class ServiceServerGeneratorGeneric extends generator_base_1.GeneratorBase {
    constructor(symbols, registry, imports, comments, interpreter, options) {
        super(symbols, registry, imports, comments, interpreter);
        this.options = options;
        this.symbolKindInterface = 'generic-server-interface';
    }
    registerSymbols(source, descriptor) {
        const basename = local_type_name_1.createLocalTypeName(descriptor, this.registry);
        const interfaceName = `I${basename}`;
        this.symbols.register(interfaceName, descriptor, source, this.symbolKindInterface);
    }
    generateInterface(source, descriptor) {
        const interpreterType = this.interpreter.getServiceType(descriptor), IGenericServer = this.imports.type(source, descriptor, this.symbolKindInterface), ServerCallContext = this.imports.name(source, "ServerCallContext", this.options.runtimeRpcImportPath);
        const statement = ts.createInterfaceDeclaration(undefined, [ts.createModifier(ts.SyntaxKind.ExportKeyword)], ts.createIdentifier(IGenericServer), [
            ts.createTypeParameterDeclaration("T", undefined, ts.createTypeReferenceNode(ts.createIdentifier(ServerCallContext), undefined))
        ], undefined, interpreterType.methods.map(mi => {
            const methodDescriptor = descriptor.method.find(md => md.name === mi.name);
            runtime_1.assert(methodDescriptor);
            let signature;
            if (mi.serverStreaming && mi.clientStreaming) {
                signature = this.createBidi(source, mi);
            }
            else if (mi.serverStreaming) {
                signature = this.createServerStreaming(source, mi);
            }
            else if (mi.clientStreaming) {
                signature = this.createClientStreaming(source, mi);
            }
            else {
                signature = this.createUnary(source, mi);
            }
            this.comments.addCommentsForDescriptor(signature, methodDescriptor, 'appendToLeadingBlock');
            return signature;
        }));
        // add to our file
        this.comments.addCommentsForDescriptor(statement, descriptor, 'appendToLeadingBlock');
        source.addStatement(statement);
        return statement;
    }
    createUnary(source, methodInfo) {
        const I = ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source, this.registry.resolveTypeName(methodInfo.I.typeName))), undefined), O = ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source, this.registry.resolveTypeName(methodInfo.O.typeName))), undefined);
        return ts.createMethodSignature(undefined, [
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("request"), undefined, I, undefined),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("context"), undefined, ts.createTypeReferenceNode(ts.createIdentifier("T"), undefined), undefined)
        ], ts.createTypeReferenceNode(ts.createIdentifier("Promise"), [O]), ts.createIdentifier(methodInfo.localName), undefined);
    }
    createServerStreaming(source, methodInfo) {
        const I = ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source, this.registry.resolveTypeName(methodInfo.I.typeName))), undefined), O = ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source, this.registry.resolveTypeName(methodInfo.O.typeName))), undefined), RpcInputStream = this.imports.name(source, 'RpcInputStream', this.options.runtimeRpcImportPath);
        return ts.createMethodSignature(undefined, [
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("request"), undefined, I, undefined),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("responses"), undefined, ts.createTypeReferenceNode(ts.createIdentifier(RpcInputStream), [O]), undefined),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("context"), undefined, ts.createTypeReferenceNode(ts.createIdentifier("T"), undefined), undefined)
        ], ts.createTypeReferenceNode(ts.createIdentifier("Promise"), [ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)]), ts.createIdentifier(methodInfo.localName), undefined);
    }
    createClientStreaming(source, methodInfo) {
        const I = ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source, this.registry.resolveTypeName(methodInfo.I.typeName))), undefined), O = ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source, this.registry.resolveTypeName(methodInfo.O.typeName))), undefined), RpcOutputStream = this.imports.name(source, 'RpcOutputStream', this.options.runtimeRpcImportPath);
        return ts.createMethodSignature(undefined, [
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("requests"), undefined, ts.createTypeReferenceNode(ts.createIdentifier(RpcOutputStream), [I]), undefined),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("context"), undefined, ts.createTypeReferenceNode(ts.createIdentifier("T"), undefined), undefined)
        ], ts.createTypeReferenceNode(ts.createIdentifier("Promise"), [O]), ts.createIdentifier(methodInfo.localName), undefined);
    }
    createBidi(source, methodInfo) {
        const I = ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source, this.registry.resolveTypeName(methodInfo.I.typeName))), undefined), O = ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source, this.registry.resolveTypeName(methodInfo.O.typeName))), undefined), RpcOutputStream = this.imports.name(source, 'RpcOutputStream', this.options.runtimeRpcImportPath), RpcInputStream = this.imports.name(source, 'RpcInputStream', this.options.runtimeRpcImportPath);
        return ts.createMethodSignature(undefined, [
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("requests"), undefined, ts.createTypeReferenceNode(ts.createIdentifier(RpcOutputStream), [I]), undefined),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("responses"), undefined, ts.createTypeReferenceNode(ts.createIdentifier(RpcInputStream), [O]), undefined),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("context"), undefined, ts.createTypeReferenceNode(ts.createIdentifier("T"), undefined), undefined)
        ], ts.createTypeReferenceNode(ts.createIdentifier("Promise"), [ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)]), ts.createIdentifier(methodInfo.localName), undefined);
    }
}
exports.ServiceServerGeneratorGeneric = ServiceServerGeneratorGeneric;
