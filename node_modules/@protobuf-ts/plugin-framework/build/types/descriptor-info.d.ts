import { DescriptorProto, EnumDescriptorProto, EnumOptions, EnumValueDescriptorProto, EnumValueOptions, FieldDescriptorProto, FieldDescriptorProto_Type, FieldOptions, FileDescriptorProto, FileOptions, MessageOptions, MethodDescriptorProto, MethodOptions, OneofDescriptorProto, OneofOptions, ServiceDescriptorProto, ServiceOptions } from "./google/protobuf/descriptor";
import { ITypeNameLookup } from "./type-names";
import { IDescriptorTree } from "./descriptor-tree";
/**
 * Union of all known descriptor proto.
 */
export declare type AnyDescriptorProto = FileDescriptorProto | DescriptorProto | FieldDescriptorProto | OneofDescriptorProto | EnumDescriptorProto | EnumValueDescriptorProto | ServiceDescriptorProto | MethodDescriptorProto;
/**
 * Messages, enums and services are the only first-class
 * types in the protobuf world.
 *
 * We assume that it should be possible to lookup these
 * types by name.
 */
export declare type AnyTypeDescriptorProto = DescriptorProto | EnumDescriptorProto | ServiceDescriptorProto;
/**
 * Union of all known descriptor options.
 */
export declare type AnyOptions = FileOptions | MessageOptions | FieldOptions | EnumOptions | OneofOptions | EnumValueOptions | ServiceOptions | MethodOptions;
/**
 * Is this a first-class type?
 */
export declare function isAnyTypeDescriptorProto(arg: any): arg is AnyTypeDescriptorProto;
/**
 * All scalar values types (which includes bytes)
 * https://developers.google.com/protocol-buffers/docs/proto3#scalar_value_types
 */
export declare type ScalarValueType = Exclude<FieldDescriptorProto_Type, typeof FieldDescriptorProto_Type.UNSPECIFIED$ | typeof FieldDescriptorProto_Type.MESSAGE | typeof FieldDescriptorProto_Type.ENUM | typeof FieldDescriptorProto_Type.GROUP>;
/**
 * Map field key type.
 *
 * The key_type can be any integral or string type
 * (so, any scalar type except for floating point
 * types and bytes)
 */
export declare type MapFieldKeyType = Exclude<FieldDescriptorProto_Type, typeof FieldDescriptorProto_Type.FLOAT | typeof FieldDescriptorProto_Type.DOUBLE | typeof FieldDescriptorProto_Type.BYTES | typeof FieldDescriptorProto_Type.UNSPECIFIED$ | typeof FieldDescriptorProto_Type.MESSAGE | typeof FieldDescriptorProto_Type.ENUM | typeof FieldDescriptorProto_Type.GROUP>;
/**
 * Map field value type.
 *
 * Can be any scalar type, enum, or message.
 */
