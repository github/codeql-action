import { CodeGeneratorRequest, CodeGeneratorResponse_Feature, GeneratedFile, PluginBase } from "@protobuf-ts/plugin-framework";
export declare class DumpPlugin extends PluginBase<GeneratedFile> {
    generate(request: CodeGeneratorRequest): GeneratedFile[];
    private static mkdir;
    protected getSupportedFeatures: () => CodeGeneratorResponse_Feature[];
}
