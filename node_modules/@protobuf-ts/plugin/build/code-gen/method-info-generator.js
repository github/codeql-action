"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MethodInfoGenerator = void 0;
const rt = require("@protobuf-ts/runtime");
const ts = require("typescript");
const plugin_framework_1 = require("@protobuf-ts/plugin-framework");
/**
 * Generates TypeScript code for runtime method information,
 * from method field information.
 */
class MethodInfoGenerator {
    constructor(registry, imports) {
        this.registry = registry;
        this.imports = imports;
    }
    createMethodInfoLiterals(source, methodInfos) {
        const mi = methodInfos
            .map(mi => MethodInfoGenerator.denormalizeMethodInfo(mi))
            .map(mi => this.createMethodInfoLiteral(source, mi));
        return ts.createArrayLiteral(mi, true);
    }
    createMethodInfoLiteral(source, methodInfo) {
        methodInfo = MethodInfoGenerator.denormalizeMethodInfo(methodInfo);
        const properties = [];
        // name: The name of the method as declared in .proto
        // localName: The name of the method in the runtime.
        // idempotency: The idempotency level as specified in .proto.
        // serverStreaming: Was the rpc declared with server streaming?
        // clientStreaming: Was the rpc declared with client streaming?
        // options: Contains custom method options from the .proto source in JSON format.
        for (let key of ["name", "localName", "idempotency", "serverStreaming", "clientStreaming", "options"]) {
            if (methodInfo[key] !== undefined) {
                properties.push(ts.createPropertyAssignment(key, plugin_framework_1.typescriptLiteralFromValue(methodInfo[key])));
            }
        }
        // I: The generated type handler for the input message.
        properties.push(ts.createPropertyAssignment(ts.createIdentifier('I'), ts.createIdentifier(this.imports.type(source, this.registry.resolveTypeName(methodInfo.I.typeName)))));
        // O: The generated type handler for the output message.
        properties.push(ts.createPropertyAssignment(ts.createIdentifier('O'), ts.createIdentifier(this.imports.type(source, this.registry.resolveTypeName(methodInfo.O.typeName)))));
        return ts.createObjectLiteral(properties, false);
    }
    /**
     * Turn normalized method info returned by normalizeMethodInfo() back into
     * the minimized form.
     */
    static denormalizeMethodInfo(info) {
        let partial = Object.assign({}, info);
        delete partial.service;
        if (info.localName === rt.lowerCamelCase(info.name)) {
            delete partial.localName;
        }
        if (!info.serverStreaming) {
            delete partial.serverStreaming;
        }
        if (!info.clientStreaming) {
            delete partial.clientStreaming;
        }
        if (info.options && Object.keys(info.options).length) {
            delete partial.info;
        }
        if (info.idempotency === undefined) {
            delete partial.idempotency;
        }
        return partial;
    }
}
exports.MethodInfoGenerator = MethodInfoGenerator;
