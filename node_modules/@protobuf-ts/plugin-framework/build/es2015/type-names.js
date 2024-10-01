import { isAnyTypeDescriptorProto } from "./descriptor-info";
import { FileDescriptorProto } from "./google/protobuf/descriptor";
import { assert } from "@protobuf-ts/runtime";
export class TypeNameLookup {
    constructor(data) {
        const names = new Map();
        const reverse = new Map();
        for (let { descriptor, ancestors } of data) {
            let name = composeTypeName([...ancestors, descriptor]);
            assert(!names.has(name));
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
                if (!isAnyTypeDescriptorProto(descriptor)) {
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
            assert(false);
        }
        return new TypeNameLookup(data);
    }
    normalizeTypeName(typeName) {
        return typeName.startsWith(".") ? typeName.substring(1) : typeName;
    }
    resolveTypeName(typeName) {
        typeName = this.normalizeTypeName(typeName);
        const d = this._names.get(typeName);
        assert(d !== undefined, `Unable to resolve type name "${typeName}"`);
        return d;
    }
    peekTypeName(typeName) {
        typeName = this.normalizeTypeName(typeName);
        return this._names.get(typeName);
    }
    makeTypeName(descriptor) {
        const n = this._reverse.get(descriptor);
        assert(n !== undefined);
        return n;
    }
}
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
    assert(descriptors.length > 0);
    const parts = [], mid = descriptors.concat(), first = mid.shift(), last = mid.pop();
    assert(FileDescriptorProto.is(first));
    assert(isAnyTypeDescriptorProto(last), "expected any type descriptor, got: " + typeof (last));
    const pkg = first.package;
    if (pkg !== undefined && pkg !== '') {
        parts.push(pkg);
    }
    for (const item of [...mid, last]) {
        let part = item.name;
        assert(part !== undefined);
        parts.push(part);
    }
    return parts.join('.');
}
