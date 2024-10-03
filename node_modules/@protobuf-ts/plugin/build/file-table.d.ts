import { FileDescriptorProto } from "@protobuf-ts/plugin-framework";
export declare class FileTable {
    private readonly entries;
    private readonly clashResolveMaxTries;
    private readonly clashResolver;
    constructor(clashResolver?: ClashResolver);
    register(requestedName: string, descriptor: FileDescriptorProto, kind?: string): string;
    protected hasName: (name: string) => boolean;
    /**
     * Find a symbol (of the given kind) for the given descriptor.
     * Return `undefined` if not found.
     */
    find(descriptor: FileDescriptorProto, kind?: string): FileTableEntry | undefined;
    /**
     * Find a symbol (of the given kind) for the given descriptor.
     * Raises error if not found.
     */
    get(descriptor: FileDescriptorProto, kind?: string): FileTableEntry;
    /**
     * Is a name (of the given kind) registered for the the given descriptor?
     */
    has(descriptor: FileDescriptorProto, kind?: string): boolean;
    static defaultClashResolver(descriptor: FileDescriptorProto, requestedName: string, kind: string, tryCount: number): string;
}
interface FileTableEntry {
    descriptor: FileDescriptorProto;
    name: string;
    kind: string;
}
declare type ClashResolver = (descriptor: FileDescriptorProto, requestedName: string, kind: string, tryCount: number, failedName: string) => string;
export {};
