"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceClientGeneratorGrpc = void 0;
const service_client_generator_base_1 = require("./service-client-generator-base");
const ts = require("typescript");
const runtime_1 = require("@protobuf-ts/runtime");
class ServiceClientGeneratorGrpc extends service_client_generator_base_1.ServiceClientGeneratorBase {
    constructor() {
        super(...arguments);
        this.symbolKindInterface = 'grpc1-client-interface';
        this.symbolKindImplementation = 'grpc1-client';
    }
    generateImplementationClass(source, descriptor) {
        const interpreterType = this.interpreter.getServiceType(descriptor), ServiceClient = this.imports.type(source, descriptor, this.symbolKindImplementation), IServiceClient = this.imports.type(source, descriptor, this.symbolKindInterface), BinaryReadOptions = this.imports.name(source, 'BinaryReadOptions', this.options.runtimeImportPath, true), BinaryWriteOptions = this.imports.name(source, 'BinaryWriteOptions', this.options.runtimeImportPath, true), grpc = this.imports.namespace(source, 'grpc', '@grpc/grpc-js');
        const members = [
            // private readonly _binaryOptions: Partial<BinaryReadOptions & BinaryWriteOptions>;
            ts.createProperty(undefined, [
                ts.createModifier(ts.SyntaxKind.PrivateKeyword),
                ts.createModifier(ts.SyntaxKind.ReadonlyKeyword)
            ], ts.createIdentifier("_binaryOptions"), undefined, ts.createTypeReferenceNode(ts.createIdentifier("Partial"), [ts.createIntersectionTypeNode([
                    ts.createTypeReferenceNode(ts.createIdentifier(BinaryReadOptions), undefined),
                    ts.createTypeReferenceNode(ts.createIdentifier(BinaryWriteOptions), undefined)
                ])]), undefined),
            //
            ts.createConstructor(undefined, undefined, [
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("address"), undefined, ts.createKeywordTypeNode(ts.SyntaxKind.StringKeyword), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("credentials"), undefined, ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ChannelCredentials")), undefined), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), undefined, ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientOptions")), undefined), ts.createObjectLiteral([], false)),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("binaryOptions"), undefined, ts.createTypeReferenceNode(ts.createIdentifier("Partial"), [ts.createIntersectionTypeNode([
                        ts.createTypeReferenceNode(ts.createIdentifier(BinaryReadOptions), undefined),
                        ts.createTypeReferenceNode(ts.createIdentifier(BinaryWriteOptions), undefined)
                    ])]), ts.createObjectLiteral([], false))
            ], ts.createBlock([
                ts.createExpressionStatement(ts.createCall(ts.createSuper(), undefined, [
                    ts.createIdentifier("address"),
                    ts.createIdentifier("credentials"),
                    ts.createIdentifier("options")
                ])),
                ts.createExpressionStatement(ts.createBinary(ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_binaryOptions")), ts.createToken(ts.SyntaxKind.EqualsToken), ts.createIdentifier("binaryOptions")))
            ], true)),
            ...interpreterType.methods.map(mi => {
                const declaration = this.createMethod(source, mi);
                const methodDescriptor = descriptor.method.find(md => md.name === mi.name);
                runtime_1.assert(methodDescriptor);
                this.comments.addCommentsForDescriptor(declaration, methodDescriptor, 'appendToLeadingBlock');
                return declaration;
            })
        ];
        // export class MyService implements MyService, ServiceInfo
        const statement = ts.createClassDeclaration(undefined, [ts.createModifier(ts.SyntaxKind.ExportKeyword)], ServiceClient, undefined, [
            ts.createHeritageClause(ts.SyntaxKind.ExtendsKeyword, [ts.createExpressionWithTypeArguments(undefined, ts.createPropertyAccess(ts.createIdentifier(grpc), ts.createIdentifier("Client")))]),
            ts.createHeritageClause(ts.SyntaxKind.ImplementsKeyword, [ts.createExpressionWithTypeArguments(undefined, ts.createIdentifier(IServiceClient))])
        ], members);
        source.addStatement(statement);
        this.comments.addCommentsForDescriptor(statement, descriptor, 'appendToLeadingBlock');
        return statement;
    }
    createUnarySignatures(source, methodInfo) {
        let grpc = this.imports.namespace(source, 'grpc', '@grpc/grpc-js');
        return [
            ts.createMethodSignature(undefined, [
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("input"), undefined, this.makeI(source, methodInfo, true), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("metadata"), undefined, ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("Metadata")), undefined), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), undefined, ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("callback"), undefined, ts.createFunctionTypeNode(undefined, [
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("err"), undefined, ts.createUnionTypeNode([
                        ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ServiceError")), undefined),
                        ts.createKeywordTypeNode(ts.SyntaxKind.NullKeyword)
                    ]), undefined),
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.QuestionToken), this.makeO(source, methodInfo, true), undefined)
                ], ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)), undefined)
            ], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientUnaryCall")), undefined), ts.createIdentifier(methodInfo.localName), undefined),
            ts.createMethodSignature(undefined, [
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("input"), undefined, this.makeI(source, methodInfo, true), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("metadata"), undefined, ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("Metadata")), undefined), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("callback"), undefined, ts.createFunctionTypeNode(undefined, [
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("err"), undefined, ts.createUnionTypeNode([
                        ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ServiceError")), undefined),
                        ts.createKeywordTypeNode(ts.SyntaxKind.NullKeyword)
                    ]), undefined),
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.QuestionToken), this.makeO(source, methodInfo, true), undefined)
                ], ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)), undefined)
            ], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientUnaryCall")), undefined), ts.createIdentifier(methodInfo.localName), undefined),
            ts.createMethodSignature(undefined, [
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("input"), undefined, this.makeI(source, methodInfo, true), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), undefined, ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("callback"), undefined, ts.createFunctionTypeNode(undefined, [
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("err"), undefined, ts.createUnionTypeNode([
                        ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ServiceError")), undefined),
                        ts.createKeywordTypeNode(ts.SyntaxKind.NullKeyword)
                    ]), undefined),
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.QuestionToken), this.makeO(source, methodInfo, true), undefined)
                ], ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)), undefined)
            ], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientUnaryCall")), undefined), ts.createIdentifier(methodInfo.localName), undefined),
            ts.createMethodSignature(undefined, [
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("input"), undefined, this.makeI(source, methodInfo, true), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("callback"), undefined, ts.createFunctionTypeNode(undefined, [
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("err"), undefined, ts.createUnionTypeNode([
                        ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ServiceError")), undefined),
                        ts.createKeywordTypeNode(ts.SyntaxKind.NullKeyword)
                    ]), undefined),
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.QuestionToken), this.makeO(source, methodInfo, true), undefined)
                ], ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)), undefined)
            ], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientUnaryCall")), undefined), ts.createIdentifier(methodInfo.localName), undefined)
        ];
    }
    createServerStreamingSignatures(source, methodInfo) {
        let grpc = this.imports.namespace(source, 'grpc', '@grpc/grpc-js');
        return [
            ts.createMethodSignature(undefined, [
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("input"), undefined, this.makeI(source, methodInfo, true), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("metadata"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("Metadata")), undefined), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined), undefined)
            ], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientReadableStream")), [this.makeO(source, methodInfo, true)]), ts.createIdentifier(methodInfo.localName), undefined),
            ts.createMethodSignature(undefined, [
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("input"), undefined, this.makeI(source, methodInfo, true), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined), undefined)
            ], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientReadableStream")), [this.makeO(source, methodInfo, true)]), ts.createIdentifier(methodInfo.localName), undefined)
        ];
    }
    createClientStreamingSignatures(source, methodInfo) {
        let grpc = this.imports.namespace(source, 'grpc', '@grpc/grpc-js');
        return [
            ts.createMethodSignature(undefined, [
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("metadata"), undefined, ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("Metadata")), undefined), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), undefined, ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("callback"), undefined, ts.createFunctionTypeNode(undefined, [
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("err"), undefined, ts.createUnionTypeNode([
                        ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ServiceError")), undefined),
                        ts.createKeywordTypeNode(ts.SyntaxKind.NullKeyword)
                    ]), undefined),
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.QuestionToken), this.makeO(source, methodInfo, true), undefined)
                ], ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)), undefined)
            ], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientWritableStream")), [this.makeI(source, methodInfo, true)]), ts.createIdentifier(methodInfo.localName), undefined),
            ts.createMethodSignature(undefined, [
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("metadata"), undefined, ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("Metadata")), undefined), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("callback"), undefined, ts.createFunctionTypeNode(undefined, [
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("err"), undefined, ts.createUnionTypeNode([
                        ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ServiceError")), undefined),
                        ts.createKeywordTypeNode(ts.SyntaxKind.NullKeyword)
                    ]), undefined),
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.QuestionToken), this.makeO(source, methodInfo, true), undefined)
                ], ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)), undefined)
            ], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientWritableStream")), [this.makeI(source, methodInfo, true)]), ts.createIdentifier(methodInfo.localName), undefined),
            ts.createMethodSignature(undefined, [
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), undefined, ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("callback"), undefined, ts.createFunctionTypeNode(undefined, [
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("err"), undefined, ts.createUnionTypeNode([
                        ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ServiceError")), undefined),
                        ts.createKeywordTypeNode(ts.SyntaxKind.NullKeyword)
                    ]), undefined),
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.QuestionToken), this.makeO(source, methodInfo, true), undefined)
                ], ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)), undefined)
            ], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientWritableStream")), [
                this.makeI(source, methodInfo, true),
            ]), ts.createIdentifier(methodInfo.localName), undefined),
            ts.createMethodSignature(undefined, [ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("callback"), undefined, ts.createFunctionTypeNode(undefined, [
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("err"), undefined, ts.createUnionTypeNode([
                        ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ServiceError")), undefined),
                        ts.createKeywordTypeNode(ts.SyntaxKind.NullKeyword)
                    ]), undefined),
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.QuestionToken), this.makeO(source, methodInfo, true), undefined)
                ], ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)), undefined)], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientWritableStream")), [
                this.makeI(source, methodInfo, true),
            ]), ts.createIdentifier(methodInfo.localName), undefined)
        ];
    }
    createDuplexStreamingSignatures(source, methodInfo) {
        let grpc = this.imports.namespace(source, 'grpc', '@grpc/grpc-js');
        return [
            ts.createMethodSignature(undefined, [
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("metadata"), undefined, ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("Metadata")), undefined), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined), undefined)
            ], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientDuplexStream")), [
                this.makeI(source, methodInfo, true),
                this.makeO(source, methodInfo, true),
            ]), ts.createIdentifier(methodInfo.localName), undefined),
            ts.createMethodSignature(undefined, [ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined), undefined)], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientDuplexStream")), [
                this.makeI(source, methodInfo, true),
                this.makeO(source, methodInfo, true),
            ]), ts.createIdentifier(methodInfo.localName), undefined)
        ];
    }
    createUnary(source, methodInfo) {
        let grpc = this.imports.namespace(source, 'grpc', '@grpc/grpc-js');
        let ServiceType = this.imports.type(source, this.registry.resolveTypeName(methodInfo.service.typeName));
        let methodIndex = methodInfo.service.methods.indexOf(methodInfo);
        return ts.createMethod(undefined, undefined, undefined, ts.createIdentifier(methodInfo.localName), undefined, undefined, [
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("input"), undefined, this.makeI(source, methodInfo, true), undefined),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("metadata"), undefined, ts.createUnionTypeNode([
                ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("Metadata")), undefined),
                ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined),
                ts.createParenthesizedType(ts.createFunctionTypeNode(undefined, [
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("err"), undefined, ts.createUnionTypeNode([
                        ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ServiceError")), undefined),
                        ts.createKeywordTypeNode(ts.SyntaxKind.NullKeyword)
                    ]), undefined),
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.QuestionToken), this.makeO(source, methodInfo, true), undefined)
                ], ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)))
            ]), undefined),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createUnionTypeNode([
                ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined),
                ts.createParenthesizedType(ts.createFunctionTypeNode(undefined, [
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("err"), undefined, ts.createUnionTypeNode([
                        ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ServiceError")), undefined),
                        ts.createKeywordTypeNode(ts.SyntaxKind.NullKeyword)
                    ]), undefined),
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.QuestionToken), this.makeO(source, methodInfo, true), undefined)
                ], ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)))
            ]), undefined),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("callback"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createParenthesizedType(ts.createFunctionTypeNode(undefined, [
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("err"), undefined, ts.createUnionTypeNode([
                    ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ServiceError")), undefined),
                    ts.createKeywordTypeNode(ts.SyntaxKind.NullKeyword)
                ]), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.QuestionToken), this.makeO(source, methodInfo, true), undefined)
            ], ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword))), undefined)
        ], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientUnaryCall")), undefined), ts.createBlock([
            ts.createVariableStatement(undefined, ts.createVariableDeclarationList([ts.createVariableDeclaration(ts.createIdentifier("method"), undefined, ts.createElementAccess(ts.createPropertyAccess(ts.createIdentifier(ServiceType), ts.createIdentifier("methods")), ts.createNumericLiteral(methodIndex.toString())))], ts.NodeFlags.Const)),
            ts.createReturn(ts.createCall(ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("makeUnaryRequest")), [
                this.makeI(source, methodInfo, true),
                this.makeO(source, methodInfo, true)
            ], [
                ts.createTemplateExpression(ts.createTemplateHead("/", "/"), [
                    ts.createTemplateSpan(ts.createPropertyAccess(ts.createIdentifier(ServiceType), ts.createIdentifier("typeName")), ts.createTemplateMiddle("/", "/")),
                    ts.createTemplateSpan(ts.createPropertyAccess(ts.createIdentifier("method"), ts.createIdentifier("name")), ts.createTemplateTail("", ""))
                ]),
                ts.createArrowFunction(undefined, undefined, [ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), undefined, this.makeI(source, methodInfo, true), undefined)], ts.createTypeReferenceNode(ts.createIdentifier("Buffer"), undefined), ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.createCall(ts.createPropertyAccess(ts.createIdentifier("Buffer"), ts.createIdentifier("from")), undefined, [ts.createCall(ts.createPropertyAccess(ts.createPropertyAccess(ts.createIdentifier("method"), ts.createIdentifier("I")), ts.createIdentifier("toBinary")), undefined, [
                        ts.createIdentifier("value"),
                        ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_binaryOptions"))
                    ])])),
                ts.createArrowFunction(undefined, undefined, [ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), undefined, ts.createTypeReferenceNode(ts.createIdentifier("Buffer"), undefined), undefined)], this.makeO(source, methodInfo, true), ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.createCall(ts.createPropertyAccess(ts.createPropertyAccess(ts.createIdentifier("method"), ts.createIdentifier("O")), ts.createIdentifier("fromBinary")), undefined, [
                    ts.createIdentifier("value"),
                    ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_binaryOptions"))
                ])),
                ts.createIdentifier("input"),
                ts.createAsExpression(ts.createIdentifier("metadata"), ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)),
                ts.createAsExpression(ts.createIdentifier("options"), ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)),
                ts.createAsExpression(ts.createIdentifier("callback"), ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword))
            ]))
        ], true));
    }
    createServerStreaming(source, methodInfo) {
        let grpc = this.imports.namespace(source, 'grpc', '@grpc/grpc-js');
        let ServiceType = this.imports.type(source, this.registry.resolveTypeName(methodInfo.service.typeName));
        let methodIndex = methodInfo.service.methods.indexOf(methodInfo);
        return ts.createMethod(undefined, undefined, undefined, ts.createIdentifier(methodInfo.localName), undefined, undefined, [
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("input"), undefined, this.makeI(source, methodInfo, true), undefined),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("metadata"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createUnionTypeNode([
                ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("Metadata")), undefined),
                ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined)
            ]), undefined),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined), undefined)
        ], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientReadableStream")), [this.makeO(source, methodInfo, true)]), ts.createBlock([
            ts.createVariableStatement(undefined, ts.createVariableDeclarationList([ts.createVariableDeclaration(ts.createIdentifier("method"), undefined, ts.createElementAccess(ts.createPropertyAccess(ts.createIdentifier(ServiceType), ts.createIdentifier("methods")), ts.createNumericLiteral(methodIndex.toString())))], ts.NodeFlags.Const)),
            ts.createReturn(ts.createCall(ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("makeServerStreamRequest")), [
                this.makeI(source, methodInfo, true),
                this.makeO(source, methodInfo, true)
            ], [
                ts.createTemplateExpression(ts.createTemplateHead("/", "/"), [
                    ts.createTemplateSpan(ts.createPropertyAccess(ts.createIdentifier(ServiceType), ts.createIdentifier("typeName")), ts.createTemplateMiddle("/", "/")),
                    ts.createTemplateSpan(ts.createPropertyAccess(ts.createIdentifier("method"), ts.createIdentifier("name")), ts.createTemplateTail("", ""))
                ]),
                ts.createArrowFunction(undefined, undefined, [ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), undefined, this.makeI(source, methodInfo, true), undefined)], ts.createTypeReferenceNode(ts.createIdentifier("Buffer"), undefined), ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.createCall(ts.createPropertyAccess(ts.createIdentifier("Buffer"), ts.createIdentifier("from")), undefined, [ts.createCall(ts.createPropertyAccess(ts.createPropertyAccess(ts.createIdentifier("method"), ts.createIdentifier("I")), ts.createIdentifier("toBinary")), undefined, [
                        ts.createIdentifier("value"),
                        ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_binaryOptions"))
                    ])])),
                ts.createArrowFunction(undefined, undefined, [ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), undefined, ts.createTypeReferenceNode(ts.createIdentifier("Buffer"), undefined), undefined)], this.makeO(source, methodInfo, true), ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.createCall(ts.createPropertyAccess(ts.createPropertyAccess(ts.createIdentifier("method"), ts.createIdentifier("O")), ts.createIdentifier("fromBinary")), undefined, [
                    ts.createIdentifier("value"),
                    ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_binaryOptions"))
                ])),
                ts.createIdentifier("input"),
                ts.createAsExpression(ts.createIdentifier("metadata"), ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)),
                ts.createIdentifier("options")
            ]))
        ], true));
    }
    createClientStreaming(source, methodInfo) {
        let grpc = this.imports.namespace(source, 'grpc', '@grpc/grpc-js');
        let ServiceType = this.imports.type(source, this.registry.resolveTypeName(methodInfo.service.typeName));
        let methodIndex = methodInfo.service.methods.indexOf(methodInfo);
        return ts.createMethod(undefined, undefined, undefined, ts.createIdentifier(methodInfo.localName), undefined, undefined, [
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("metadata"), undefined, ts.createUnionTypeNode([
                ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("Metadata")), undefined),
                ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined),
                ts.createParenthesizedType(ts.createFunctionTypeNode(undefined, [
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("err"), undefined, ts.createUnionTypeNode([
                        ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ServiceError")), undefined),
                        ts.createKeywordTypeNode(ts.SyntaxKind.NullKeyword)
                    ]), undefined),
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.QuestionToken), this.makeO(source, methodInfo, true), undefined)
                ], ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)))
            ]), undefined),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createUnionTypeNode([
                ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined),
                ts.createParenthesizedType(ts.createFunctionTypeNode(undefined, [
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("err"), undefined, ts.createUnionTypeNode([
                        ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ServiceError")), undefined),
                        ts.createKeywordTypeNode(ts.SyntaxKind.NullKeyword)
                    ]), undefined),
                    ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.QuestionToken), this.makeO(source, methodInfo, true), undefined)
                ], ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)))
            ]), undefined),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("callback"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createParenthesizedType(ts.createFunctionTypeNode(undefined, [
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("err"), undefined, ts.createUnionTypeNode([
                    ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ServiceError")), undefined),
                    ts.createKeywordTypeNode(ts.SyntaxKind.NullKeyword)
                ]), undefined),
                ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.QuestionToken), this.makeO(source, methodInfo, true), undefined)
            ], ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword))), undefined)
        ], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientWritableStream")), [this.makeI(source, methodInfo, true)]), ts.createBlock([
            ts.createVariableStatement(undefined, ts.createVariableDeclarationList([ts.createVariableDeclaration(ts.createIdentifier("method"), undefined, ts.createElementAccess(ts.createPropertyAccess(ts.createIdentifier(ServiceType), ts.createIdentifier("methods")), ts.createNumericLiteral(methodIndex.toString())))], ts.NodeFlags.Const)),
            ts.createReturn(ts.createCall(ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("makeClientStreamRequest")), [
                this.makeI(source, methodInfo, true),
                this.makeO(source, methodInfo, true)
            ], [
                ts.createTemplateExpression(ts.createTemplateHead("/", "/"), [
                    ts.createTemplateSpan(ts.createPropertyAccess(ts.createIdentifier(ServiceType), ts.createIdentifier("typeName")), ts.createTemplateMiddle("/", "/")),
                    ts.createTemplateSpan(ts.createPropertyAccess(ts.createIdentifier("method"), ts.createIdentifier("name")), ts.createTemplateTail("", ""))
                ]),
                ts.createArrowFunction(undefined, undefined, [ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), undefined, this.makeI(source, methodInfo, true), undefined)], ts.createTypeReferenceNode(ts.createIdentifier("Buffer"), undefined), ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.createCall(ts.createPropertyAccess(ts.createIdentifier("Buffer"), ts.createIdentifier("from")), undefined, [ts.createCall(ts.createPropertyAccess(ts.createPropertyAccess(ts.createIdentifier("method"), ts.createIdentifier("I")), ts.createIdentifier("toBinary")), undefined, [
                        ts.createIdentifier("value"),
                        ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_binaryOptions"))
                    ])])),
                ts.createArrowFunction(undefined, undefined, [ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), undefined, ts.createTypeReferenceNode(ts.createIdentifier("Buffer"), undefined), undefined)], this.makeO(source, methodInfo, true), ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.createCall(ts.createPropertyAccess(ts.createPropertyAccess(ts.createIdentifier("method"), ts.createIdentifier("O")), ts.createIdentifier("fromBinary")), undefined, [
                    ts.createIdentifier("value"),
                    ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_binaryOptions"))
                ])),
                ts.createAsExpression(ts.createIdentifier("metadata"), ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)),
                ts.createAsExpression(ts.createIdentifier("options"), ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)),
                ts.createAsExpression(ts.createIdentifier("callback"), ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword))
            ]))
        ], true));
    }
    createDuplexStreaming(source, methodInfo) {
        let grpc = this.imports.namespace(source, 'grpc', '@grpc/grpc-js');
        let ServiceType = this.imports.type(source, this.registry.resolveTypeName(methodInfo.service.typeName));
        return ts.createMethod(undefined, undefined, undefined, ts.createIdentifier(methodInfo.localName), undefined, undefined, [
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("metadata"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createUnionTypeNode([
                ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("Metadata")), undefined),
                ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined)
            ]), undefined),
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("options"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("CallOptions")), undefined), undefined)
        ], ts.createTypeReferenceNode(ts.createQualifiedName(ts.createIdentifier(grpc), ts.createIdentifier("ClientDuplexStream")), [
            this.makeI(source, methodInfo, true),
            this.makeO(source, methodInfo, true)
        ]), ts.createBlock([
            ts.createVariableStatement(undefined, ts.createVariableDeclarationList([ts.createVariableDeclaration(ts.createIdentifier("method"), undefined, ts.createElementAccess(ts.createPropertyAccess(ts.createIdentifier(ServiceType), ts.createIdentifier("methods")), ts.createNumericLiteral(methodInfo.service.methods.indexOf(methodInfo).toString())))], ts.NodeFlags.Const)),
            ts.createReturn(ts.createCall(ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("makeBidiStreamRequest")), [
                this.makeI(source, methodInfo, true),
                this.makeO(source, methodInfo, true)
            ], [
                ts.createTemplateExpression(ts.createTemplateHead("/", "/"), [
                    ts.createTemplateSpan(ts.createPropertyAccess(ts.createIdentifier(ServiceType), ts.createIdentifier("typeName")), ts.createTemplateMiddle("/", "/")),
                    ts.createTemplateSpan(ts.createPropertyAccess(ts.createIdentifier("method"), ts.createIdentifier("name")), ts.createTemplateTail("", ""))
                ]),
                ts.createArrowFunction(undefined, undefined, [ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), undefined, this.makeI(source, methodInfo, true), undefined)], ts.createTypeReferenceNode(ts.createIdentifier("Buffer"), undefined), ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.createCall(ts.createPropertyAccess(ts.createIdentifier("Buffer"), ts.createIdentifier("from")), undefined, [ts.createCall(ts.createPropertyAccess(ts.createPropertyAccess(ts.createIdentifier("method"), ts.createIdentifier("I")), ts.createIdentifier("toBinary")), undefined, [
                        ts.createIdentifier("value"),
                        ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_binaryOptions"))
                    ])])),
                ts.createArrowFunction(undefined, undefined, [ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), undefined, ts.createTypeReferenceNode(ts.createIdentifier("Buffer"), undefined), undefined)], this.makeO(source, methodInfo, true), ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.createCall(ts.createPropertyAccess(ts.createPropertyAccess(ts.createIdentifier("method"), ts.createIdentifier("O")), ts.createIdentifier("fromBinary")), undefined, [
                    ts.createIdentifier("value"),
                    ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("_binaryOptions"))
                ])),
                ts.createAsExpression(ts.createIdentifier("metadata"), ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)),
                ts.createIdentifier("options")
            ]))
        ], true));
    }
}
exports.ServiceClientGeneratorGrpc = ServiceClientGeneratorGrpc;
