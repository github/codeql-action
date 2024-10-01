"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Create = void 0;
const plugin_framework_1 = require("@protobuf-ts/plugin-framework");
const ts = require("typescript");
/**
 * Generates a "create()" method for an `IMessageType`
 */
class Create {
    constructor(registry, imports, interpreter, options) {
        this.registry = registry;
        this.imports = imports;
        this.interpreter = interpreter;
        this.options = options;
    }
    // create(value?: PartialMessage<ScalarValuesMessage>): ScalarValuesMessage {
    make(source, descriptor) {
        // create(value?: PartialMessage<ScalarValuesMessage>): ScalarValuesMessage {
        let methodDeclaration = this.makeMethod(source, descriptor, 
        // const message = globalThis.Object.create(this.messagePrototype);
        this.makeMessageVariable(), 
        // message.boolField = false;
        // message.repeatedField = [];
        // message.mapField = {};
        // ...
        ...this.makeMessagePropertyAssignments(source, descriptor), 
        // if (value !== undefined)
        //     reflectionMergePartial<ScalarValuesMessage>(message, value, this);
        this.makeMergeIf(source, descriptor), 
        // return message;
        ts.createReturn(ts.createIdentifier("message")));
        return [methodDeclaration];
    }
    makeMethod(source, descriptor, ...bodyStatements) {
        const MessageInterface = this.imports.type(source, descriptor), PartialMessage = this.imports.name(source, 'PartialMessage', this.options.runtimeImportPath, true);
        return ts.createMethod(undefined, undefined, undefined, ts.createIdentifier("create"), undefined, undefined, [
            ts.createParameter(undefined, undefined, undefined, ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.QuestionToken), ts.createTypeReferenceNode(PartialMessage, [
                ts.createTypeReferenceNode((MessageInterface), undefined)
            ]), undefined)
        ], ts.createTypeReferenceNode(MessageInterface, undefined), ts.createBlock(bodyStatements, true));
    }
    makeMessageVariable() {
        return ts.createVariableStatement(undefined, ts.createVariableDeclarationList([ts.createVariableDeclaration(ts.createIdentifier("message"), undefined, ts.createCall(ts.createPropertyAccess(ts.createPropertyAccess(ts.createIdentifier("globalThis"), ts.createIdentifier("Object")), ts.createIdentifier("create")), undefined, [
                ts.createNonNullExpression(ts.createPropertyAccess(ts.createThis(), ts.createIdentifier("messagePrototype")))
            ]))], ts.NodeFlags.Const));
    }
    makeMessagePropertyAssignments(source, descriptor) {
        let messageType = this.interpreter.getMessageType(descriptor);
        let defaultMessage = messageType.create();
        return Object.entries(defaultMessage).map(([key, value]) => (ts.createExpressionStatement(ts.createBinary(ts.createPropertyAccess(ts.createIdentifier("message"), ts.createIdentifier(key)), ts.createToken(ts.SyntaxKind.EqualsToken), plugin_framework_1.typescriptLiteralFromValue(value)))));
    }
    makeMergeIf(source, descriptor) {
        const MessageInterface = this.imports.type(source, descriptor);
        return ts.createIf(ts.createBinary(ts.createIdentifier("value"), ts.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken), ts.createIdentifier("undefined")), ts.createExpressionStatement(ts.createCall(ts.createIdentifier(this.imports.name(source, 'reflectionMergePartial', this.options.runtimeImportPath)), [ts.createTypeReferenceNode(MessageInterface, undefined)], [
            ts.createThis(),
            ts.createIdentifier("message"),
            ts.createIdentifier("value"),
        ])), undefined);
    }
}
exports.Create = Create;
