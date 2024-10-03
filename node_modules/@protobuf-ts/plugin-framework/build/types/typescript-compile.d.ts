import * as ts from "typescript";
import { GeneratedFile } from "./generated-file";
export declare function setupCompiler(options: ts.CompilerOptions, files: GeneratedFile[], rootFileNames: string[]): [ts.Program, VirtualCompilerHost];
declare class VirtualCompilerHost implements ts.CompilerHost {
    private readonly wrapped;
    private readonly _sourceFiles;
    private readonly _files;
    private readonly _dirs;
    constructor(wrapped: ts.CompilerHost, files: readonly GeneratedFile[]);
    protected lookupVirtualFile(fileName: string): GeneratedFile | undefined;
    protected lookupVirtualDirectory(directoryName: string): boolean;
    getSourceFile(fileName: string, languageVersion: ts.ScriptTarget, onError?: (message: string) => void, shouldCreateNewSourceFile?: boolean): ts.SourceFile | undefined;
    getDefaultLibFileName(options: ts.CompilerOptions): string;
    writeFile(fileName: string, data: string, writeByteOrderMark: boolean, onError?: (message: string) => void, sourceFiles?: readonly ts.SourceFile[]): void;
    getCurrentDirectory(): string;
    getCanonicalFileName(fileName: string): string;
    useCaseSensitiveFileNames(): boolean;
    getNewLine(): string;
    fileExists(fileName: string): boolean;
    readFile(fileName: string): string | undefined;
    directoryExists(directoryName: string): boolean;
    getDirectories(path: string): string[];
}
export {};
