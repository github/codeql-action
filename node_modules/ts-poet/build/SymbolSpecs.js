"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = __importDefault(require("lodash"));
const path_1 = __importDefault(require("path"));
const Node_1 = require("./Node");
const fileNamePattern = '(?:[a-zA-Z0-9._-]+)';
const modulePattern = `@?(?:(?:${fileNamePattern}(?:/${fileNamePattern})*))`;
const identPattern = `(?:(?:[a-zA-Z][_a-zA-Z0-9.]*)|(?:[_a-zA-Z][_a-zA-Z0-9.]+))`;
exports.importType = '[*@+=]';
const importPattern = `^(${identPattern})?(${exports.importType})(${modulePattern})(?:#(${identPattern}))?`;
/**
 * Specifies a symbol and its related origin, either via import or implicit/local declaration.
 *
 * @param value Value of the symbol
 */
class SymbolSpec extends Node_1.Node {
    constructor(value) {
        super();
        this.value = value;
    }
    /**
     * Parses a symbol reference pattern to create a symbol. The pattern
     * allows the simple definition of all symbol types including any possible
     * import variation. If the spec to parse does not follow the proper format
     * an implicit symbol is created from the unparsed spec.
     *
     * Pattern: `symbolName? importType modulePath (#<augmentedSymbolName>)?`
     *
     * Where:
     *
     * - `symbolName` is any legal JS/TS symbol. If none, we use the last part of the module path as a guess.
     * - `importType` is one of `@` or `*` or `+`, where:
     *    - `@` is a named import
     *       - `Foo@bar` becomes `import { Foo } from 'bar'`
     *    - `*` is a star import,
     *       - `*Foo` becomes `import * as Foo from 'Foo'`
     *       - `Foo*foo` becomes `import * as Foo from 'foo'`
     *    - `+` is an implicit import
     *       - E.g. `Foo+foo` becomes `import 'foo'`
     * - `modulePath` is a path
     *    - E.g. `<filename>(/<filename)*`
     * - augmentedSymbolName = `[a-zA-Z0-9_]+`
     *
     *        Any valid symbol name that represents the symbol that is being augmented. For example,
     *        the import `rxjs/add/observable/from` attaches the `from` method to the `Observable` class.
     *        To import it correctly the spec should be `+rxjs/add/observable/from#Observable`. Adding this
     *        parameter to augmented imports ensures they are output only when the symbol being augmented
     *        is actually used.
     *
     *
     * @param spec Symbol spec to parse.
     * @return Parsed symbol specification
     */
    static from(spec) {
        const matched = spec.match(importPattern);
        if (matched != null) {
            const modulePath = matched[3];
            const type = matched[2] || '@';
            const symbolName = matched[1] || lodash_1.default.last(modulePath.split('/')) || '';
            const targetName = matched[4];
            switch (type) {
                case '*':
                    return SymbolSpecs.importsAll(symbolName, modulePath);
                case '@':
                    return SymbolSpecs.importsName(symbolName, modulePath);
                case '=':
                    return SymbolSpecs.importsDefault(symbolName, modulePath);
                case '+':
                    return targetName
                        ? SymbolSpecs.augmented(symbolName, modulePath, targetName)
                        : SymbolSpecs.sideEffect(symbolName, modulePath);
                default:
                    throw new Error('Invalid type character');
            }
        }
        return SymbolSpecs.implicit(spec);
    }
    static fromMaybeString(spec) {
        return typeof spec === 'string' ? SymbolSpec.from(spec) : spec;
    }
    toCodeString() {
        return this.value;
    }
    get childNodes() {
        return [];
    }
}
exports.SymbolSpec = SymbolSpec;
class SymbolSpecs {
    /**
     * Creates an import of all the modules exported symbols as a single
     * local named symbol
     *
     * e.g. `import * as Engine from 'templates';`
     *
     * @param localName The local name of the imported symbols
     * @param from The module to import the symbols from
     */
    static importsAll(localName, from) {
        return new ImportsAll(localName, from);
    }
    /**
     * Creates an import of a single named symbol from the module's exported
     * symbols.
     *
     * e.g. `import { Engine } from 'templates';`
     *
     * @param exportedName The symbol that is both exported and imported
     * @param from The module the symbol is exported from
     */
    static importsName(exportedName, from) {
        return new ImportsName(exportedName, from);
    }
    /**
     * Creates a symbol that is brought in by a whole module import
     * that "augments" an existing symbol.
     *
     * e.g. `import 'rxjs/add/operator/flatMap'`
     *
     * @param symbolName The augmented symbol to be imported
     * @param from The entire import that does the augmentation
     * @param target The symbol that is augmented
     */
    static augmented(symbolName, from, target) {
        return new Augmented(symbolName, from, target);
    }
    /**
     * Creates a symbol that is brought in as a side effect of
     * an import.
     *
     * e.g. `import 'mocha'`
     *
     * @param symbolName The symbol to be imported
     * @param from The entire import that does the augmentation
     */
    static sideEffect(symbolName, from) {
        return new SideEffect(symbolName, from);
    }
    /**
     * An implied symbol that does no tracking of imports
     *
     * @param name The implicit symbol name
     */
    static implicit(name) {
        return new Implicit(name);
    }
    /**
     * Creates an import of a single named symbol from the module's exported
     * default.
     *
     * e.g. `import Engine from 'engine';`
     *
     * @param exportedName The symbol that is both exported and imported
     * @param from The module the symbol is exported from
     */
    static importsDefault(exportedName, from) {
        return new ImportsDefault(exportedName, from);
    }
}
exports.SymbolSpecs = SymbolSpecs;
/**
 * Non-imported symbol
 */
