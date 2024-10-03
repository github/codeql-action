import { MessageType } from "@protobuf-ts/runtime";
import { FileDescriptorProto } from "../descriptor";
/**
 * The version number of protocol compiler.
 *
 * @generated from protobuf message google.protobuf.compiler.Version
 */
export interface Version {
    /**
     * @generated from protobuf field: optional int32 major = 1;
     */
    major?: number;
    /**
     * @generated from protobuf field: optional int32 minor = 2;
     */
    minor?: number;
    /**
     * @generated from protobuf field: optional int32 patch = 3;
     */
    patch?: number;
    /**
     * A suffix for alpha, beta or rc release, e.g., "alpha-1", "rc2". It should
     * be empty for mainline stable releases.
     *
     * @generated from protobuf field: optional string suffix = 4;
     */
    suffix?: string;
}
/**
 * An encoded CodeGeneratorRequest is written to the plugin's stdin.
 *
 * @generated from protobuf message google.protobuf.compiler.CodeGeneratorRequest
 */
export interface CodeGeneratorRequest {
    /**
     * The .proto files that were explicitly listed on the command-line.  The
     * code generator should generate code only for these files.  Each file's
     * descriptor will be included in proto_file, below.
     *
     * @generated from protobuf field: repeated string file_to_generate = 1;
     */
    fileToGenerate: string[];
    /**
     * The generator parameter passed on the command-line.
     *
     * @generated from protobuf field: optional string parameter = 2;
     */
    parameter?: string;
    /**
     * FileDescriptorProtos for all files in files_to_generate and everything
     * they import.  The files will appear in topological order, so each file
     * appears before any file that imports it.
     *
     * protoc guarantees that all proto_files will be written after
     * the fields above, even though this is not technically guaranteed by the
     * protobuf wire format.  This theoretically could allow a plugin to stream
     * in the FileDescriptorProtos and handle them one by one rather than read
     * the entire set into memory at once.  However, as of this writing, this
     * is not similarly optimized on protoc's end -- it will store all fields in
     * memory at once before sending them to the plugin.
     *
     * Type names of fields and extensions in the FileDescriptorProto are always
     * fully qualified.
     *
     * @generated from protobuf field: repeated google.protobuf.FileDescriptorProto proto_file = 15;
     */
    protoFile: FileDescriptorProto[];
    /**
     * The version number of protocol compiler.
     *
     * @generated from protobuf field: optional google.protobuf.compiler.Version compiler_version = 3;
     */
    compilerVersion?: Version;
}
/**
 * The plugin writes an encoded CodeGeneratorResponse to stdout.
 *
 * @generated from protobuf message google.protobuf.compiler.CodeGeneratorResponse
 */
export interface CodeGeneratorResponse {
    /**
     * Error message.  If non-empty, code generation failed.  The plugin process
     * should exit with status code zero even if it reports an error in this way.
     *
     * This should be used to indicate errors in .proto files which prevent the
     * code generator from generating correct code.  Errors which indicate a
     * problem in protoc itself -- such as the input CodeGeneratorRequest being
     * unparseable -- should be reported by writing a message to stderr and
     * exiting with a non-zero status code.
     *
     * @generated from protobuf field: optional string error = 1;
     */
    error?: string;
    /**
     * A bitmask of supported features that the code generator supports.
     * This is a bitwise "or" of values from the Feature enum.
     *
     * @generated from protobuf field: optional uint64 supported_features = 2;
     */
    supportedFeatures?: string;
    /**
     * @generated from protobuf field: repeated google.protobuf.compiler.CodeGeneratorResponse.File file = 15;
     */
    file: CodeGeneratorResponse_File[];
}
/**
 * Represents a single generated file.
 *
 * @generated from protobuf message google.protobuf.compiler.CodeGeneratorResponse.File
 */
