import { DescriptorProto, EnumOptions, EnumValueDescriptorProto, EnumValueOptions, FieldDescriptorProto, FieldOptions, FileDescriptorProto, FileOptions, MessageOptions, MethodDescriptorProto, MethodOptions, OneofDescriptorProto, OneofOptions, ServiceDescriptorProto, ServiceOptions } from "./google/protobuf/descriptor";
import { AnyDescriptorProto, AnyTypeDescriptorProto } from "./descriptor-info";
/**
 * Return the logical parent of the given descriptor.
 *
 * If there is no parent, return `undefined`. This should
 * only be the case for `FileDescriptorProto`.
 */
export declare type DescriptorParentFn = (descriptor: AnyDescriptorProto) => AnyDescriptorProto | undefined;
/**
 * Can lookup the ancestry of a descriptor.
 */
export interface IDescriptorTree {
    /**
     * Lists known files.
     */
    allFiles(): readonly FileDescriptorProto[];
    /**
     * Return the immediate parent of the given descriptor.
     *
     * Returns `undefined` for a file descriptor.
     *
     * Returns the parent descriptor for an option.
     */
    parentOf(descriptor: FieldDescriptorProto): DescriptorProto;
    parentOf(descriptor: AnyDescriptorProto): AnyDescriptorProto | undefined;
    parentOf(options: FileOptions): FileDescriptorProto;
    parentOf(options: MessageOptions): DescriptorProto;
    parentOf(options: FieldOptions): FileDescriptorProto;
    parentOf(options: OneofOptions): OneofDescriptorProto;
    parentOf(options: EnumOptions): FieldDescriptorProto;
    parentOf(options: EnumValueOptions): EnumValueDescriptorProto;
    parentOf(options: ServiceOptions): ServiceDescriptorProto;
    parentOf(options: MethodOptions): MethodDescriptorProto;
    /**
     * Return the file where the descriptor was declared.
     *
     * If a file descriptor is passed, returns the
     * file descriptor itself.
     */
    fileOf(descriptor: AnyDescriptorProto): FileDescriptorProto;
    /**
     * Returns all ancestors of the given descriptor, up to
     * the file descriptor where the descriptor was declared.
     */
    ancestorsOf(descriptor: AnyDescriptorProto): AnyDescriptorProto[];
    /**
     * Visit all known descriptors and all their descendants.
     */
    visit(visitor: (descriptor: AnyDescriptorProto) => void): void;
    /**
     * Visit all descendants of the given descriptor.
     */
    visit(startingFrom: AnyDescriptorProto, visitor: (descriptor: AnyDescriptorProto) => void): void;
    /**
     * Visit all known type descriptors and their
     * descendant types.
     */
    visitTypes(visitor: (descriptor: AnyTypeDescriptorProto) => void): void;
    /**
     * Visit the type children of the descriptor
     * and their descendant types.
     */
    visitTypes(startingFrom: AnyDescriptorProto, visitor: (descriptor: AnyTypeDescriptorProto) => void): void;
}
export declare class DescriptorTree implements IDescriptorTree {
    private readonly _files;
    private readonly _descriptors;
    private readonly _options;
    /**
     * Create the tree from a list of root files.
     */
    static from(...files: FileDescriptorProto[]): DescriptorTree;
    private constructor();
    ancestorsOf(descriptor: AnyDescriptorProto): AnyDescriptorProto[];
    fileOf(descriptor: AnyDescriptorProto): FileDescriptorProto;
    allFiles(): readonly FileDescriptorProto[];
    parentOf(descriptor: FieldDescriptorProto): DescriptorProto;
    parentOf(descriptor: AnyDescriptorProto): AnyDescriptorProto | undefined;
    parentOf(options: FileOptions): FileDescriptorProto;
    parentOf(options: MessageOptions): DescriptorProto;
    parentOf(options: FieldOptions): FileDescriptorProto;
    parentOf(options: OneofOptions): OneofDescriptorProto;
    parentOf(options: EnumOptions): FieldDescriptorProto;
    parentOf(options: EnumValueOptions): EnumValueDescriptorProto;
    parentOf(options: ServiceOptions): ServiceDescriptorProto;
    parentOf(options: MethodOptions): MethodDescriptorProto;
    visit(visitor: (descriptor: AnyDescriptorProto) => void): void;
    visit(startingFrom: AnyDescriptorProto, visitor: (descriptor: AnyDescriptorProto) => void): void;
    visitTypes(visitor: (descriptor: AnyTypeDescriptorProto) => void): void;
    visitTypes(startingFrom: AnyDescriptorProto, visitor: (descriptor: AnyTypeDescriptorProto) => void): void;
}
declare type VisitorFn = (descriptor: AnyDescriptorProto, carry: readonly AnyDescriptorProto[]) => void;
/**
 * Visit all logical children of the given descriptor proto.
 *
 * The "visitor" function is called for each element,
 * including the input. It receives two arguments:
 * 1) the current descriptor proto
 * 2) the ancestors of the current descriptor proto (an array of descriptors)
 */
export declare function visitDescriptorTree(input: AnyDescriptorProto, visitor: VisitorFn): void;
export {};
