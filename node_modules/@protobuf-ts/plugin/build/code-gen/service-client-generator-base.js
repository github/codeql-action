"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceClientGeneratorBase = void 0;
const ts = require("typescript");
const generator_base_1 = require("./generator-base");
const local_type_name_1 = require("./local-type-name");
const runtime_1 = require("@protobuf-ts/runtime");
class ServiceClientGeneratorBase extends generator_base_1.GeneratorBase {
    constructor(symbols, registry, imports, comments, interpreter, options) {
        super(symbols, registry, imports, comments, interpreter);
        this.options = options;
    }
    registerSymbols(source, descriptor) {
        const basename = local_type_name_1.createLocalTypeName(descriptor, this.registry);
        const interfaceName = `I${basename}Client`;
        const implementationName = `${basename}Client`;
        this.symbols.register(interfaceName, descriptor, source, this.symbolKindInterface);
        this.symbols.register(implementationName, descriptor, source, this.symbolKindImplementation);
    }
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
    generateInterface(source, descriptor) {
        const interpreterType = this.interpreter.getServiceType(descriptor), IServiceClient = this.imports.type(source, descriptor, this.symbolKindInterface), signatures = [];
        for (let mi of interpreterType.methods) {
            const sig = this.createMethodSignatures(source, mi);
            // add comment to the first signature
            if (sig.length > 0) {
                const methodDescriptor = descriptor.method.find(md => md.name === mi.name);
                runtime_1.assert(methodDescriptor);
                this.comments.addCommentsForDescriptor(sig[0], methodDescriptor, 'appendToLeadingBlock');
            }
            signatures.push(...sig);
        }
        // export interface MyService {...
        let statement = ts.createInterfaceDeclaration(undefined, [ts.createModifier(ts.SyntaxKind.ExportKeyword)], IServiceClient, undefined, undefined, [...signatures]);
        // add to our file
        this.comments.addCommentsForDescriptor(statement, descriptor, 'appendToLeadingBlock');
        source.addStatement(statement);
        return statement;
    }
    createMethodSignatures(source, methodInfo) {
        let signatures;
        if (methodInfo.serverStreaming && methodInfo.clientStreaming) {
            signatures = this.createDuplexStreamingSignatures(source, methodInfo);
        }
        else if (methodInfo.serverStreaming) {
            signatures = this.createServerStreamingSignatures(source, methodInfo);
        }
        else if (methodInfo.clientStreaming) {
            signatures = this.createClientStreamingSignatures(source, methodInfo);
        }
        else {
            signatures = this.createUnarySignatures(source, methodInfo);
        }
        return signatures;
    }
    createUnarySignatures(source, methodInfo) {
        const method = this.createUnary(source, methodInfo);
        return [ts.createMethodSignature(method.typeParameters, method.parameters, method.type, method.name, method.questionToken)];
    }
    createServerStreamingSignatures(source, methodInfo) {
        const method = this.createServerStreaming(source, methodInfo);
        return [ts.createMethodSignature(method.typeParameters, method.parameters, method.type, method.name, method.questionToken)];
    }
    createClientStreamingSignatures(source, methodInfo) {
        const method = this.createClientStreaming(source, methodInfo);
        return [ts.createMethodSignature(method.typeParameters, method.parameters, method.type, method.name, method.questionToken)];
    }
    createDuplexStreamingSignatures(source, methodInfo) {
        const method = this.createDuplexStreaming(source, methodInfo);
        return [ts.createMethodSignature(method.typeParameters, method.parameters, method.type, method.name, method.questionToken)];
    }
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
    generateImplementationClass(source, descriptor) {
        const interpreterType = this.interpreter.getServiceType(descriptor), ServiceType = this.imports.type(source, descriptor), ServiceClient = this.imports.type(source, descriptor, this.symbolKindImplementation), IServiceClient = this.imports.type(source, descriptor, this.symbolKindInterface), ServiceInfo = this.imports.name(source, 'ServiceInfo', this.options.runtimeRpcImportPath, true), RpcTransport = this.imports.name(source, 'RpcTransport', this.options.runtimeRpcImportPath, true);
        const classDecorators = [];
        const constructorDecorators = [];
        const members = [
            // typeName = Haberdasher.typeName;
            ts.createProperty(undefined, undefined, ts.createIdentifier("typeName"), undefined, undefined, ts.createPropertyAccess(ts.createIdentifier(ServiceType), ts.createIdentifier("typeName"))),
            // methods = Haberdasher.methods;
            ts.createProperty(undefined, undefined, ts.createIdentifier("methods"), undefined, undefined, ts.createPropertyAccess(ts.createIdentifier(ServiceType), ts.createIdentifier("methods"))),
            // options = Haberdasher.options;
            ts.createProperty(undefined, undefined, ts.createIdentifier("options"), undefined, undefined, ts.createPropertyAccess(ts.createIdentifier(ServiceType), ts.createIdentifier("options"))),
            // constructor(@Inject(RPC_TRANSPORT) private readonly _transport: RpcTransport) {}
            ts.createConstructor(undefined, undefined, [ts.createParameter(constructorDecorators, [
                    ts.createModifier(ts.SyntaxKind.PrivateKeyword),
                    ts.createModifier(ts.SyntaxKind.ReadonlyKeyword)
                ], undefined, ts.createIdentifier("_transport"), undefined, ts.createTypeReferenceNode(ts.createIdentifier(RpcTransport), undefined), undefined)], ts.createBlock([], true)),
            ...interpreterType.methods.map(mi => {
                const declaration = this.createMethod(source, mi);
                const methodDescriptor = descriptor.method.find(md => md.name === mi.name);
                runtime_1.assert(methodDescriptor);
                this.comments.addCommentsForDescriptor(declaration, methodDescriptor, 'appendToLeadingBlock');
                return declaration;
            })
        ];
        // export class MyService implements MyService, ServiceInfo
        const statement = ts.createClassDeclaration(classDecorators, [ts.createModifier(ts.SyntaxKind.ExportKeyword)], ServiceClient, undefined, [
            ts.createHeritageClause(ts.SyntaxKind.ImplementsKeyword, [
                ts.createExpressionWithTypeArguments(undefined, ts.createIdentifier(IServiceClient)),
                ts.createExpressionWithTypeArguments(undefined, ts.createIdentifier(ServiceInfo)),
            ]),
        ], members);
        source.addStatement(statement);
        this.comments.addCommentsForDescriptor(statement, descriptor, 'appendToLeadingBlock');
        return statement;
    }
    /**
     * Create any method type, switching to specific methods.
     */
    createMethod(source, methodInfo) {
        let declaration;
        if (methodInfo.serverStreaming && methodInfo.clientStreaming) {
            declaration = this.createDuplexStreaming(source, methodInfo);
        }
        else if (methodInfo.serverStreaming) {
            declaration = this.createServerStreaming(source, methodInfo);
        }
        else if (methodInfo.clientStreaming) {
            declaration = this.createClientStreaming(source, methodInfo);
        }
        else {
            declaration = this.createUnary(source, methodInfo);
        }
        return declaration;
    }
    makeI(source, methodInfo, isTypeOnly = false) {
        return ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source, this.registry.resolveTypeName(methodInfo.I.typeName), 'default', isTypeOnly)), undefined);
    }
    makeO(source, methodInfo, isTypeOnly = false) {
        return ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source, this.registry.resolveTypeName(methodInfo.O.typeName), 'default', isTypeOnly)), undefined);
    }
}
exports.ServiceClientGeneratorBase = ServiceClientGeneratorBase;
