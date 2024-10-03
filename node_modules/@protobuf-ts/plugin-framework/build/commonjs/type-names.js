"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeNameLookup = void 0;
const descriptor_info_1 = require("./descriptor-info");
const descriptor_1 = require("./google/protobuf/descriptor");
const runtime_1 = require("@protobuf-ts/runtime");
class TypeNameLookup {
    constructor(data) {
        const names = new Map();
        const reverse = new Map();
        for (let { descriptor, ancestors } of data) {
            let name = composeTypeName([...ancestors, descriptor]);
            runtime_1.assert(!names.has(name));
            names.set(name, descriptor);
            reverse.set(descriptor, name);
        }
        this._names = names;
        this._reverse = reverse;
    }
    static from(a, b) {
        let data = [];
        if (Array.isArray(a) && b) {
            for (let descriptor of a) {
                if (!descriptor_info_1.isAnyTypeDescriptorProto(descriptor)) {
                    continue;
                }
                let ancestors = [];
                let p = b(descriptor);
                while (p) {
                    ancestors.unshift(p);
                    p = b(descriptor);
                }
                data.push({ descriptor, ancestors });
            }
        }
        else if (!Array.isArray(a) && !b) {
            a.visitTypes(descriptor => {
                data.push({ descriptor, ancestors: a.ancestorsOf(descriptor) });
            });
        }
        else {
            runtime_1.assert(false);
        }
        return new TypeNameLookup(data);
    }
    normalizeTypeName(typeName) {
        return typeName.startsWith(".") ? typeName.substring(1) : typeName;
    }
    resolveTypeName(typeName) {
        typeName = this.normalizeTypeName(typeName);
        const d = this._names.get(typeName);
        runtime_1.assert(d !== undefined, `Unable to resolve type name "${typeName}"`);
        return d;
    }
    peekTypeName(typeName) {
        typeName = this.normalizeTypeName(typeName);
        return this._names.get(typeName);
    }
    makeTypeName(descriptor) {
        const n = this._reverse.get(descriptor);
        runtime_1.assert(n !== undefined);
        return n;
    }
}
exports.TypeNameLookup = TypeNameLookup;
/**
 * Compose a fully qualified type name for enum,
 * message or service.
 *
 * Example:
 *   my_package.MyMessage.MyNestedMessage
 *
 * Throws if given array is invalid.
 */
function composeTypeName(descriptors) {
    runtime_1.assert(descriptors.length > 0);
    const parts = [], mid = descriptors.concat(), first = mid.shift(), last = mid.pop();
    runtime_1.assert(descriptor_1.FileDescriptorProto.is(first));
    runtime_1.assert(descriptor_info_1.isAnyTypeDescriptorProto(last), "expected any type descriptor, got: " + typeof (last));
    const pkg = first.package;
    if (pkg !== undefined && pkg !== '') {
        parts.push(pkg);
    }
    for (const item of [...mid, last]) {
        let part = item.name;
        runtime_1.assert(part !== undefined);
        parts.push(part);
    }
    return parts.join('.');
}
