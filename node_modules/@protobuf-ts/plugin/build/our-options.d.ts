/**
 * Custom file options interpreted by @protobuf-ts/plugin
 */
import * as rt from "@protobuf-ts/runtime";
import { FileDescriptorProto, FileOptions_OptimizeMode as OptimizeMode, IStringFormat, ServiceDescriptorProto } from "@protobuf-ts/plugin-framework";
import { Interpreter } from "./interpreter";
import * as ts from "typescript";
/**
 * Custom file options interpreted by @protobuf-ts/plugin
 * The extensions are declared in protobuf-ts.proto
 */
export interface OurFileOptions {
    /**
     * Exclude field or method options from being emitted in reflection data.
     *
     * For example, to stop the data of the "google.api.http" method option
     * from being exported in the reflection information, set the following
     * file option:
     *
     * ```proto
     * option (ts.exclude_options) = "google.api.http";
     * ```
     *
     * The option can be set multiple times.
     * `*` serves as a wildcard and will greedily match anything.
     */
    readonly ["ts.exclude_options"]: readonly string[];
}
/**
 * Custom service options interpreted by @protobuf-ts/plugin
 */
export interface OurServiceOptions {
    /**
     * Generate a client for this service with this style.
     * Can be set multiple times to generate several styles.
     */
    readonly ["ts.client"]: ClientStyle[];
    /**
     * Generate a server for this service with this style.
     * Can be set multiple times to generate several styles.
     */
    readonly ["ts.server"]: ServerStyle[];
}
/**
 * Read the custom file options declared in protobuf-ts.proto
 */
export declare function readOurFileOptions(file: FileDescriptorProto): OurFileOptions;
/**
 * Read the custom service options declared in protobuf-ts.proto
 */
export declare function readOurServiceOptions(service: ServiceDescriptorProto): OurServiceOptions;
/**
 * The available client styles from @protobuf-ts/plugin
 * The extensions are declared in protobuf-ts.proto
 */
export declare enum ClientStyle {
    /**
     * Do not emit a client for this service.
     */
    NO_CLIENT = 0,
    /**
     * Use the call implementations of @protobuf-ts/runtime-rpc.
     * This is the default behaviour.
     */
    GENERIC_CLIENT = 1,
    /**
     * Generate a client using @grpc/grpc-js (major version 1).
     */
    GRPC1_CLIENT = 4
}
/**
 * The available server styles from @protobuf-ts/plugin
 * The extensions are declared in protobuf-ts.proto
 */
export declare enum ServerStyle {
    /**
     * Do not emit a server for this service.
     * This is the default behaviour.
     */
    NO_SERVER = 0,
    /**
     * Generate a generic server interface.
     * Adapters be used to serve the service, for example @protobuf-ts/grpc-backend
     * for gRPC.
     */
    GENERIC_SERVER = 1,
    /**
     * Generate a server for @grpc/grpc-js (major version 1).
     */
    GRPC1_SERVER = 2
}
/**
 * Internal settings for the file generation.
 */
export interface InternalOptions {
    readonly generateDependencies: boolean;
    readonly pluginCredit?: string;
    readonly normalLongType: rt.LongType;
    readonly normalOptimizeMode: OptimizeMode;
    readonly forcedOptimizeMode: OptimizeMode | undefined;
    readonly normalServerStyle: ServerStyle;
    readonly forcedServerStyle: ServerStyle | undefined;
    readonly normalClientStyle: ClientStyle;
    readonly forcedClientStyle: ClientStyle | undefined;
    readonly synthesizeEnumZeroValue: string | false;
    readonly oneofKindDiscriminator: string;
    readonly runtimeRpcImportPath: string;
    readonly runtimeImportPath: string;
    readonly forceExcludeAllOptions: boolean;
    readonly keepEnumPrefix: boolean;
    readonly useProtoFieldName: boolean;
    readonly tsNoCheck: boolean;
    readonly esLintDisable: boolean;
    readonly transpileTarget: ts.ScriptTarget | undefined;
    readonly transpileModule: ts.ModuleKind;
    readonly forceDisableServices: boolean;
    readonly addPbSuffix: boolean;
}
export declare function makeInternalOptions(params?: {
    generate_dependencies: boolean;
    long_type_string: boolean;
    long_type_number: boolean;
    force_exclude_all_options: boolean;
    keep_enum_prefix: boolean;
    use_proto_field_name: boolean;
    ts_nocheck: boolean;
    eslint_disable: boolean;
    force_optimize_code_size: boolean;
    force_optimize_speed: boolean;
    optimize_code_size: boolean;
    force_server_none: boolean;
    server_none: boolean;
    server_generic: boolean;
    server_grpc1: boolean;
    force_client_none: boolean;
    client_generic: boolean;
    client_none: boolean;
    client_grpc1: boolean;
    add_pb_suffix: boolean;
    force_disable_services: boolean;
    output_typescript: boolean;
    output_javascript: boolean;
    output_javascript_es2015: boolean;
    output_javascript_es2016: boolean;
    output_javascript_es2017: boolean;
    output_javascript_es2018: boolean;
    output_javascript_es2019: boolean;
    output_javascript_es2020: boolean;
    output_legacy_commonjs: boolean;
}, pluginCredit?: string): InternalOptions;
export declare class OptionResolver {
    private readonly interpreter;
    private readonly stringFormat;
    private readonly options;
    constructor(interpreter: Interpreter, stringFormat: IStringFormat, options: InternalOptions);
    getOptimizeMode(file: FileDescriptorProto): OptimizeMode;
    getClientStyles(descriptor: ServiceDescriptorProto): ClientStyle[];
    getServerStyles(descriptor: ServiceDescriptorProto): ServerStyle[];
}
