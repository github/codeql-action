import { DescriptorProto, DescriptorRegistry, EnumDescriptorProto, FieldDescriptorProto, FieldOptions_JSType, FileDescriptorProto, MethodDescriptorProto, ServiceDescriptorProto } from "@protobuf-ts/plugin-framework";
import * as rt from "@protobuf-ts/runtime";
import * as rpc from "@protobuf-ts/runtime-rpc";
import { OurFileOptions, OurServiceOptions } from "./our-options";
declare type JsonOptionsMap = {
    [extensionName: string]: rt.JsonValue;
};
/**
 * The protobuf-ts plugin generates code for message types from descriptor
 * protos. This class also creates message types from descriptor protos, but
 * but instead of generating code, it creates the type in-memory.
 *
 * This means that it is possible, for example, to read a message from binary
 * data without any generated code.
 *
 * The protobuf-ts plugin uses the interpreter to read custom options at
 * compile time and convert them to JSON.
 *
 * Since the interpreter creates fully functional message types including
 * reflection information, the protobuf-ts plugin uses the interpreter as
 * single source of truth for generating message interfaces and reflection
 * information.
 */
export declare class Interpreter {
    private readonly registry;
    private readonly options;
    private readonly serviceTypes;
    private readonly messageTypes;
    private readonly enumInfos;
    constructor(registry: DescriptorRegistry, options: {
        normalLongType: rt.LongType;
        oneofKindDiscriminator: string;
        synthesizeEnumZeroValue: string | false;
        forceExcludeAllOptions: boolean;
        keepEnumPrefix: boolean;
        useProtoFieldName: boolean;
    });
    /**
     * Returns a map of custom options for the provided descriptor.
     * The map is an object indexed by the extension field name.
     * The value of the extension field is provided in JSON format.
     *
     * This works by:
     * - searching for option extensions for the given descriptor proto
     *   in the registry.
     * - for example, providing a google.protobuf.FieldDescriptorProto
     *   searches for all extensions on google.protobuf.FieldOption.
     * - extensions are just fields, so we build a synthetic message
     *   type with all the (extension) fields.
     * - the field names are created by DescriptorRegistry.getExtensionName(),
     *   which produces for example "spec.option_name", where "spec" is
     *   the package and "option_name" is the field name.
     * - then we concatenate all unknown field data of the option and
     *   read the data with our synthetic message type
     * - the read message is then simply converted to JSON
     *
     * The optional "optionBlacklist" will exclude matching options.
     * The blacklist can contain exact extension names, or use the wildcard
     * character `*` to match a namespace or even all options.
     *
     * Note that options on options (google.protobuf.*Options) are not
     * supported.
     */
    readOptions(descriptor: FieldDescriptorProto | MethodDescriptorProto | FileDescriptorProto | ServiceDescriptorProto | DescriptorProto, excludeOptions: readonly string[]): JsonOptionsMap | undefined;
    /**
     * Read the custom file options declared in protobuf-ts.proto
     */
    readOurFileOptions(file: FileDescriptorProto): OurFileOptions;
    /**
     * Read the custom service options declared in protobuf-ts.proto
     */
    readOurServiceOptions(service: ServiceDescriptorProto): OurServiceOptions;
    /**
     * Get a runtime type for the given message type name or message descriptor.
     * Creates the type if not created previously.
     *
     * Honors our file option "ts.exclude_options".
     */
    getMessageType(descriptorOrTypeName: string | DescriptorProto): rt.IMessageType<rt.UnknownMessage>;
    /**
     * Get a runtime type for the given service type name or service descriptor.
     * Creates the type if not created previously.
     *
     * Honors our file option "ts.exclude_options".
     */
    getServiceType(descriptorOrTypeName: string | ServiceDescriptorProto): rpc.ServiceType;
    /**
     * Get runtime information for an enum.
     * Creates the info if not created previously.
     */
    getEnumInfo(descriptorOrTypeName: string | EnumDescriptorProto): rt.EnumInfo;
    private static createTypescriptNameForMethod;
    private buildServiceType;
    private buildMethodInfo;
    /**
     * Create a name for a field or a oneof.
     * - use lowerCamelCase unless useProtoFieldName option is enabled
     * - escape reserved object property names by
     *   adding '$' at the end
     * - don't have to escape reserved keywords
     */
    private createTypescriptNameForField;
    private buildFieldInfos;
    private buildFieldInfo;
    protected buildEnumInfo(descriptor: EnumDescriptorProto): rt.EnumInfo;
    protected determineNonDefaultLongType(scalarType: rt.ScalarType, jsTypeOption?: FieldOptions_JSType): rt.LongType | undefined;
    /**
     * Is this a 64 bit integral or fixed type?
     */
    static isLongValueType(type: rt.ScalarType): boolean;
}
/**
 * Builds a typescript enum lookup object,
 * compatible with enums generated by @protobuf-ts/plugin.
 */
export declare class RuntimeEnumBuilder {
    private readonly values;
    add(name: string, number: number): void;
    isValid(): boolean;
    build(): rt.EnumInfo[1];
}
export {};
