import { DescriptorRegistry, FileDescriptorProto, GeneratedFile, TypescriptFile } from "@protobuf-ts/plugin-framework";
import { InternalOptions } from "./our-options";
/**
 * A protobuf-ts output file.
 */
export declare class OutFile extends TypescriptFile implements GeneratedFile {
    readonly fileDescriptor: FileDescriptorProto;
    private readonly registry;
    private readonly options;
    private header;
    constructor(name: string, fileDescriptor: FileDescriptorProto, registry: DescriptorRegistry, options: InternalOptions);
    getContent(): string;
    getHeader(): string;
    private makeHeader;
}
