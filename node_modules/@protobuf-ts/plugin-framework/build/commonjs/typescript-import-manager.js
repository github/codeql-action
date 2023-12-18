"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypescriptImportManager = void 0;
const runtime_1 = require("@protobuf-ts/runtime");
const ts = require("typescript");
const path = require("path");
/** @deprecated */
class TypescriptImportManager {
    constructor(generatedFile, symbols, source) {
        this.file = generatedFile;
        this.symbols = symbols;
        this.source = source;
    }
    /**
     * Import {importName} from "importFrom";
     *
     * Automatically finds a free name if the
     * `importName` would collide with another
     * identifier.
     *
     * Returns imported name.
     */
    name(importName, importFrom) {
        const blackListedNames = this.symbols.list(this.file).map(e => e.name);
        return ensureNamedImportPresent(this.source.getSourceFile(), importName, importFrom, blackListedNames, statementToAdd => this.source.addStatement(statementToAdd, true));
    }
    /**
     * Import * as importAs from "importFrom";
     *
     * Returns name for `importAs`.
     */
    namespace(importAs, importFrom) {
        return ensureNamespaceImportPresent(this.source.getSourceFile(), importAs, importFrom, statementToAdd => this.source.addStatement(statementToAdd, true));
    }
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
    type(descriptor, kind = 'default') {
        const symbolReg = this.symbols.get(descriptor, kind);
        // symbol in this file?
        if (symbolReg.file === this.file) {
            return symbolReg.name;
        }
        // symbol not in file
        // add an import statement
        const importPath = createRelativeImportPath(this.source.getSourceFile().fileName, symbolReg.file.getFilename());
        const blackListedNames = this.symbols.list(this.file).map(e => e.name);
        return ensureNamedImportPresent(this.source.getSourceFile(), symbolReg.name, importPath, blackListedNames, statementToAdd => this.source.addStatement(statementToAdd, true));
    }
}
exports.TypescriptImportManager = TypescriptImportManager;
/**
 * Import * as asName from "importFrom";
 *
 * If the import is already present, just return the
 * identifier.
 *
 * If the import is not present, create the import
 * statement and call `addStatementFn`.
 *
 * Does *not* check for collisions.
 */
function ensureNamespaceImportPresent(currentFile, asName, importFrom, addStatementFn) {
    const all = findNamespaceImports(currentFile), match = all.find(ni => ni.as === asName && ni.from === importFrom);
    if (match) {
        return match.as;
    }
    const statementToAdd = createNamespaceImport(asName, importFrom);
    addStatementFn(statementToAdd);
    return asName;
}
/**
 * import * as <asName> from "<importFrom>";
 */
function createNamespaceImport(asName, importFrom) {
    return ts.createImportDeclaration(undefined, undefined, ts.createImportClause(undefined, ts.createNamespaceImport(ts.createIdentifier(asName))), ts.createStringLiteral(importFrom));
}
/**
 * import * as <as> from "<from>";
 */
function findNamespaceImports(sourceFile) {
    let r = [];
    for (let s of sourceFile.statements) {
        if (ts.isImportDeclaration(s) && s.importClause) {
            let namedBindings = s.importClause.namedBindings;
            if (namedBindings && ts.isNamespaceImport(namedBindings)) {
                runtime_1.assert(ts.isStringLiteral(s.moduleSpecifier));
                r.push({
                    as: namedBindings.name.escapedText.toString(),
                    from: s.moduleSpecifier.text
                });
            }
        }
    }
    return r;
}
/**
 * Import {importName} from "importFrom";
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
function ensureNamedImportPresent(currentFile, importName, importFrom, blacklistedNames, addStatementFn, escapeCharacter = '$') {
    var _a;
    const all = findNamedImports(currentFile), taken = all.map(ni => { var _a; return (_a = ni.as) !== null && _a !== void 0 ? _a : ni.name; }).concat(blacklistedNames), match = all.find(ni => ni.name === importName && ni.from === importFrom);
    if (match) {
        return (_a = match.as) !== null && _a !== void 0 ? _a : match.name;
    }
    let as;
    if (taken.includes(importName)) {
        let i = 0;
        as = importName;
        while (taken.includes(as)) {
            as = importName + escapeCharacter;
            if (i++ > 0) {
                as += i;
            }
        }
    }
    const statementToAdd = createNamedImport(importName, importFrom, as);
    addStatementFn(statementToAdd);
    return as !== null && as !== void 0 ? as : importName;
}
/**
 * import {<name>} from '<from>';
 * import {<name> as <as>} from '<from>';
 */
function createNamedImport(name, from, as) {
    if (as) {
        return ts.createImportDeclaration(undefined, undefined, ts.createImportClause(undefined, ts.createNamedImports([ts.createImportSpecifier(ts.createIdentifier(name), ts.createIdentifier(as))]), false), ts.createStringLiteral(from));
    }
    return ts.createImportDeclaration(undefined, undefined, ts.createImportClause(undefined, ts.createNamedImports([
        ts.createImportSpecifier(undefined, ts.createIdentifier(name))
    ])), ts.createStringLiteral(from));
}
/**
 * import {<name>} from '<from>';
 * import {<name> as <as>} from '<from>';
 */
function findNamedImports(sourceFile) {
    let r = [];
    for (let s of sourceFile.statements) {
        if (ts.isImportDeclaration(s) && s.importClause) {
            let namedBindings = s.importClause.namedBindings;
            if (namedBindings && ts.isNamedImports(namedBindings)) {
                for (let importSpecifier of namedBindings.elements) {
                    runtime_1.assert(ts.isStringLiteral(s.moduleSpecifier));
                    if (importSpecifier.propertyName) {
                        r.push({
                            name: importSpecifier.propertyName.escapedText.toString(),
                            as: importSpecifier.name.escapedText.toString(),
                            from: s.moduleSpecifier.text
                        });
                    }
                    else {
                        r.push({
                            name: importSpecifier.name.escapedText.toString(),
                            as: undefined,
                            from: s.moduleSpecifier.text
                        });
                    }
                }
            }
        }
    }
    return r;
}
/**
 * Create a relative path for an import statement like
 * `import {Foo} from "./foo"`
 */
function createRelativeImportPath(currentPath, pathToImportFrom) {
    // create relative path to the file to import
    let fromPath = path.relative(path.dirname(currentPath), pathToImportFrom);
    // on windows, this may add backslash directory separators.
    // we replace them with forward slash.
    if (path.sep !== "/") {
        fromPath = fromPath.split(path.sep).join("/");
    }
    // drop file extension
    fromPath = fromPath.replace(/\.[a-z]+$/, '');
    // make sure to start with './' to signal relative path to module resolution
    if (!fromPath.startsWith('../') && !fromPath.startsWith('./')) {
        fromPath = './' + fromPath;
    }
    return fromPath;
}