class Implicit extends SymbolSpec {
    constructor(value) {
        super(value);
        this.source = undefined;
    }
}
exports.Implicit = Implicit;
/** Common base class for imported symbols. */
class Imported extends SymbolSpec {
    /** The value is the imported symbol, i.e. `BarClass`, and source is the path it comes from. */
    constructor(value, source) {
        super(source);
        this.value = value;
        this.source = source;
    }
}
exports.Imported = Imported;
/**
 * Imports a single named symbol from the module's exported
 * symbols.
 *
 * E.g.:
 *
 * `import { Engine } from 'templates'` or
 * `import { Engine as Engine2 } from 'templates'`
 */
class ImportsName extends Imported {
    /**
     * @param value
     * @param source
     * @param sourceValue is the optional original value, i.e if we're renaming the symbol it is `Engine`
     */
    constructor(value, source, sourceValue) {
        super(value, source);
        this.sourceValue = sourceValue;
    }
    toImportPiece() {
        return this.sourceValue ? `${this.sourceValue} as ${this.value}` : this.value;
    }
}
exports.ImportsName = ImportsName;
/**
 * Imports a single named symbol from the module's exported
 * default.
 *
 * e.g. `import Engine from 'engine';`
 */
class ImportsDefault extends Imported {
    constructor(value, source) {
        super(value, source);
    }
}
exports.ImportsDefault = ImportsDefault;
/**
 * Imports all of the modules exported symbols as a single
 * named symbol
 *
 * e.g. `import * as Engine from 'templates';`
 */
class ImportsAll extends Imported {
    constructor(value, source) {
        super(value, source);
    }
}
exports.ImportsAll = ImportsAll;
/**
 * A symbol that is brought in by a whole module import
 * that "augments" an existing symbol.
 *
 * e.g. `import 'rxjs/add/operator/flatMap'`
 */
class Augmented extends Imported {
    constructor(value, source, augmented) {
        super(value, source);
        this.augmented = augmented;
    }
}
exports.Augmented = Augmented;
/**
 * A symbol that is brought in as a side effect of an
 * import.
 *
 * E.g. `from("Foo+mocha")` will add `import 'mocha'`
 */
class SideEffect extends Imported {
    constructor(value, source) {
        super(value, source);
    }
}
exports.SideEffect = SideEffect;
/** Generates the `import ...` lines for the given `imports`. */
function emitImports(imports, ourModulePath) {
    if (imports.length == 0) {
        return '';
    }
    let result = '';
    const augmentImports = lodash_1.default.groupBy(filterInstances(imports, Augmented), (a) => a.augmented);
    // Group the imports by source module they're imported from
    const importsByModule = lodash_1.default.groupBy(imports.filter((it) => it.source !== undefined &&
        !(it instanceof ImportsName && it.definedIn && sameModule(it.definedIn, ourModulePath))), (it) => it.source);
    // Output each source module as one line
    Object.entries(importsByModule).forEach(([modulePath, imports]) => {
        // Skip imports from the current module
        if (sameModule(ourModulePath, modulePath)) {
            return;
        }
        const importPath = maybeRelativePath(ourModulePath, modulePath);
        // Output star imports individually
        filterInstances(imports, ImportsAll).forEach((i) => {
            result += `import * as ${i.value} from '${importPath}';\n`;
            const augments = augmentImports[i.value];
            if (augments) {
                augments.forEach((augment) => (result += `import '${augment.source}';\n`));
            }
        });
        // Output named imports as a group
        const names = unique(filterInstances(imports, ImportsName).map((it) => it.toImportPiece()));
        const def = unique(filterInstances(imports, ImportsDefault).map((it) => it.value));
        if (names.length > 0 || def.length > 0) {
            const namesPart = names.length > 0 ? [`{ ${names.join(', ')} }`] : [];
            const defPart = def.length > 0 ? [def[0]] : [];
            const allNames = [...defPart, ...namesPart];
            result += `import ${allNames.join(', ')} from '${importPath}';\n`;
            [...names, ...def].forEach((name) => {
                const augments = augmentImports[name];
                if (augments) {
                    augments.forEach((augment) => (result += `import '${augment.source}';\n`));
                }
            });
        }
    });
    const sideEffectImports = lodash_1.default.groupBy(filterInstances(imports, SideEffect), (a) => a.source);
    Object.keys(sideEffectImports).forEach((it) => (result += `import '${it}';\n`));
    return result;
}
exports.emitImports = emitImports;
function filterInstances(list, t) {
    return list.filter((e) => e instanceof t);
}
function unique(list) {
    return [...new Set(list)];
}
function maybeRelativePath(outputPath, importPath) {
    if (!importPath.startsWith('./')) {
        return importPath;
    }
    // Drop the `./` prefix from the outputPath if it exists.
    const basePath = outputPath.replace(/^.\//, '');
    // Ideally we'd use a path library to do all this.
    const numberOfDirs = basePath.split('').filter((l) => l === '/').length;
    if (numberOfDirs === 0) {
        return importPath;
    }
    // Make an array of `..` to get our importPath to the root directory.
    const a = new Array(numberOfDirs);
    const prefix = a.fill('..', 0, numberOfDirs).join('/');
    return prefix + importPath.substring(1);
}
exports.maybeRelativePath = maybeRelativePath;
/** Checks if `path1 === path2` despite minor path differences like `./foo` and `foo`. */
function sameModule(path1, path2) {
    return path1 === path2 || path_1.default.resolve(path1) === path_1.default.resolve(path2);
}
exports.sameModule = sameModule;
