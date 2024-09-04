"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupCompiler = void 0;
const ts = require("typescript");
const path = require("path");
function setupCompiler(options, files, rootFileNames) {
    const original = ts.createCompilerHost(options, true), host = new VirtualCompilerHost(original, files), libs = options.lib ? options.lib.map(lib => require.resolve(`typescript/lib/lib.${lib.toLowerCase()}.d.ts`)) : [], roots = rootFileNames.concat(libs), program = ts.createProgram(roots, options, host);
    return [program, host];
}
exports.setupCompiler = setupCompiler;
class VirtualCompilerHost {
    constructor(wrapped, files) {
        this.wrapped = wrapped;
        this._sourceFiles = new Map();
        this._files = new Map();
        this._dirs = new Set();
        for (let vf of files) {
            // create map from path to file
            if (this._files.has(vf.getFilename())) {
                throw new Error('Duplicate file paths in virtual files: ' + vf.getFilename());
            }
            this._files.set(vf.getFilename(), vf);
            // create set of directory paths
            let path = vf.getFilename().split('/');
            while (path.length > 1) {
                path.pop();
                this._dirs.add(path.join('/'));
            }
        }
    }
    lookupVirtualFile(fileName) {
        let vf = this._files.get(fileName);
        if (vf)
            return vf;
        let cwd = process.cwd();
        if (fileName.startsWith(cwd)) {
            let relativePath = path.relative(cwd, fileName);
            vf = this._files.get(relativePath);
            if (vf)
                return vf;
            if (!relativePath.endsWith('.ts')) {
                relativePath = relativePath += '.ts';
                vf = this._files.get(relativePath);
                if (vf)
                    return vf;
            }
        }
        return undefined;
    }
    lookupVirtualDirectory(directoryName) {
        let cwd = process.cwd();
        if (directoryName.startsWith(cwd)) {
            let relativePath = path.relative(cwd, directoryName);
            return this._dirs.has(relativePath);
        }
        return false;
    }
    // noinspection JSUnusedGlobalSymbols
    getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile) {
        const vf = this.lookupVirtualFile(fileName);
        if (vf) {
            let sf = this._sourceFiles.get(vf);
            if (!sf) {
                this._sourceFiles.set(vf, sf = ts.createSourceFile(vf.getFilename(), vf.getContent(), ts.ScriptTarget.Latest));
            }
            return sf;
        }
        return this.wrapped.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    }
    // noinspection JSUnusedGlobalSymbols
    getDefaultLibFileName(options) {
        return this.wrapped.getDefaultLibFileName(options);
    }
    // noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
    writeFile(fileName, data, writeByteOrderMark, onError, sourceFiles) {
        // this.wrapped.writeFile(fileName, data, writeByteOrderMark, onError, sourceFiles);
    }
    // noinspection JSUnusedGlobalSymbols
    getCurrentDirectory() {
        return this.wrapped.getCurrentDirectory();
    }
    // noinspection JSUnusedGlobalSymbols
    getCanonicalFileName(fileName) {
        return this.wrapped.getCanonicalFileName(fileName);
    }
    // noinspection JSUnusedGlobalSymbols
    useCaseSensitiveFileNames() {
        return this.wrapped.useCaseSensitiveFileNames();
    }
    // noinspection JSUnusedGlobalSymbols
    getNewLine() {
        return this.wrapped.getNewLine();
    }
    // resolveModuleNames(moduleNames: string[], containingFile: string, reusedNames: string[], redirectedReference: ts.ResolvedProjectReference, options: ts.CompilerOptions): (ts.ResolvedModule | undefined)[] {
    // resolveTypeReferenceDirectives?(typeReferenceDirectiveNames: string[], containingFile: string, redirectedReference: ts.ResolvedProjectReference, options: ts.CompilerOptions): ts.ResolvedTypeReferenceDirective[] {
    // noinspection JSUnusedGlobalSymbols
    fileExists(fileName) {
        return !!this.lookupVirtualFile(fileName) || this.wrapped.fileExists(fileName);
    }
    // noinspection JSUnusedGlobalSymbols
    readFile(fileName) {
        const vf = this.lookupVirtualFile(fileName);
        if (vf)
            return vf.getContent();
        this.wrapped.readFile(fileName);
    }
    // noinspection JSUnusedGlobalSymbols
    directoryExists(directoryName) {
        if (this.lookupVirtualDirectory(directoryName))
            return true;
        const f = this.wrapped.directoryExists;
        if (!f)
            throw new Error('wrapped.directoryExists is undefined');
        return f(directoryName);
    }
    // noinspection JSUnusedGlobalSymbols
    getDirectories(path) {
        const f = this.wrapped.getDirectories;
        if (!f)
            throw new Error('wrapped.getDirectories is undefined');
        return f(path);
    }
}
