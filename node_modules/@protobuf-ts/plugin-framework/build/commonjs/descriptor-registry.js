"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DescriptorRegistry = void 0;
const descriptor_1 = require("./google/protobuf/descriptor");
const plugin_1 = require("./google/protobuf/compiler/plugin");
const descriptor_info_1 = require("./descriptor-info");
const descriptor_tree_1 = require("./descriptor-tree");
const source_code_info_1 = require("./source-code-info");
const string_format_1 = require("./string-format");
const type_names_1 = require("./type-names");
class DescriptorRegistry {
    constructor(tree, typeNames, sourceCode, stringFormat, descriptorInfo) {
        this.tree = tree;
        this.typeNames = typeNames;
        this.sourceCode = sourceCode;
        this.stringFormat = stringFormat;
        this.descriptorInfo = descriptorInfo;
    }
    static createFrom(requestOrFile) {
        const files = plugin_1.CodeGeneratorRequest.is(requestOrFile)
            ? requestOrFile.protoFile
            : [requestOrFile], tree = descriptor_tree_1.DescriptorTree.from(...files), nameLookup = type_names_1.TypeNameLookup.from(tree), sourceCodeLookup = new source_code_info_1.SourceCodeInfoLookup(d => tree.parentOf(d)), descriptorInfo = new descriptor_info_1.DescriptorInfo(tree, nameLookup), stringFormat = new string_format_1.StringFormat(nameLookup, tree, sourceCodeLookup, descriptorInfo);
        return new DescriptorRegistry(tree, nameLookup, sourceCodeLookup, stringFormat, descriptorInfo);
    }
    // ITypeNameLookup
    normalizeTypeName(typeName) {
        return this.typeNames.normalizeTypeName(typeName);
    }
    resolveTypeName(typeName) {
        return this.typeNames.resolveTypeName(typeName);
    }
    peekTypeName(typeName) {
        return this.typeNames.peekTypeName(typeName);
    }
    makeTypeName(descriptor) {
        return this.typeNames.makeTypeName(descriptor);
    }
    // IDescriptorTree
    ancestorsOf(descriptor) {
        return this.tree.ancestorsOf(descriptor);
    }
    fileOf(descriptor) {
        return this.tree.fileOf(descriptor);
    }
    allFiles() {
        return this.tree.allFiles();
    }
    parentOf(descriptorOrOptions) {
        return this.tree.parentOf(descriptorOrOptions);
    }
    visit(a, b) {
        this.tree.visit(a, b);
    }
    visitTypes(a, b) {
        this.tree.visitTypes(a, b);
    }
    // ISourceCodeInfoLookup
    sourceCodeCursor(descriptor) {
        return this.sourceCode.sourceCodeCursor(descriptor);
    }
    sourceCodeComments(descriptorOrFile, fileDescriptorFieldNumber) {
        if (descriptor_1.FileDescriptorProto.is(descriptorOrFile) && fileDescriptorFieldNumber !== undefined) {
            return this.sourceCode.sourceCodeComments(descriptorOrFile, fileDescriptorFieldNumber);
        }
        return this.sourceCode.sourceCodeComments(descriptorOrFile);
    }
    // IStringFormat
    formatFieldDeclaration(descriptor) {
        return this.stringFormat.formatFieldDeclaration(descriptor);
    }
    formatQualifiedName(descriptor, includeFileInfo = false) {
        return this.stringFormat.formatQualifiedName(descriptor, includeFileInfo);
    }
    formatName(descriptor) {
        return this.stringFormat.formatName(descriptor);
    }
    formatEnumValueDeclaration(descriptor) {
        return this.stringFormat.formatEnumValueDeclaration(descriptor);
    }
    formatRpcDeclaration(descriptor) {
        return this.stringFormat.formatRpcDeclaration(descriptor);
    }
    // IDescriptorInfo
    isExtension(descriptor) {
        return this.descriptorInfo.isExtension(descriptor);
    }
    extensionsFor(descriptorOrTypeName) {
        return this.descriptorInfo.extensionsFor(descriptorOrTypeName);
    }
    getExtensionName(descriptor) {
        return this.descriptorInfo.getExtensionName(descriptor);
    }
    getFieldCustomJsonName(descriptor) {
        return this.descriptorInfo.getFieldCustomJsonName(descriptor);
    }
    isEnumField(fieldDescriptor) {
        return this.descriptorInfo.isEnumField(fieldDescriptor);
    }
    getEnumFieldEnum(fieldDescriptor) {
        return this.descriptorInfo.getEnumFieldEnum(fieldDescriptor);
    }
    isMessageField(fieldDescriptor) {
        return this.descriptorInfo.isMessageField(fieldDescriptor);
    }
    isGroupField(fieldDescriptor) {
        return this.descriptorInfo.isGroupField(fieldDescriptor);
    }
    getMessageFieldMessage(fieldDescriptor) {
        return this.descriptorInfo.getMessageFieldMessage(fieldDescriptor);
    }
    isScalarField(fieldDescriptor) {
        return this.descriptorInfo.isScalarField(fieldDescriptor);
    }
    getScalarFieldType(fieldDescriptor) {
        return this.descriptorInfo.getScalarFieldType(fieldDescriptor);
    }
    isMapField(fieldDescriptor) {
        return this.descriptorInfo.isMapField(fieldDescriptor);
    }
    getMapKeyType(fieldDescriptor) {
        return this.descriptorInfo.getMapKeyType(fieldDescriptor);
    }
    getMapValueType(fieldDescriptor) {
        return this.descriptorInfo.getMapValueType(fieldDescriptor);
    }
    isExplicitlyDeclaredDeprecated(descriptor) {
        return this.descriptorInfo.isExplicitlyDeclaredDeprecated(descriptor);
    }
    isSyntheticElement(descriptor) {
        return this.descriptorInfo.isSyntheticElement(descriptor);
    }
    findEnumSharedPrefix(descriptor, enumLocalName) {
        return this.descriptorInfo.findEnumSharedPrefix(descriptor, enumLocalName);
    }
    isUserDeclaredOneof(descriptor) {
        return this.descriptorInfo.isUserDeclaredOneof(descriptor);
    }
    isUserDeclaredOptional(descriptor) {
        return this.descriptorInfo.isUserDeclaredOptional(descriptor);
    }
    isUserDeclaredRepeated(descriptor) {
        return this.descriptorInfo.isUserDeclaredRepeated(descriptor);
    }
    shouldBePackedRepeated(descriptor) {
        return this.descriptorInfo.shouldBePackedRepeated(descriptor);
    }
    isFileUsed(file, inFiles) {
        return this.descriptorInfo.isFileUsed(file, inFiles);
    }
    isTypeUsed(type, inFiles) {
        return this.descriptorInfo.isTypeUsed(type, inFiles);
    }
}
exports.DescriptorRegistry = DescriptorRegistry;
