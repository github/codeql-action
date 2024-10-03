import { CodeGeneratorRequest, CodeGeneratorResponse_Feature, GeneratedFile, PluginBase } from "@protobuf-ts/plugin-framework";
import { OutFile } from "./out-file";
import { InternalOptions } from "./our-options";
export declare class ProtobuftsPlugin extends PluginBase {
    private readonly version;
    parameters: {
        long_type_string: {
            description: string;
            excludes: string[];
        };
        long_type_number: {
            description: string;
            excludes: string[];
        };
        long_type_bigint: {
            description: string;
            excludes: string[];
        };
        generate_dependencies: {
            description: string;
        };
        force_exclude_all_options: {
            description: string;
        };
        keep_enum_prefix: {
            description: string;
        };
        use_proto_field_name: {
            description: string;
        };
        ts_nocheck: {
            description: string;
            excludes: string[];
        };
        disable_ts_nocheck: {
            description: string;
            excludes: string[];
        };
        eslint_disable: {
            description: string;
            excludes: string[];
        };
        no_eslint_disable: {
            description: string;
            excludes: string[];
        };
        add_pb_suffix: {
            description: string;
        };
        output_typescript: {
            description: string;
            excludes: string[];
        };
        output_javascript: {
            description: string;
            excludes: string[];
        };
        output_javascript_es2015: {
            description: string;
            excludes: string[];
        };
        output_javascript_es2016: {
            description: string;
            excludes: string[];
        };
        output_javascript_es2017: {
            description: string;
            excludes: string[];
        };
        output_javascript_es2018: {
            description: string;
            excludes: string[];
        };
        output_javascript_es2019: {
            description: string;
            excludes: string[];
        };
        output_javascript_es2020: {
            description: string;
            excludes: string[];
        };
        output_legacy_commonjs: {
            description: string;
            excludes: string[];
        };
        client_none: {
            description: string;
            excludes: string[];
        };
        client_generic: {
            description: string;
            excludes: string[];
        };
        client_grpc1: {
            description: string;
            excludes: string[];
        };
        force_client_none: {
            description: string;
            excludes: string[];
        };
        server_none: {
            description: string;
            excludes: string[];
        };
        server_generic: {
            description: string;
            excludes: string[];
        };
        server_grpc1: {
            description: string;
            excludes: string[];
        };
        force_server_none: {
            description: string;
        };
        force_disable_services: {
            description: string;
            excludes: string[];
        };
        optimize_speed: {
            description: string;
            excludes: string[];
        };
        optimize_code_size: {
            description: string;
            excludes: string[];
        };
        force_optimize_code_size: {
            description: string;
            excludes: string[];
        };
        force_optimize_speed: {
            description: string;
            excludes: string[];
        };
    };
    constructor(version: string);
    generate(request: CodeGeneratorRequest): GeneratedFile[];
    protected transpile(tsFiles: OutFile[], options: InternalOptions): GeneratedFile[];
    protected getSupportedFeatures: () => CodeGeneratorResponse_Feature[];
}
