import { FileDescriptorProto, SourceCodeInfo_Location } from "./google/protobuf/descriptor";
import { AnyDescriptorProto } from "./descriptor-info";
import { DescriptorParentFn } from "./descriptor-tree";
export interface ISourceCodeInfoLookup {
    /**
     * Return the comments for the given descriptor.
     *
     * If no comments found, empty (not undefined) object
     * is returned.
     *
     * Trailing newlines are removed.
     */
    sourceCodeComments(descriptor: AnyDescriptorProto): SourceCodeComment;
    /**
     * Return the comments for the specified element
     * of the file descriptor.
     */
    sourceCodeComments(file: FileDescriptorProto, field: FileDescriptorProtoFields): SourceCodeComment;
    /**
     * Return cursor position of the given element in the source
     * code as line number and column, both starting at 1.
     */
    sourceCodeCursor(descriptor: AnyDescriptorProto): SourceCodeCursor;
}
export declare class SourceCodeInfoLookup implements ISourceCodeInfoLookup {
    private readonly _parentResolver;
    constructor(parentResolver: DescriptorParentFn);
    sourceCodeCursor(descriptor: AnyDescriptorProto): SourceCodeCursor;
    sourceCodeComments(file: FileDescriptorProto, field: FileDescriptorProtoFields): SourceCodeComment;
    sourceCodeComments(descriptor: AnyDescriptorProto): SourceCodeComment;
    private _findFile;
}
/**
 * Return cursor position of the given source code location
 * as line number and column, both starting at 1.
 *
 * If more than one location is given, only the first one
 * is evaluated, the others are discarded.
 */
export declare function sourceCodeLocationToCursor(locations: readonly SourceCodeInfo_Location[]): SourceCodeCursor;
/**
 * Represents line number and column within a source file,
 * both starting at 1.
 */
export declare type SourceCodeCursor = readonly [number, number] | typeof emptyCursor;
declare const emptyCursor: readonly [undefined, undefined];
/**
 * Return the comments for the given source code location.
 *
 * If more than one location is given, only the first one
 * is evaluated, the others are discarded.
 *
 * If no comments found, empty (not undefined) object
 * is returned.
 *
 * Trailing newlines are removed.
 */
export declare function sourceCodeLocationToComment(locations: readonly SourceCodeInfo_Location[]): SourceCodeComment;
/**
 * Comments for a specific source code location.
 */
export declare type SourceCodeComment = {
    readonly leadingDetached: readonly string[];
    readonly leading: string | undefined;
    readonly trailing: string | undefined;
};
/**
 * Find the source code locations that match the given path.
 */
export declare function filterSourceCodeLocations(locations: readonly SourceCodeInfo_Location[], path: readonly number[]): SourceCodeInfo_Location[];
/**
 * Create the path to the source code location where the
 * given element was declared.
 *
 * Returns `undefined` if we don't know how to make the path.
 *
 * For example, the path [4, 0, 2, 3] points to the 4th field
 * of the first message of a .proto file:
 *
 * file
 *  .messageType // FileDescriptorProto.message_type = 3;
 *  [0] // first message
 *  .field // FileDescriptorProto.field = 2;
 *  [3] // 4th field
 *
 * See https://github.com/protocolbuffers/protobuf/blob/f1ce8663ac88df54cf212d29ce5123b69203b135/src/google/protobuf/descriptor.proto#L799
 */
export declare function makeSourceCodePath(parentProvider: DescriptorParentFn, descriptor: AnyDescriptorProto): number[] | undefined;
/**
 * Make a path from the parent to the immediate child.
 *
 * Returns `undefined` if we don't know how to make the path.
 */
export declare function makeSourceCodePathComponent(parent: AnyDescriptorProto, child: AnyDescriptorProto): readonly [number, number] | undefined;
export declare enum FileDescriptorProtoFields {
    syntax = 12,
    package = 2,
    message_type = 4,
    enum_type = 5,
    service = 6
}
export {};
