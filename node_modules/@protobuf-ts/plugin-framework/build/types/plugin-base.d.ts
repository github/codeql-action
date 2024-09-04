/// <reference types="node" />
import { CodeGeneratorRequest, CodeGeneratorResponse, CodeGeneratorResponse_Feature } from "./google/protobuf/compiler/plugin";
import { ReadStream } from "tty";
import { GeneratedFile } from "./generated-file";
export declare type OptionsSpec = {
    [key: string]: {
        description: string;
        excludes?: string[];
        requires?: string[];
    };
};
export declare type ResolvedOptions<T extends OptionsSpec> = {
    [P in keyof T]: boolean;
};
/**
 * Base class for a protobuf plugin.
 *
 * Implement the abstract `generate()` method to create a plugin.
 * The method takes a `CodeGeneratorRequest` and returns an
 * array of `GeneratedFile` or a promise thereof.
 *
 *
 * Usage:
 *
 *   #!/usr/bin/env node
 *   const {MyPlugin} = require( ... );
 *   new MyPlugin.run().catch(_ => {
 *     process.stderr.write('failed to run plugin');
 *     process.exit(1);
 *   });
 *
 * Reads a `CodeGeneratorRequest` created by `protoc` from stdin,
 * passes it to the plugin-function and writes a
 * `CodeGeneratorResponse` to stdout.
 *
 *
 * Options:
 *
 * Use the `parseOptions()` method the parse the parameter
 * of a `CodeGeneratorRequest` to a map of flags. Options are
 * validated and usage is generated on error.
 *
 *
 * Error handling:
 *
 * `generate()` may raise an error, reject it's promise or
 * return an `GeneratedFile` with an attached error.
 *
 * Throwing `new Error("hello")` will result in the output:
 *
 *   $ protoc --xx_out=/tmp -I protos protos/*
 *   --xx_out: Error: hello
 *       at /path/to/your-plugin.js:69
 *       ...
 *
 *
 */
export declare abstract class PluginBase<T extends GeneratedFile = GeneratedFile> {
    abstract generate(request: CodeGeneratorRequest): Promise<T[]> | T[];
    run(): Promise<void>;
    protected getSupportedFeatures(): CodeGeneratorResponse_Feature[];
    protected parseOptions<T extends OptionsSpec>(spec: T, parameter: string | undefined): ResolvedOptions<T>;
    private throwOptionError;
    private validateOptionsSpec;
    protected readBytes(stream: ReadStream): Promise<Uint8Array>;
    protected createResponse(files: GeneratedFile[]): CodeGeneratorResponse;
    protected errorToString(error: any): string;
    private setBlockingStdout;
}
