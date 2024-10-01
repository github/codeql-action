"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeneratorBase = void 0;
class GeneratorBase {
    constructor(symbols, registry, imports, comments, interpreter) {
        this.symbols = symbols;
        this.registry = registry;
        this.imports = imports;
        this.comments = comments;
        this.interpreter = interpreter;
    }
}
exports.GeneratorBase = GeneratorBase;
