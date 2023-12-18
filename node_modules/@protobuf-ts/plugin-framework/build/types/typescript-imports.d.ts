import * as ts from "typescript";
import { SymbolTable } from "./symbol-table";
import { AnyTypeDescriptorProto } from "./descriptor-info";
import { TypescriptFile } from "./typescript-file";
export declare class TypeScriptImports {
    private readonly symbols;
    constructor(symbols: SymbolTable);
    /**
     * Import {importName} from "importFrom";
     *
     * Automatically finds a free name if the
     * `importName` would collide with another
     * identifier.
     *
     * Returns imported name.
     */
    name(source: TypescriptFile, importName: string, importFrom: string, isTypeOnly?: boolean): string;
    /**
     * Import * as importAs from "importFrom";
     *
     * Returns name for `importAs`.
     */
    namespace(source: TypescriptFile, importAs: string, importFrom: string, isTypeOnly?: boolean): string;
    /**
     * Import a previously registered identifier for a message
     * or other descriptor.
     *
     * Uses the symbol table to look for the type, adds an
     * import statement if necessary and automatically finds a
     * free name if the identifier would clash in this file.
     *
     * If you have multiple representations for a descriptor
     * in your generated code, use `kind` to discriminate.
     */
    type(source: TypescriptFile, descriptor: AnyTypeDescriptorProto, kind?: string, isTypeOnly?: boolean): string;
}
/**
 * import {importName} from "importFrom";
 * import type {importName} from "importFrom";
 *
 * If the import is already present, just return the
 * identifier.
 *
 * If the import is not present, create the import
 * statement and call `addStatementFn`.
 *
 * If the import name is taken by another named import
 * or is in the list of blacklisted names, an
 * alternative name is used:
 *
 * Import {importName as alternativeName} from "importFrom";
 *
 * Returns the imported name or the alternative name.
 */
export declare function ensureNamedImportPresent(currentFile: ts.SourceFile, importName: string, importFrom: string, isTypeOnly: boolean, blacklistedNames: string[], addStatementFn: (statementToAdd: ts.ImportDeclaration) => void, escapeCharacter?: string): string;
/**
 * import {<name>} from '<from>';
 * import {<name> as <as>} from '<from>';
 * import type {<name>} from '<from>';
 * import type {<name> as <as>} from '<from>';
 */
export declare function createNamedImport(name: string, from: string, as?: string, isTypeOnly?: boolean): ts.ImportDeclaration;
/**
 * import {<name>} from '<from>';
 * import {<name> as <as>} from '<from>';
 * import type {<name>} from '<from>';
 * import type {<name> as <as>} from '<from>';
 */
export declare function findNamedImports(sourceFile: ts.SourceFile): {
    name: string;
    as: string | undefined;
    from: string;
    isTypeOnly: boolean;
}[];
