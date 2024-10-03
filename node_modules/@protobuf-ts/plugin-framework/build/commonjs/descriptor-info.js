"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DescriptorInfo = exports.isAnyTypeDescriptorProto = void 0;
const descriptor_1 = require("./google/protobuf/descriptor");
const runtime_1 = require("@protobuf-ts/runtime");
const string_format_1 = require("./string-format");
/**
 * Is this a first-class type?
 */
function isAnyTypeDescriptorProto(arg) {
    return descriptor_1.DescriptorProto.is(arg) || descriptor_1.EnumDescriptorProto.is(arg) || descriptor_1.ServiceDescriptorProto.is(arg);
}
exports.isAnyTypeDescriptorProto = isAnyTypeDescriptorProto;
class DescriptorInfo {
    constructor(tree, nameLookup) {
        this.tree = tree;
        this.nameLookup = nameLookup;
    }
    getAllExtensions() {
        if (!this.allExtensions) {
            this.allExtensions = [];
            for (let file of this.tree.allFiles()) {
                this.allExtensions.push(...file.extension);
                for (let msg of file.messageType) {
                    this.allExtensions.push(...msg.extension);
                }
            }
        }
        return this.allExtensions;
    }
    isExtension(fieldDescriptor) {
        if (fieldDescriptor.extendee === undefined) {
            return false;
        }
        const parent = this.tree.parentOf(fieldDescriptor);
        return parent.extension.includes(fieldDescriptor);
    }
    extensionsFor(descriptorOrTypeName) {
        let extendeeTypeName;
        if (typeof descriptorOrTypeName === "string") {
            extendeeTypeName = this.nameLookup.makeTypeName(this.nameLookup.resolveTypeName(descriptorOrTypeName));
        }
        else {
            extendeeTypeName = this.nameLookup.makeTypeName(descriptorOrTypeName);
        }
        return this.getAllExtensions().filter(ext => this.nameLookup.normalizeTypeName(ext.extendee) === extendeeTypeName);
    }
    getExtensionName(fieldDescriptor) {
        runtime_1.assert(this.isExtension(fieldDescriptor), `${string_format_1.StringFormat.formatName(fieldDescriptor)} is not an extension. use isExtension() before getExtensionName()`);
        runtime_1.assert(fieldDescriptor.name);
        let extensionName;
        let parent = this.tree.parentOf(fieldDescriptor);
        if (descriptor_1.FileDescriptorProto.is(parent)) {
            extensionName = parent.package
                ? `${parent.package}.${fieldDescriptor.name}`
                : `${fieldDescriptor.name}`;
        }
        else {
            extensionName = `${this.nameLookup.makeTypeName(parent)}.${fieldDescriptor.name}`;
        }
        return extensionName;
    }
    getFieldCustomJsonName(fieldDescriptor) {
        const name = runtime_1.lowerCamelCase(fieldDescriptor.name);
        const jsonName = fieldDescriptor.jsonName;
        if (jsonName !== undefined && jsonName !== '' && jsonName !== name) {
            return jsonName;
        }
        return undefined;
    }
    isEnumField(fieldDescriptor) {
        return fieldDescriptor.type === descriptor_1.FieldDescriptorProto_Type.ENUM;
    }
    getEnumFieldEnum(fieldDescriptor) {
        if (fieldDescriptor.type !== descriptor_1.FieldDescriptorProto_Type.ENUM) {
            throw new Error(`${string_format_1.StringFormat.formatName(fieldDescriptor)} is not a enum field. use isEnumField() before getEnumFieldEnum().`);
        }
        runtime_1.assert(fieldDescriptor.typeName !== undefined, `Missing enum type name for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        let enumType = this.nameLookup.peekTypeName(fieldDescriptor.typeName);
        runtime_1.assert(enumType !== undefined, `Missing enum type ${fieldDescriptor.typeName} for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        runtime_1.assert(descriptor_1.EnumDescriptorProto.is(enumType), `Invalid enum type for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        return enumType;
    }
    isMessageField(fieldDescriptor) {
        let msg = fieldDescriptor.type === descriptor_1.FieldDescriptorProto_Type.MESSAGE;
        if (!msg) {
            return false;
        }
        if (fieldDescriptor.name === undefined) {
            return false;
        }
        if (this.isMapField(fieldDescriptor)) {
            return false;
        }
        return true;
    }
    isGroupField(fieldDescriptor) {
        return fieldDescriptor.type === descriptor_1.FieldDescriptorProto_Type.GROUP;
    }
    getMessageFieldMessage(fieldDescriptor) {
        if (!this.isMessageField(fieldDescriptor)) {
            throw new Error(`${string_format_1.StringFormat.formatName(fieldDescriptor)} is not a message field. use isMessageField() before getMessageFieldMessage().`);
        }
        runtime_1.assert(fieldDescriptor.typeName !== undefined, `Missing message type name for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        let messageType = this.nameLookup.peekTypeName(fieldDescriptor.typeName);
        runtime_1.assert(messageType !== undefined, `Missing message type ${fieldDescriptor.typeName} for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        runtime_1.assert(descriptor_1.DescriptorProto.is(messageType), `Invalid message type for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        return messageType;
    }
    isScalarField(fieldDescriptor) {
        switch (fieldDescriptor.type) {
            case descriptor_1.FieldDescriptorProto_Type.ENUM:
            case descriptor_1.FieldDescriptorProto_Type.MESSAGE:
            case descriptor_1.FieldDescriptorProto_Type.GROUP:
            case descriptor_1.FieldDescriptorProto_Type.UNSPECIFIED$:
                return false;
        }
        return true;
    }
    getScalarFieldType(fieldDescriptor) {
        if (!this.isScalarField(fieldDescriptor)) {
            throw new Error(`${string_format_1.StringFormat.formatName(fieldDescriptor)} is not a scalar field. use isScalarField() before getScalarFieldType().`);
        }
        runtime_1.assert(fieldDescriptor.type !== undefined);
        runtime_1.assert(fieldDescriptor.type !== descriptor_1.FieldDescriptorProto_Type.ENUM);
        runtime_1.assert(fieldDescriptor.type !== descriptor_1.FieldDescriptorProto_Type.MESSAGE);
        runtime_1.assert(fieldDescriptor.type !== descriptor_1.FieldDescriptorProto_Type.GROUP);
        runtime_1.assert(fieldDescriptor.type !== descriptor_1.FieldDescriptorProto_Type.UNSPECIFIED$);
        return fieldDescriptor.type;
    }
    isMapField(fieldDescriptor) {
        return this.getMapEntryMessage(fieldDescriptor) !== undefined;
    }
    getMapKeyType(fieldDescriptor) {
        let entry = this.getMapEntryMessage(fieldDescriptor);
        if (!entry) {
            throw new Error(`${string_format_1.StringFormat.formatName(fieldDescriptor)} is not a map field. use isMapField() before getMapKeyType().`);
        }
        let keyField = entry.field.find(fd => fd.number === 1);
        runtime_1.assert(keyField !== undefined, `Missing map entry key field 1 for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        runtime_1.assert(keyField.type !== undefined, `Unexpected map key type ${keyField === null || keyField === void 0 ? void 0 : keyField.type} for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        runtime_1.assert(keyField.type !== descriptor_1.FieldDescriptorProto_Type.UNSPECIFIED$, `Unexpected map key type ${keyField === null || keyField === void 0 ? void 0 : keyField.type} for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        runtime_1.assert(keyField.type !== descriptor_1.FieldDescriptorProto_Type.GROUP, `Unexpected map key type ${keyField === null || keyField === void 0 ? void 0 : keyField.type} for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        runtime_1.assert(keyField.type !== descriptor_1.FieldDescriptorProto_Type.MESSAGE, `Unexpected map key type ${keyField === null || keyField === void 0 ? void 0 : keyField.type} for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        runtime_1.assert(keyField.type !== descriptor_1.FieldDescriptorProto_Type.ENUM, `Unexpected map key type ${keyField === null || keyField === void 0 ? void 0 : keyField.type} for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        runtime_1.assert(keyField.type !== descriptor_1.FieldDescriptorProto_Type.FLOAT, `Unexpected map key type ${keyField === null || keyField === void 0 ? void 0 : keyField.type} for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        runtime_1.assert(keyField.type !== descriptor_1.FieldDescriptorProto_Type.DOUBLE, `Unexpected map key type ${keyField === null || keyField === void 0 ? void 0 : keyField.type} for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        runtime_1.assert(keyField.type !== descriptor_1.FieldDescriptorProto_Type.BYTES, `Unexpected map key type ${keyField === null || keyField === void 0 ? void 0 : keyField.type} for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        return keyField.type;
    }
    getMapValueType(fieldDescriptor) {
        let entry = this.getMapEntryMessage(fieldDescriptor);
        if (!entry) {
            throw new Error(`${string_format_1.StringFormat.formatName(fieldDescriptor)} is not a map field. use isMapField() before getMapValueType().`);
        }
        let valueField = entry.field.find(fd => fd.number === 2);
        runtime_1.assert(valueField !== undefined, `Missing map entry value field 2 for ${string_format_1.StringFormat.formatName(fieldDescriptor)}`);
        if (this.isScalarField(valueField)) {
            return this.getScalarFieldType(valueField);
        }
        if (this.isEnumField(valueField)) {
            return this.getEnumFieldEnum(valueField);
        }
        return this.getMessageFieldMessage(valueField);
    }
    getMapEntryMessage(fieldDescriptor) {
        var _a;
        if (fieldDescriptor.type !== descriptor_1.FieldDescriptorProto_Type.MESSAGE) {
            return undefined;
        }
        if (fieldDescriptor.typeName === undefined || fieldDescriptor.typeName === "") {
            return undefined;
        }
        let typeDescriptor = this.nameLookup.resolveTypeName(fieldDescriptor.typeName);
        if (!descriptor_1.DescriptorProto.is(typeDescriptor)) {
            return undefined;
        }
        if (((_a = typeDescriptor.options) === null || _a === void 0 ? void 0 : _a.mapEntry) !== true) {
            return undefined;
        }
        return typeDescriptor;
    }
    isExplicitlyDeclaredDeprecated(descriptor) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        if (descriptor_1.FileDescriptorProto.is(descriptor)) {
            return (_b = (_a = descriptor.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false;
        }
        if (descriptor_1.DescriptorProto.is(descriptor)) {
            return (_d = (_c = descriptor.options) === null || _c === void 0 ? void 0 : _c.deprecated) !== null && _d !== void 0 ? _d : false;
        }
        if (descriptor_1.FieldDescriptorProto.is(descriptor)) {
            return (_f = (_e = descriptor.options) === null || _e === void 0 ? void 0 : _e.deprecated) !== null && _f !== void 0 ? _f : false;
        }
        if (descriptor_1.EnumDescriptorProto.is(descriptor)) {
            return (_h = (_g = descriptor.options) === null || _g === void 0 ? void 0 : _g.deprecated) !== null && _h !== void 0 ? _h : false;
        }
        if (descriptor_1.EnumValueDescriptorProto.is(descriptor)) {
            return (_k = (_j = descriptor.options) === null || _j === void 0 ? void 0 : _j.deprecated) !== null && _k !== void 0 ? _k : false;
        }
        if (descriptor_1.ServiceDescriptorProto.is(descriptor)) {
            return (_m = (_l = descriptor.options) === null || _l === void 0 ? void 0 : _l.deprecated) !== null && _m !== void 0 ? _m : false;
        }
        if (descriptor_1.MethodDescriptorProto.is(descriptor)) {
            return (_p = (_o = descriptor.options) === null || _o === void 0 ? void 0 : _o.deprecated) !== null && _p !== void 0 ? _p : false;
        }
        if (descriptor_1.OneofDescriptorProto.is(descriptor)) {
            return false;
        }
        return false;
    }
    isSyntheticElement(descriptor) {
        var _a;
        if (descriptor_1.DescriptorProto.is(descriptor)) {
            if ((_a = descriptor.options) === null || _a === void 0 ? void 0 : _a.mapEntry) {
                return true;
            }
            if (descriptor.name && descriptor.name.startsWith("$synthetic.")) {
                return true;
            }
        }
        return false;
    }
    isUserDeclaredOneof(fieldDescriptor) {
        if (fieldDescriptor.oneofIndex === undefined) {
            return false;
        }
        return fieldDescriptor.proto3Optional !== true;
    }
    isUserDeclaredOptional(fieldDescriptor) {
        if (this.isUserDeclaredOneof(fieldDescriptor)) {
            return false;
        }
        if (fieldDescriptor.proto3Optional === true) {
            return true;
        }
        if (fieldDescriptor.proto3Optional === false) {
            return false;
        }
        const file = this.tree.fileOf(fieldDescriptor);
        if (file.syntax === 'proto3') {
            return false;
        }
        runtime_1.assert(file.syntax === undefined || file.syntax === 'proto2', `unsupported syntax "${file.syntax}"`);
        return fieldDescriptor.label === descriptor_1.FieldDescriptorProto_Label.OPTIONAL;
    }
    isUserDeclaredRepeated(fieldDescriptor) {
        var _a;
        if (fieldDescriptor.label !== descriptor_1.FieldDescriptorProto_Label.REPEATED) {
            return false;
        }
        const name = fieldDescriptor.typeName;
        if (name === undefined || name === "") {
            return true;
        }
        const typeDescriptor = this.nameLookup.resolveTypeName(name);
        if (descriptor_1.DescriptorProto.is(typeDescriptor)) {
            return !((_a = typeDescriptor.options) === null || _a === void 0 ? void 0 : _a.mapEntry);
        }
        return true;
    }
    shouldBePackedRepeated(fieldDescriptor) {
        var _a;
        let file = this.tree.fileOf(fieldDescriptor);
        let standard, declared = (_a = fieldDescriptor.options) === null || _a === void 0 ? void 0 : _a.packed;
        if (file.syntax === 'proto3') {
            standard = true;
        }
        else {
            runtime_1.assert(file.syntax === undefined || file.syntax === 'proto2', `unsupported syntax "${file.syntax}"`);
            standard = false;
        }
        if (fieldDescriptor.type === descriptor_1.FieldDescriptorProto_Type.BYTES || fieldDescriptor.type === descriptor_1.FieldDescriptorProto_Type.STRING) {
            runtime_1.assert(!declared, `repeated bytes | string cannot be packed. protoc should have caught this. probably unsupported protoc version.`);
            standard = false;
        }
        return declared !== null && declared !== void 0 ? declared : standard;
    }
    findEnumSharedPrefix(enumDescriptor, enumLocalName) {
        if (enumLocalName === undefined) {
            enumLocalName = `${enumDescriptor.name}`;
        }
        // create possible prefix from local enum name
        // for example, "MyEnum" => "MY_ENUM_"
        let enumPrefix = enumLocalName;
        enumPrefix = enumPrefix.replace(/[A-Z]/g, letter => "_" + letter.toLowerCase());
        enumPrefix = (enumPrefix[0] === "_") ? enumPrefix.substring(1) : enumPrefix;
        enumPrefix = enumPrefix.toUpperCase();
        enumPrefix += '_';
        // do all members share the prefix?
        let names = enumDescriptor.value.map(enumValue => `${enumValue.name}`);
        let allNamesSharePrefix = names.every(name => name.startsWith(enumPrefix));
        // are the names with stripped prefix still valid?
        // (start with uppercase letter, at least 2 chars long)
        let strippedNames = names.map(name => name.substring(enumPrefix.length));
        let strippedNamesAreValid = strippedNames.every(name => name.length > 0 && /^[A-Z].+/.test(name));
        return (allNamesSharePrefix && strippedNamesAreValid) ? enumPrefix : undefined;
    }
    isFileUsed(file, inFiles) {
        let used = false;
        this.tree.visitTypes(file, typeDescriptor => {
            if (used)
                return;
            if (this.isTypeUsed(typeDescriptor, inFiles)) {
                used = true;
            }
        });
        return used;
    }
    isTypeUsed(type, inFiles) {
        const needle = this.nameLookup.makeTypeName(type);
        let used = false;
        for (let fd of inFiles) {
            this.tree.visitTypes(fd, typeDescriptor => {
                if (used)
                    return;
                if (descriptor_1.DescriptorProto.is(typeDescriptor)) {
                    const usedInField = typeDescriptor.field.some(fd => fd.typeName !== undefined && this.nameLookup.normalizeTypeName(fd.typeName) === needle);
                    if (usedInField) {
                        used = true;
                    }
                }
                else if (descriptor_1.ServiceDescriptorProto.is(typeDescriptor)) {
                    const usedInMethodInput = typeDescriptor.method.some(md => md.inputType !== undefined && this.nameLookup.normalizeTypeName(md.inputType) === needle);
                    const usedInMethodOutput = typeDescriptor.method.some(md => md.outputType !== undefined && this.nameLookup.normalizeTypeName(md.outputType) === needle);
                    if (usedInMethodInput || usedInMethodOutput) {
                        used = true;
                    }
                }
            });
        }
        return used;
    }
}
exports.DescriptorInfo = DescriptorInfo;
