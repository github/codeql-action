"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileTable = void 0;
const plugin_framework_1 = require("@protobuf-ts/plugin-framework");
class FileTable {
    constructor(clashResolver) {
        this.entries = [];
        this.clashResolveMaxTries = 100;
        this.hasName = (name) => this.entries.some(e => e.name === name);
        this.clashResolver = clashResolver !== null && clashResolver !== void 0 ? clashResolver : FileTable.defaultClashResolver;
    }
    register(requestedName, descriptor, kind = 'default') {
        // Only one symbol per kind can be registered for a descriptor.
        if (this.has(descriptor, kind)) {
            let { name } = this.get(descriptor, kind);
            let msg = `Cannot register name "${requestedName}" of kind "${kind}" for ${plugin_framework_1.StringFormat.formatName(descriptor)}. `
                + `The descriptor is already registered with name "${name}". `
                + `Use a different 'kind' to register multiple symbols for a descriptor.`;
            throw new Error(msg);
        }
        // find a free name within the file
        let name = requestedName;
        let count = 0;
        while (this.hasName(name) && count < this.clashResolveMaxTries) {
            name = this.clashResolver(descriptor, requestedName, kind, ++count, name);
        }
        if (this.hasName(name)) {
            let msg = `Failed to register name "${requestedName}" for ${plugin_framework_1.StringFormat.formatName(descriptor)}. `
                + `Gave up finding alternative name after ${this.clashResolveMaxTries} tries. `
                + `There is something wrong with the clash resolver.`;
            throw new Error(msg);
        }
        // add the entry and return name
        this.entries.push({ descriptor, kind, name });
        return name;
    }
    /**
     * Find a symbol (of the given kind) for the given descriptor.
     * Return `undefined` if not found.
     */
    find(descriptor, kind = 'default') {
        return this.entries.find(e => e.descriptor === descriptor && e.kind === kind);
    }
    /**
     * Find a symbol (of the given kind) for the given descriptor.
     * Raises error if not found.
     */
    get(descriptor, kind = 'default') {
        const found = this.find(descriptor, kind);
        if (!found) {
            let msg = `Failed to find name for ${plugin_framework_1.StringFormat.formatName(descriptor)} of kind "${kind}". `
                + `Searched in ${this.entries.length} files.`;
            throw new Error(msg);
        }
        return found;
    }
    /**
     * Is a name (of the given kind) registered for the the given descriptor?
     */
    has(descriptor, kind = 'default') {
        return !!this.find(descriptor, kind);
    }
    static defaultClashResolver(descriptor, requestedName, kind, tryCount) {
        const lastDotI = requestedName.lastIndexOf('.');
        let basename = lastDotI > 0 ? requestedName.substring(0, lastDotI) : requestedName;
        const suffix = lastDotI > 0 ? requestedName.substring(lastDotI) : '';
        basename = basename.endsWith('$') ? basename.substring(1) : basename;
        basename = basename + '$' + tryCount;
        return basename + suffix;
    }
}
exports.FileTable = FileTable;
