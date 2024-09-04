"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceServerGeneratorGrpc = void 0;
const generator_base_1 = require("./generator-base");
const plugin_framework_1 = require("@protobuf-ts/plugin-framework");
const ts = require("typescript");
const runtime_1 = require("@protobuf-ts/runtime");
const local_type_name_1 = require("./local-type-name");
class ServiceServerGeneratorGrpc extends generator_base_1.GeneratorBase {
    constructor(symbols, registry, imports, comments, interpreter, options) {
        super(symbols, registry, imports, comments, interpreter);
        this.options = options;
        this.symbolKindInterface = 'grpc-server-interface';
        this.symbolKindDefinition = 'grpc-server-definition';
    }
    registerSymbols(source, descriptor) {
        const basename = local_type_name_1.createLocalTypeName(descriptor, this.registry);
        const interfaceName = `I${basename}`;
        const definitionName = `${basename[0].toLowerCase()}${basename.substring(1)}Definition`;
        this.symbols.register(interfaceName, descriptor, source, this.symbolKindInterface);
        this.symbols.register(definitionName, descriptor, source, this.symbolKindDefinition);
    }
    generateInterface(source, descriptor) {
        const interpreterType = this.interpreter.getServiceType(descriptor), IGrpcServer = this.imports.type(source, descriptor, this.symbolKindInterface), grpc = this.imports.namespace(source, 'grpc', '@grpc/grpc-js', true);
        const statement = ts.createInterfaceDeclaration(undefined, [ts.createModifier(ts.SyntaxKind.ExportKeyword)], ts.createIdentifier(IGrpcServer), undefined, [ts.createHeritageClause(ts.SyntaxKind.ExtendsKeyword, [ts.createExpressionWithTypeArguments(undefined, ts.createPropertyAccess(ts.createIdentifier(grpc), ts.createIdentifier("UntypedServiceImplementation")))])], interpreterType.methods.map(mi => {
            const methodDescriptor = descriptor.method.find(md => md.name === mi.name);
            runtime_1.assert(methodDescriptor);
            return this.createMethodPropertySignature(source, mi, methodDescriptor);
        }));
        // add to our file
        this.comments.addCommentsForDescriptor(statement, descriptor, 'appendToLeadingBlock');
        source.addStatement(statement);
        return statement;
    }
    createMethodPropertySignature(source, methodInfo, methodDescriptor) {
        const grpc = this.imports.namespace(source, 'grpc', '@grpc/grpc-js', true);
        let handler;
        if (methodInfo.serverStreaming && methodInfo.clientStreaming) {
            handler = 'handleBidiStreamingCall';
        }
        else if (methodInfo.serverStreaming) {
            handler = 'handleServerStreamingCall';
        }
        else if (methodInfo.clientStreaming) {
            handler = 'handleClientStreamingCall';
        }
        else {
            handler = 'handleUnaryCall';
        }
        const signature = ts.createPropertySignature(undefined, ts.createIdentifier(methodInfo.localName), undefined, ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier(handler)), [
            ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source, this.registry.resolveTypeName(methodInfo.I.typeName))), undefined),
            ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source, this.registry.resolveTypeName(methodInfo.O.typeName))), undefined),
        ]), undefined);
        this.comments.addCommentsForDescriptor(signature, methodDescriptor, 'appendToLeadingBlock');
        return signature;
    }
    generateDefinition(source, descriptor) {
        const grpcServerDefinition = this.imports.type(source, descriptor, this.symbolKindDefinition), IGrpcServer = this.imports.type(source, descriptor, this.symbolKindInterface), interpreterType = this.interpreter.getServiceType(descriptor), grpc = this.imports.namespace(source, 'grpc', '@grpc/grpc-js', true);
        const statement = ts.createVariableStatement([ts.createModifier(ts.SyntaxKind.ExportKeyword)], ts.createVariableDeclarationList([ts.createVariableDeclaration(ts.createIdentifier(grpcServerDefinition), ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ServiceDefinition")), [ts.createTypeReferenceNode(ts.createIdentifier(IGrpcServer), undefined)]), ts.createObjectLiteral(interpreterType.methods.map(mi => this.makeDefinitionProperty(source, mi)), true))], ts.NodeFlags.Const));
        // add to our file
        const doc = `@grpc/grpc-js definition for the protobuf ${this.registry.formatQualifiedName(descriptor)}.\n` +
            `\n` +
            `Usage: Implement the interface ${IGrpcServer} and add to a grpc server.\n` +
            `\n` +
            '```typescript\n' +
            `const server = new grpc.Server();\n` +
            `const service: ${IGrpcServer} = ...\n` +
            `server.addService(${grpcServerDefinition}, service);\n` +
            '```';
        plugin_framework_1.addCommentBlockAsJsDoc(statement, doc);
        source.addStatement(statement);
        return statement;
    }
    makeDefinitionProperty(source, methodInfo) {
        const I = this.imports.type(source, this.registry.resolveTypeName(methodInfo.I.typeName));
        const O = this.imports.type(source, this.registry.resolveTypeName(methodInfo.O.typeName));
        return ts.createPropertyAssignment(ts.createIdentifier(methodInfo.localName), ts.createObjectLiteral([
            ts.createPropertyAssignment(ts.createIdentifier("path"), ts.createStringLiteral(`/${methodInfo.service.typeName}/${methodInfo.name}`)),
            ts.createPropertyAssignment(ts.createIdentifier("originalName"), ts.createStringLiteral(methodInfo.name)),
            ts.createPropertyAssignment(ts.createIdentifier("requestStream"), methodInfo.clientStreaming ? ts.createTrue() : ts.createFalse()),
            ts.createPropertyAssignment(ts.createIdentifier("responseStream"), methodInfo.serverStreaming ? ts.createTrue() : ts.createFalse()),
            ts.createPropertyAssignment(ts.createIdentifier("responseDeserialize"), ts.createArrowFunction(undefined, undefined, [ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("bytes"), undefined, undefined, undefined)], undefined, ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.createCall(ts.createPropertyAccess(ts.createIdentifier(O), ts.createIdentifier("fromBinary")), undefined, [ts.createIdentifier("bytes")]))),
            ts.createPropertyAssignment(ts.createIdentifier("requestDeserialize"), ts.createArrowFunction(undefined, undefined, [ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("bytes"), undefined, undefined, undefined)], undefined, ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.createCall(ts.createPropertyAccess(ts.createIdentifier(I), ts.createIdentifier("fromBinary")), undefined, [ts.createIdentifier("bytes")]))),
            ts.createPropertyAssignment(ts.createIdentifier("responseSerialize"), ts.createArrowFunction(undefined, undefined, [ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), undefined, undefined, undefined)], undefined, ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.createCall(ts.createPropertyAccess(ts.createIdentifier("Buffer"), ts.createIdentifier("from")), undefined, [ts.createCall(ts.createPropertyAccess(ts.createIdentifier(O), ts.createIdentifier("toBinary")), undefined, [ts.createIdentifier("value")])]))),
            ts.createPropertyAssignment(ts.createIdentifier("requestSerialize"), ts.createArrowFunction(undefined, undefined, [ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), undefined, undefined, undefined)], undefined, ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.createCall(ts.createPropertyAccess(ts.createIdentifier("Buffer"), ts.createIdentifier("from")), undefined, [ts.createCall(ts.createPropertyAccess(ts.createIdentifier(I), ts.createIdentifier("toBinary")), undefined, [ts.createIdentifier("value")])])))
        ], true));
    }
}
exports.ServiceServerGeneratorGrpc = ServiceServerGeneratorGrpc;