export declare type MapFieldValueType = DescriptorProto | EnumDescriptorProto | ScalarValueType;
export interface IDescriptorInfo {
    /**
     * Is this an extension field?
     */
    isExtension(descriptor: FieldDescriptorProto): boolean;
    /**
     * Finds all extension fields extending the given message descriptor.
     */
    extensionsFor(descriptorOrTypeName: DescriptorProto | string): FieldDescriptorProto[];
    /**
     * Get the name of an extension field, including the namespace
     * where it was defined.
     *
     * For example, an extension field defined in the package "foo":
     *
     * ```proto
     * extend google.protobuf.FieldOptions {
     *      bool opt = 1001;
     * }
     * ```
     *
     * Will have the extension name "foo.opt".
     *
     */
    getExtensionName(fieldDescriptor: FieldDescriptorProto): string;
    /**
     * Return the user-specified JSON name.
     * Returns `undefined` if no name was specified or name
     * equals lowerCamelCaseName.
     */
    getFieldCustomJsonName(fieldDescriptor: FieldDescriptorProto): string | undefined;
    /**
     * Is this a enum field?
     */
    isEnumField(fieldDescriptor: FieldDescriptorProto): boolean;
    /**
     * Get the enum descriptor for a enum field.
     */
    getEnumFieldEnum(fieldDescriptor: FieldDescriptorProto): EnumDescriptorProto;
    /**
     * Is this a message field?
     *
     * Returns false if this is a map field, even though map fields have type MESSAGE.
     *
     * Before v2.0.0-alpha.23, this method returned true for group fields (type GROUP).
     */
    isMessageField(fieldDescriptor: FieldDescriptorProto): boolean;
    /**
     * Is this a group field?
     *
     * Note that groups are deprecated and not supported in proto3.
     */
    isGroupField(fieldDescriptor: FieldDescriptorProto): boolean;
    /**
     * Get the message descriptor for a message field.
     */
    getMessageFieldMessage(fieldDescriptor: FieldDescriptorProto): DescriptorProto;
    /**
     * Is this a scalar field?
     */
    isScalarField(fieldDescriptor: FieldDescriptorProto): boolean;
    /**
     * Get the scalar type of a scalar field.
     */
    getScalarFieldType(fieldDescriptor: FieldDescriptorProto): ScalarValueType;
    /**
     * Is this a map field?
     */
    isMapField(fieldDescriptor: FieldDescriptorProto): boolean;
    /**
     * Get the key type of a map field.
     */
    getMapKeyType(fieldDescriptor: FieldDescriptorProto): MapFieldKeyType;
    /**
     * Get the value type (can be enum or message) of a map field.
     */
    getMapValueType(fieldDescriptor: FieldDescriptorProto): DescriptorProto | EnumDescriptorProto | ScalarValueType;
    /**
     * Determines whether the user declared the field
     * with `optional`.
     *
     * For proto2, the field descriptor's `label` is
     * `LABEL_OPTIONAL`.
     *
     * For proto3, the field descriptor's `proto3_optional`
     * is `true` and the field will be the sole member
     * of a "synthetic" oneof.
     */
    isUserDeclaredOptional(fieldDescriptor: FieldDescriptorProto): boolean;
    /**
     * Is this field declared as a oneof member by the user?
     *
     * When a field is declared `optional` in proto3, a
     * "synthetic" oneof is generated by the compiler.
     */
    isUserDeclaredOneof(fieldDescriptor: FieldDescriptorProto): boolean;
    /**
     * Determines whether the user declared the field
     * with `repeated`.
     *
     * A map<K,V> for example cannot be repeated, but
     * is internally represented as a repeated
     * entry-message. This function recognizes this
     * and returns false.
     */
    isUserDeclaredRepeated(fieldDescriptor: FieldDescriptorProto): boolean;
    /**
     * Should this (repeated) field be encoded packed?
     *
     * Returns true if the user set [packed = true] or if syntax is proto3
     * (and user did not explicitly disable default behaviour of proto3).
     *
     * Returns false if:
     * - the field is not declared with `repeated`.
     * - the user set [packed = false].
     * - syntax is proto2 and there is no [packed = true].
     *
     * Throws if the field is `repeated` and type is `bytes` or `string`.
     * This should have been a parse failure by protoc.
     */
    shouldBePackedRepeated(fieldDescriptor: FieldDescriptorProto): boolean;
    /**
     * Is this element marked deprecated by the user?
     */
    isExplicitlyDeclaredDeprecated(descriptor: AnyDescriptorProto): boolean;
    /**
     * Is the element intentionally created by the user
     * or synthesized by the protobuf compiler?
     *
     * For example, the compiler generates an entry
     * message for each map.
     */
    isSyntheticElement(descriptor: AnyDescriptorProto): boolean;
    /**
     * Determine whether all enum value names start with the snake_case
     * version of the enums name (enumLocalName or descriptor.name).
     * If so, return the shared prefix. Otherwise, return undefined.
     *
     * For example, the following enum...
     *
     * ```proto
     * enum MyEnum {
     *     MY_ENUM_FOO = 0;
     *     MY_ENUM_BAR = 1;
     * }
     * ```
     *
     * ... has the shared prefix "MY_ENUM_".
     */
    findEnumSharedPrefix(enumDescriptor: EnumDescriptorProto, enumLocalName?: string): string | undefined;
    /**
     * Is a top-level type declared in the given file used anywhere the given
     * "inFiles"?
     *
     * Returns true if a type from the file is used in a message field or
     * method input or output.
     */
    isFileUsed(file: FileDescriptorProto, inFiles: FileDescriptorProto[]): boolean;
    /**
     * Is the given type used anywhere in the given "inFiles"?
     *
     * Returns true if the type is used in a message field or method input or
     * output.
     */
    isTypeUsed(type: AnyTypeDescriptorProto, inFiles: FileDescriptorProto[]): boolean;
}
export declare class DescriptorInfo implements IDescriptorInfo {
    private readonly tree;
    private readonly nameLookup;
    constructor(tree: IDescriptorTree, nameLookup: ITypeNameLookup);
    private allExtensions;
    private getAllExtensions;
    isExtension(fieldDescriptor: FieldDescriptorProto): boolean;
    extensionsFor(descriptorOrTypeName: DescriptorProto | string): FieldDescriptorProto[];
    getExtensionName(fieldDescriptor: FieldDescriptorProto): string;
    getFieldCustomJsonName(fieldDescriptor: FieldDescriptorProto): string | undefined;
    isEnumField(fieldDescriptor: FieldDescriptorProto): boolean;
    getEnumFieldEnum(fieldDescriptor: FieldDescriptorProto): EnumDescriptorProto;
    isMessageField(fieldDescriptor: FieldDescriptorProto): boolean;
    isGroupField(fieldDescriptor: FieldDescriptorProto): boolean;
    getMessageFieldMessage(fieldDescriptor: FieldDescriptorProto): DescriptorProto;
    isScalarField(fieldDescriptor: FieldDescriptorProto): boolean;
    getScalarFieldType(fieldDescriptor: FieldDescriptorProto): ScalarValueType;
    isMapField(fieldDescriptor: FieldDescriptorProto): boolean;
    getMapKeyType(fieldDescriptor: FieldDescriptorProto): MapFieldKeyType;
    getMapValueType(fieldDescriptor: FieldDescriptorProto): MapFieldValueType;
    private getMapEntryMessage;
    isExplicitlyDeclaredDeprecated(descriptor: AnyDescriptorProto): boolean;
    isSyntheticElement(descriptor: AnyDescriptorProto): boolean;
    isUserDeclaredOneof(fieldDescriptor: FieldDescriptorProto): boolean;
    isUserDeclaredOptional(fieldDescriptor: FieldDescriptorProto): boolean;
    isUserDeclaredRepeated(fieldDescriptor: FieldDescriptorProto): boolean;
    shouldBePackedRepeated(fieldDescriptor: FieldDescriptorProto): boolean;
    findEnumSharedPrefix(enumDescriptor: EnumDescriptorProto, enumLocalName?: string): string | undefined;
    isFileUsed(file: FileDescriptorProto, inFiles: FileDescriptorProto[]): boolean;
    isTypeUsed(type: AnyTypeDescriptorProto, inFiles: FileDescriptorProto[]): boolean;
}
