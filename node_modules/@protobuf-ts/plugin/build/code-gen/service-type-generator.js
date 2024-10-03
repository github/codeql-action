"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceTypeGenerator = void 0;
const plugin_framework_1 = require("@protobuf-ts/plugin-framework");
const ts = require("typescript");
const method_info_generator_1 = require("./method-info-generator");
const generator_base_1 = require("./generator-base");
class ServiceTypeGenerator extends generator_base_1.GeneratorBase {
    constructor(symbols, registry, imports, comments, interpreter, options) {
        super(symbols, registry, imports, comments, interpreter);
        this.options = options;
        this.methodInfoGenerator = new method_info_generator_1.MethodInfoGenerator(this.registry, this.imports);
    }
    // export const Haberdasher = new ServiceType("spec.haberdasher.Haberdasher", [
    //     { name: "MakeHat", localName: "makeHat", I: Size, O: Hat },
    // ], {});
    generateServiceType(source, descriptor) {
        const 
        // identifier for the service
        MyService = this.imports.type(source, descriptor), ServiceType = this.imports.name(source, "ServiceType", this.options.runtimeRpcImportPath), interpreterType = this.interpreter.getServiceType(descriptor);
        const args = [
            ts.createStringLiteral(interpreterType.typeName),
            this.methodInfoGenerator.createMethodInfoLiterals(source, interpreterType.methods)
        ];
        if (Object.keys(interpreterType.options).length) {
            args.push(plugin_framework_1.typescriptLiteralFromValue(interpreterType.options));
        }
        const exportConst = ts.createVariableStatement([ts.createModifier(ts.SyntaxKind.ExportKeyword)], ts.createVariableDeclarationList([ts.createVariableDeclaration(ts.createIdentifier(MyService), undefined, ts.createNew(ts.createIdentifier(ServiceType), undefined, args))], ts.NodeFlags.Const));
        // add to our file
        source.addStatement(exportConst);
        // add comments
        let comment = this.comments.makeDeprecatedTag(descriptor);
        comment += this.comments.makeGeneratedTag(descriptor).replace("@generated from ", "@generated ServiceType for ");
        plugin_framework_1.addCommentBlockAsJsDoc(exportConst, comment);
        return;
    }
}
exports.ServiceTypeGenerator = ServiceTypeGenerator;
