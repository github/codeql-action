"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnumGenerator = void 0;
const ts = require("typescript");
const rt = require("@protobuf-ts/runtime");
const plugin_framework_1 = require("@protobuf-ts/plugin-framework");
const generator_base_1 = require("./generator-base");
class EnumGenerator extends generator_base_1.GeneratorBase {
    constructor(symbols, registry, imports, comments, interpreter, options) {
        super(symbols, registry, imports, comments, interpreter);
        this.options = options;
    }
    /**
     * For the following .proto:
     *
     * ```proto
     *   enum MyEnum {
     *     ANY = 0;
     *     YES = 1;
     *     NO = 2;
     *   }
     * ```
     *
     * We generate the following enum:
     *
     * ```typescript
     *   enum MyEnum {
     *       ANY = 0,
     *       YES = 1,
     *       NO = 2
     *   }
     * ```
     *
     * We drop a shared prefix, for example:
     *
     * ```proto
     * enum MyEnum {
     *     MY_ENUM_FOO = 0;
     *     MY_ENUM_BAR = 1;
     * }
     * ```
     *
     * Becomes:
     *
     * ```typescript
     *   enum MyEnum {
     *       FOO = 0,
     *       BAR = 1,
     *   }
     * ```
     *
     */
    generateEnum(source, descriptor) {
        let enumObject = this.interpreter.getEnumInfo(descriptor)[1], builder = new plugin_framework_1.TypescriptEnumBuilder();
        for (let ev of rt.listEnumValues(enumObject)) {
            let evDescriptor = descriptor.value.find(v => v.number === ev.number);
            let comments = evDescriptor
                ? this.comments.getCommentBlock(evDescriptor, true)
                : "@generated synthetic value - protobuf-ts requires all enums to have a 0 value";
            builder.add(ev.name, ev.number, comments);
        }
        let statement = builder.build(this.imports.type(source, descriptor), [ts.createModifier(ts.SyntaxKind.ExportKeyword)]);
        // add to our file
        source.addStatement(statement);
        this.comments.addCommentsForDescriptor(statement, descriptor, 'appendToLeadingBlock');
        return statement;
    }
}
exports.EnumGenerator = EnumGenerator;
