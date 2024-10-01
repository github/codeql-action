import { EnumValueDescriptorProto, FieldDescriptorProto, MethodDescriptorProto } from "./google/protobuf/descriptor";
import { AnyDescriptorProto, IDescriptorInfo, ScalarValueType } from "./descriptor-info";
import { IDescriptorTree } from "./descriptor-tree";
import { ISourceCodeInfoLookup } from "./source-code-info";
import { ITypeNameLookup } from "./type-names";
export interface IStringFormat {
    /**
     * Returns type ('message', 'field', etc.) and descriptor name.
     *
     * Examples:
     *   message Bar
     *   field value = 2
     *   rpc Fetch()
     */
    formatName(descriptor: AnyDescriptorProto): string;
    /**
     * Returns qualified name, consisting of:
     * - keyword like "message", "enum", etc. followed by " "
     * - package name followed by "."
     * - parent type descriptor names separated by "."
     * - descriptor name
     *
     * Examples:
     *   message .foo.Bar
     *   field .foo.Bar.value = 2
     *   rpc .foo.Service.Fetch()
     *
     * If `includeFileInfo` is set, the name of the file containing
     * the descriptor is added, including line number.
     */
    formatQualifiedName(descriptor: AnyDescriptorProto, includeFileInfo?: boolean): string;
    /**
     * Returns field declaration, similar to how it appeared
     * in the .proto file.
     *
     * Examples:
     *   repeated string foo = 1 [deprecated = true];
     *   .foo.Bar bar = 2 [json_name = "baz"];
     *   map<string, .foo.Bar> map = 3;
     *   uint64 foo = 4 [jstype = JS_NUMBER];
     */
    formatFieldDeclaration(descriptor: FieldDescriptorProto): string;
    /**
     * Returns declaration of enum value, similar to how it
     * appeared in the .proto file.
     *
     * Examples:
     *   STATE_UNKNOWN = 0;
     *   STATE_READY = 1 [deprecated = true];
     */
    formatEnumValueDeclaration(descriptor: EnumValueDescriptorProto): string;
    /**
     * Returns declaration of an rpc method, similar to how
     * it appeared in the .proto file, but does not show any options.
     *
     * Examples:
     *   rpc Fetch(FetchRequest) returns (stream FetchResponse);
     */
    formatRpcDeclaration(descriptor: MethodDescriptorProto): string;
}
export declare class StringFormat implements IStringFormat {
    private readonly nameLookup;
    private readonly treeLookup;
    private readonly sourceCodeLookup;
    private readonly descriptorInfo;
    constructor(lookup: ITypeNameLookup & IDescriptorTree & ISourceCodeInfoLookup & IDescriptorInfo);
    constructor(nameLookup: ITypeNameLookup, treeLookup: IDescriptorTree, sourceCodeLookup: ISourceCodeInfoLookup, descriptorInfo: IDescriptorInfo);
    /**
     * Returns name of a scalar value type like it would
     * appear in a .proto.
     *
     * For example, `FieldDescriptorProto_Type.UINT32` -> `"uint32"`.
     */
    static formatScalarType(type: ScalarValueType): string;
    /**
     * Returns type ('message', 'field', etc.) and descriptor name.
     *
     * Examples:
     *   message Bar
     *   field value = 2
     *   rpc Fetch()
     */
    static formatName(descriptor: AnyDescriptorProto): string;
    formatQualifiedName(descriptor: AnyDescriptorProto, includeFileInfo: boolean): string;
    formatName(descriptor: AnyDescriptorProto): string;
    formatFieldDeclaration(descriptor: FieldDescriptorProto): string;
    formatEnumValueDeclaration(descriptor: EnumValueDescriptorProto): string;
    formatRpcDeclaration(descriptor: MethodDescriptorProto): string;
}
