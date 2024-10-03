import { DescriptorProto, EnumDescriptorProto, EnumOptions, EnumValueDescriptorProto, EnumValueOptions, FieldDescriptorProto, FieldOptions, FileDescriptorProto, FileOptions, MessageOptions, MethodDescriptorProto, MethodOptions, OneofDescriptorProto, OneofOptions, ServiceDescriptorProto, ServiceOptions } from "./google/protobuf/descriptor";
import { CodeGeneratorRequest } from "./google/protobuf/compiler/plugin";
import { AnyDescriptorProto, AnyTypeDescriptorProto, IDescriptorInfo, MapFieldKeyType, ScalarValueType } from "./descriptor-info";
import { IDescriptorTree } from "./descriptor-tree";
import { FileDescriptorProtoFields, ISourceCodeInfoLookup, SourceCodeComment, SourceCodeCursor } from "./source-code-info";
import { IStringFormat } from "./string-format";
import { ITypeNameLookup } from "./type-names";
export declare class DescriptorRegistry implements IDescriptorTree, ITypeNameLookup, ISourceCodeInfoLookup, IStringFormat, IDescriptorInfo {
    private readonly tree;
    private readonly typeNames;
    private readonly sourceCode;
    private readonly stringFormat;
    private readonly descriptorInfo;
    /**
     * Create new registry from a FileDescriptorProto.
     */
    static createFrom(file: FileDescriptorProto): DescriptorRegistry;
    /**
     * Create new registry from a CodeGeneratorRequest.
     */
    static createFrom(request: CodeGeneratorRequest): DescriptorRegistry;
    constructor(tree: IDescriptorTree, typeNames: ITypeNameLookup, sourceCode: ISourceCodeInfoLookup, stringFormat: IStringFormat, descriptorInfo: IDescriptorInfo);
    normalizeTypeName(typeName: string): string;
    resolveTypeName(typeName: string): AnyTypeDescriptorProto;
    peekTypeName(typeName: string): AnyTypeDescriptorProto | undefined;
    makeTypeName(descriptor: AnyTypeDescriptorProto): string;
    ancestorsOf(descriptor: AnyDescriptorProto): AnyDescriptorProto[];
    fileOf(descriptor: AnyDescriptorProto): FileDescriptorProto;
    allFiles(): readonly FileDescriptorProto[];
    parentOf(descriptor: FieldDescriptorProto): DescriptorProto;
    parentOf(descriptor: AnyDescriptorProto): AnyDescriptorProto | undefined;
    parentOf(options: FileOptions): FileDescriptorProto;
    parentOf(options: MessageOptions): DescriptorProto;
    parentOf(options: FieldOptions): FileDescriptorProto;
    parentOf(options: OneofOptions): OneofDescriptorProto;
    parentOf(options: EnumOptions): FieldDescriptorProto;
    parentOf(options: EnumValueOptions): EnumValueDescriptorProto;
    parentOf(options: ServiceOptions): ServiceDescriptorProto;
    parentOf(options: MethodOptions): MethodDescriptorProto;
    visit(visitor: (descriptor: AnyTypeDescriptorProto) => void): void;
    visit(startingFrom: AnyDescriptorProto, visitor: (descriptor: AnyTypeDescriptorProto) => void): void;
    visitTypes(visitor: (descriptor: AnyTypeDescriptorProto) => void): void;
    visitTypes(startingFrom: AnyDescriptorProto, visitor: (descriptor: AnyTypeDescriptorProto) => void): void;
    sourceCodeCursor(descriptor: AnyDescriptorProto): SourceCodeCursor;
    sourceCodeComments(descriptor: AnyDescriptorProto): SourceCodeComment;
    sourceCodeComments(file: FileDescriptorProto, field: FileDescriptorProtoFields): SourceCodeComment;
    formatFieldDeclaration(descriptor: FieldDescriptorProto): string;
    formatQualifiedName(descriptor: AnyDescriptorProto, includeFileInfo?: boolean): string;
    formatName(descriptor: AnyDescriptorProto): string;
    formatEnumValueDeclaration(descriptor: EnumValueDescriptorProto): string;
    formatRpcDeclaration(descriptor: MethodDescriptorProto): string;
    isExtension(descriptor: FieldDescriptorProto): boolean;
    extensionsFor(descriptorOrTypeName: DescriptorProto | string): FieldDescriptorProto[];
    getExtensionName(descriptor: FieldDescriptorProto): string;
    getFieldCustomJsonName(descriptor: FieldDescriptorProto): string | undefined;
    isEnumField(fieldDescriptor: FieldDescriptorProto): boolean;
    getEnumFieldEnum(fieldDescriptor: FieldDescriptorProto): EnumDescriptorProto;
    isMessageField(fieldDescriptor: FieldDescriptorProto): boolean;
    isGroupField(fieldDescriptor: FieldDescriptorProto): boolean;
    getMessageFieldMessage(fieldDescriptor: FieldDescriptorProto): DescriptorProto;
    isScalarField(fieldDescriptor: FieldDescriptorProto): boolean;
    getScalarFieldType(fieldDescriptor: FieldDescriptorProto): ScalarValueType;
    isMapField(fieldDescriptor: FieldDescriptorProto): boolean;
    getMapKeyType(fieldDescriptor: FieldDescriptorProto): MapFieldKeyType;
    getMapValueType(fieldDescriptor: FieldDescriptorProto): DescriptorProto | EnumDescriptorProto | ScalarValueType;
    isExplicitlyDeclaredDeprecated(descriptor: AnyDescriptorProto): boolean;
    isSyntheticElement(descriptor: AnyDescriptorProto): boolean;
    findEnumSharedPrefix(descriptor: EnumDescriptorProto, enumLocalName?: string): string | undefined;
    isUserDeclaredOneof(descriptor: FieldDescriptorProto): boolean;
    isUserDeclaredOptional(descriptor: FieldDescriptorProto): boolean;
    isUserDeclaredRepeated(descriptor: FieldDescriptorProto): boolean;
    shouldBePackedRepeated(descriptor: FieldDescriptorProto): boolean;
    isFileUsed(file: FileDescriptorProto, inFiles: FileDescriptorProto[]): boolean;
    isTypeUsed(type: AnyTypeDescriptorProto, inFiles: FileDescriptorProto[]): boolean;
}
