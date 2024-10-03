import { CodeGeneratorRequest, CodeGeneratorResponse_Feature, PluginBase } from "@protobuf-ts/plugin-framework";
import { File } from "./file";
export declare class ProtobuftsPlugin extends PluginBase<File> {
    parameters: {
        ts_proto: {
            description: string;
        };
        gateway: {
            description: string;
        };
        index_file: {
            description: string;
        };
        emit_default_values: {
            description: string;
        };
        openapi_twirp: {
            description: string;
        };
        openapi_gateway: {
            description: string;
        };
        standalone: {
            description: string;
        };
        client_only: {
            description: string;
        };
        server_only: {
            description: string;
        };
        camel_case: {
            description: string;
        };
    };
    generate(request: CodeGeneratorRequest): Promise<File[]>;
    protected getSupportedFeatures: () => CodeGeneratorResponse_Feature[];
}
