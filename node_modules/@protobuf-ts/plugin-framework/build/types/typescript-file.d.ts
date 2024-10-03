import * as ts from "typescript";
export declare class TypescriptFile {
    private sf;
    constructor(filename: string);
    getFilename(): string;
    /**
     * Add the new statement to the file.
     */
    addStatement(statement: ts.Statement, atTop?: boolean): void;
    /**
     * The underlying SourceFile
     */
    getSourceFile(): ts.SourceFile;
    /**
     * Are there any statements in this file?
     */
    isEmpty(): boolean;
    /**
     * The full content of this file.
     * Returns an empty string if there are no statements.
     */
    getContent(): string;
}