export interface CodeGeneratorResponse_File {
    /**
     * The file name, relative to the output directory.  The name must not
     * contain "." or ".." components and must be relative, not be absolute (so,
     * the file cannot lie outside the output directory).  "/" must be used as
     * the path separator, not "\".
     *
     * If the name is omitted, the content will be appended to the previous
     * file.  This allows the generator to break large files into small chunks,
     * and allows the generated text to be streamed back to protoc so that large
     * files need not reside completely in memory at one time.  Note that as of
     * this writing protoc does not optimize for this -- it will read the entire
     * CodeGeneratorResponse before writing files to disk.
     *
     * @generated from protobuf field: optional string name = 1;
     */
    name?: string;
    /**
     * If non-empty, indicates that the named file should already exist, and the
     * content here is to be inserted into that file at a defined insertion
     * point.  This feature allows a code generator to extend the output
     * produced by another code generator.  The original generator may provide
     * insertion points by placing special annotations in the file that look
     * like:
     *   @@protoc_insertion_point(NAME)
     * The annotation can have arbitrary text before and after it on the line,
     * which allows it to be placed in a comment.  NAME should be replaced with
     * an identifier naming the point -- this is what other generators will use
     * as the insertion_point.  Code inserted at this point will be placed
     * immediately above the line containing the insertion point (thus multiple
     * insertions to the same point will come out in the order they were added).
     * The double-@ is intended to make it unlikely that the generated code
     * could contain things that look like insertion points by accident.
     *
     * For example, the C++ code generator places the following line in the
     * .pb.h files that it generates:
     *   // @@protoc_insertion_point(namespace_scope)
     * This line appears within the scope of the file's package namespace, but
     * outside of any particular class.  Another plugin can then specify the
     * insertion_point "namespace_scope" to generate additional classes or
     * other declarations that should be placed in this scope.
     *
     * Note that if the line containing the insertion point begins with
     * whitespace, the same whitespace will be added to every line of the
     * inserted text.  This is useful for languages like Python, where
     * indentation matters.  In these languages, the insertion point comment
     * should be indented the same amount as any inserted code will need to be
     * in order to work correctly in that context.
     *
     * The code generator that generates the initial file and the one which
     * inserts into it must both run as part of a single invocation of protoc.
     * Code generators are executed in the order in which they appear on the
     * command line.
     *
     * If |insertion_point| is present, |name| must also be present.
     *
     * @generated from protobuf field: optional string insertion_point = 2;
     */
    insertionPoint?: string;
    /**
     * The file contents.
     *
     * @generated from protobuf field: optional string content = 15;
     */
    content?: string;
}
/**
 * Sync with code_generator.h.
 *
 * @generated from protobuf enum google.protobuf.compiler.CodeGeneratorResponse.Feature
 */
export declare enum CodeGeneratorResponse_Feature {
    /**
     * @generated from protobuf enum value: FEATURE_NONE = 0;
     */
    NONE = 0,
    /**
     * @generated from protobuf enum value: FEATURE_PROTO3_OPTIONAL = 1;
     */
    PROTO3_OPTIONAL = 1
}
/**
 * Type for protobuf message google.protobuf.compiler.Version
 */
declare class Version$Type extends MessageType<Version> {
    constructor();
}
export declare const Version: Version$Type;
/**
 * Type for protobuf message google.protobuf.compiler.CodeGeneratorRequest
 */
declare class CodeGeneratorRequest$Type extends MessageType<CodeGeneratorRequest> {
    constructor();
}
export declare const CodeGeneratorRequest: CodeGeneratorRequest$Type;
/**
 * Type for protobuf message google.protobuf.compiler.CodeGeneratorResponse
 */
declare class CodeGeneratorResponse$Type extends MessageType<CodeGeneratorResponse> {
    constructor();
}
export declare const CodeGeneratorResponse: CodeGeneratorResponse$Type;
/**
 * Type for protobuf message google.protobuf.compiler.CodeGeneratorResponse.File
 */
declare class CodeGeneratorResponse_File$Type extends MessageType<CodeGeneratorResponse_File> {
    constructor();
}
export declare const CodeGeneratorResponse_File: CodeGeneratorResponse_File$Type;
export {};
