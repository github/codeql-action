import { GeneratedFile } from "./generated-file";
import { SymbolTable } from "./symbol-table";
import { AnyTypeDescriptorProto } from "./descriptor-info";
import { TypescriptFile } from "./typescript-file";
/** @deprecated */
export declare class TypescriptImportManager {
    private readonly file;
    private readonly symbols;
    private readonly source;
    constructor(generatedFile: GeneratedFile, symbols: SymbolTable, source: TypescriptFile);
    /**
     * Import {importName} from "importFrom";
     *
     * Automatically finds a free name if the
     * `importName` would collide with another
     * identifier.
     *
     * Returns imported name.
     */
    name(importName: string, importFrom: string): string;
    /**
     * Import * as importAs from "importFrom";
     *
     * Returns name for `importAs`.
     */
    namespace(importAs: string, importFrom: string): string;
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
    type(descriptor: AnyTypeDescriptorProto, kind?: string): string;
}
