"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StringFormat = void 0;
const descriptor_1 = require("./google/protobuf/descriptor");
const descriptor_info_1 = require("./descriptor-info");
const runtime_1 = require("@protobuf-ts/runtime");
class StringFormat {
    constructor(a, b, c, d) {
        if (b === undefined) {
            this.nameLookup = a;
            this.treeLookup = a;
            this.sourceCodeLookup = a;
            this.descriptorInfo = a;
        }
        else {
            this.nameLookup = a;
            this.treeLookup = b;
            this.sourceCodeLookup = c;
            this.descriptorInfo = d;
        }
    }
    /**
     * Returns name of a scalar value type like it would
     * appear in a .proto.
     *
     * For example, `FieldDescriptorProto_Type.UINT32` -> `"uint32"`.
     */
    static formatScalarType(type) {
        let name = descriptor_1.FieldDescriptorProto_Type[type];
        runtime_1.assert(name !== undefined, "unexpected ScalarValueType " + type);
        return name.toLowerCase();
    }
    /**
     * Returns type ('message', 'field', etc.) and descriptor name.
     *
     * Examples:
     *   message Bar
     *   field value = 2
     *   rpc Fetch()
     */
    static formatName(descriptor) {
        if (descriptor_1.FileDescriptorProto.is(descriptor)) {
            return `file ${descriptor.name}`;
        }
        else if (descriptor_1.DescriptorProto.is(descriptor)) {
            return `message ${descriptor.name}`;
        }
        else if (descriptor_1.FieldDescriptorProto.is(descriptor)) {
            if (descriptor.extendee !== undefined) {
                return `extension field ${descriptor.name} = ${descriptor.number}`;
            }
            return `field ${descriptor.name} = ${descriptor.number}`;
        }
        else if (descriptor_1.EnumDescriptorProto.is(descriptor)) {
            return `enum ${descriptor.name}`;
        }
        else if (descriptor_1.EnumValueDescriptorProto.is(descriptor)) {
            return `enum value ${descriptor.name} = ${descriptor.number}`;
        }
        else if (descriptor_1.ServiceDescriptorProto.is(descriptor)) {
            return `service ${descriptor.name}`;
        }
        else if (descriptor_1.MethodDescriptorProto.is(descriptor)) {
            return `rpc ${descriptor.name}()`;
        }
        else 
        // noinspection SuspiciousTypeOfGuard
        if (descriptor_1.OneofDescriptorProto.is(descriptor)) {
            return `oneof ${descriptor.name}`;
        }
        runtime_1.assertNever(descriptor);
        runtime_1.assert(false);
    }
    formatQualifiedName(descriptor, includeFileInfo) {
        if (descriptor_1.FileDescriptorProto.is(descriptor)) {
            return `file ${descriptor.name}`;
        }
        const file = includeFileInfo ? ' in ' + getSourceWithLineNo(descriptor, this.treeLookup, this.sourceCodeLookup) : '';
        if (descriptor_1.DescriptorProto.is(descriptor)) {
            return `message ${this.nameLookup.makeTypeName(descriptor)}${file}`;
        }
        if (descriptor_1.EnumDescriptorProto.is(descriptor)) {
            return `enum ${this.nameLookup.makeTypeName(descriptor)}${file}`;
        }
        if (descriptor_1.ServiceDescriptorProto.is(descriptor)) {
            return `service ${this.nameLookup.makeTypeName(descriptor)}${file}`;
        }
        let parent = this.treeLookup.parentOf(descriptor);
        if (descriptor_1.FieldDescriptorProto.is(descriptor) && this.descriptorInfo.isExtension(descriptor)) {
            let extensionName = this.descriptorInfo.getExtensionName(descriptor);
            runtime_1.assert(descriptor.extendee);
            let extendeeTypeName = this.nameLookup.normalizeTypeName(descriptor.extendee);
            return `extension ${extendeeTypeName}.(${extensionName})${file}`;
        }
        runtime_1.assert(descriptor_info_1.isAnyTypeDescriptorProto(parent));
        let parentTypeName = this.nameLookup.makeTypeName(parent);
        if (descriptor_1.FieldDescriptorProto.is(descriptor)) {
            return `field ${parentTypeName}.${descriptor.name}${file}`;
        }
        if (descriptor_1.EnumValueDescriptorProto.is(descriptor)) {
            return `enum value ${parentTypeName}.${descriptor.name}${file}`;
        }
        if (descriptor_1.MethodDescriptorProto.is(descriptor)) {
            return `rpc ${parentTypeName}.${descriptor.name}()${file}`;
        }
        return `oneof ${parentTypeName}.${descriptor.name}${file}`;
    }
    formatName(descriptor) {
        return StringFormat.formatName(descriptor);
    }
    formatFieldDeclaration(descriptor) {
        var _a, _b, _c, _d, _e;
        let text = '';
        // repeated ?
        if (this.descriptorInfo.isUserDeclaredRepeated(descriptor)) {
            text += 'repeated ';
        }
        // optional ?
        if (this.descriptorInfo.isUserDeclaredOptional(descriptor)) {
            text += 'optional ';
        }
        switch (descriptor.type) {
            case descriptor_1.FieldDescriptorProto_Type.ENUM:
                text += this.nameLookup.makeTypeName(this.descriptorInfo.getEnumFieldEnum(descriptor));
                break;
            case descriptor_1.FieldDescriptorProto_Type.MESSAGE:
                if (this.descriptorInfo.isMapField(descriptor)) {
                    let mapK = StringFormat.formatScalarType(this.descriptorInfo.getMapKeyType(descriptor));
                    let mapVType = this.descriptorInfo.getMapValueType(descriptor);
                    let mapV = typeof mapVType === "number"
                        ? StringFormat.formatScalarType(mapVType)
                        : this.nameLookup.makeTypeName(mapVType);
                    text += `map<${mapK}, ${mapV}>`;
                }
                else {
                    text += this.nameLookup.makeTypeName(this.descriptorInfo.getMessageFieldMessage(descriptor));
                }
                break;
            case descriptor_1.FieldDescriptorProto_Type.DOUBLE:
            case descriptor_1.FieldDescriptorProto_Type.FLOAT:
            case descriptor_1.FieldDescriptorProto_Type.INT64:
            case descriptor_1.FieldDescriptorProto_Type.UINT64:
            case descriptor_1.FieldDescriptorProto_Type.INT32:
            case descriptor_1.FieldDescriptorProto_Type.FIXED64:
            case descriptor_1.FieldDescriptorProto_Type.FIXED32:
            case descriptor_1.FieldDescriptorProto_Type.BOOL:
            case descriptor_1.FieldDescriptorProto_Type.STRING:
            case descriptor_1.FieldDescriptorProto_Type.BYTES:
            case descriptor_1.FieldDescriptorProto_Type.UINT32:
            case descriptor_1.FieldDescriptorProto_Type.SFIXED32:
            case descriptor_1.FieldDescriptorProto_Type.SFIXED64:
            case descriptor_1.FieldDescriptorProto_Type.SINT32:
            case descriptor_1.FieldDescriptorProto_Type.SINT64:
                text += StringFormat.formatScalarType(descriptor.type);
                break;
            case descriptor_1.FieldDescriptorProto_Type.GROUP:
                text += "group";
                break;
            case descriptor_1.FieldDescriptorProto_Type.UNSPECIFIED$:
                text += "???";
                break;
        }
        // name
        text += ' ' + descriptor.name;
        // number
        text += ' = ' + descriptor.number;
        // options
        let options = [];
        if (this.descriptorInfo.isExplicitlyDeclaredDeprecated(descriptor)) {
            options.push('deprecated = true');
        }
        if (this.descriptorInfo.getFieldCustomJsonName(descriptor)) {
            options.push(`json_name = "${this.descriptorInfo.getFieldCustomJsonName(descriptor)}"`);
        }
        if (((_a = descriptor.options) === null || _a === void 0 ? void 0 : _a.jstype) == descriptor_1.FieldOptions_JSType.JS_STRING) {
            options.push(`jstype = JS_STRING`);
        }
        if (((_b = descriptor.options) === null || _b === void 0 ? void 0 : _b.jstype) == descriptor_1.FieldOptions_JSType.JS_NUMBER) {
            options.push(`jstype = JS_NUMBER`);
        }
        if (((_c = descriptor.options) === null || _c === void 0 ? void 0 : _c.jstype) == descriptor_1.FieldOptions_JSType.JS_NORMAL) {
            options.push(`jstype = JS_NORMAL`);
        }
        if (((_d = descriptor.options) === null || _d === void 0 ? void 0 : _d.packed) === true) {
            options.push(`packed = true`);
        }
        if (((_e = descriptor.options) === null || _e === void 0 ? void 0 : _e.packed) === false) {
            options.push(`packed = false`);
        }
        if (options.length) {
            text += ' [' + options.join(', ') + ']';
        }
        // semicolon
        text += ';';
        return text;
    }
    formatEnumValueDeclaration(descriptor) {
        let text = `${descriptor.name} = ${descriptor.number}`;
        if (this.descriptorInfo.isExplicitlyDeclaredDeprecated(descriptor)) {
            text += ' [deprecated = true]';
        }
        return text + ';';
    }
    formatRpcDeclaration(descriptor) {
        this.descriptorInfo.isExplicitlyDeclaredDeprecated(descriptor);
        let m = descriptor.name, i = descriptor.inputType, is = descriptor.clientStreaming ? 'stream ' : '', o = descriptor.outputType, os = descriptor.serverStreaming ? 'stream ' : '';
        if (i.startsWith('.')) {
            i = i.substring(1);
        }
        if (o.startsWith('.')) {
            o = o.substring(1);
        }
        return `${m}(${is}${i}) returns (${os}${o});`;
    }
}
exports.StringFormat = StringFormat;
function getSourceWithLineNo(descriptor, treeLookup, sourceCodeLookup) {
    let file = treeLookup.fileOf(descriptor), [l] = sourceCodeLookup.sourceCodeCursor(descriptor);
    return `${file.name}:${l}`;
}
