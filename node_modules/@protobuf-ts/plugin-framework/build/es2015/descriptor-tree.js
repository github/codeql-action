import { DescriptorProto, EnumDescriptorProto, EnumValueDescriptorProto, FieldDescriptorProto, FileDescriptorProto, MethodDescriptorProto, OneofDescriptorProto, ServiceDescriptorProto } from "./google/protobuf/descriptor";
import { isAnyTypeDescriptorProto } from "./descriptor-info";
import { assert, assertNever } from "@protobuf-ts/runtime";
export class DescriptorTree {
    constructor(descriptors, options) {
        const descriptorMap = new Map();
        const optionMap = new Map();
        const files = [];
        for (const [descriptor, info] of descriptors) {
            // infos
            assert(!descriptorMap.has(descriptor));
            descriptorMap.set(descriptor, info);
            // files
            if (FileDescriptorProto.is(descriptor)) {
                files.push(descriptor);
            }
        }
        for (const [option, descriptor] of options) {
            optionMap.set(option, descriptor);
        }
        this._files = files;
        this._descriptors = descriptorMap;
        this._options = optionMap;
    }
    /**
     * Create the tree from a list of root files.
     */
    static from(...files) {
        const descriptors = [];
        const options = [];
        for (const file of files) {
            visitDescriptorTree(file, (descriptor, ancestors) => {
                descriptors.push([descriptor, { ancestors, file, parent: ancestors[ancestors.length - 1] }]);
                if (descriptor.options) {
                    options.push([descriptor.options, descriptor]);
                }
            });
        }
        return new DescriptorTree(descriptors, options);
    }
    ancestorsOf(descriptor) {
        const v = this._descriptors.get(descriptor);
        assert(v !== undefined);
        return v.ancestors.concat();
    }
    fileOf(descriptor) {
        const v = this._descriptors.get(descriptor);
        assert(v !== undefined);
        return v.file;
    }
    allFiles() {
        return this._files;
    }
    parentOf(descriptorOrOptions) {
        const optionParent = this._options.get(descriptorOrOptions);
        if (optionParent) {
            return optionParent;
        }
        const descriptorEntry = this._descriptors.get(descriptorOrOptions);
        if (descriptorEntry) {
            return descriptorEntry.parent;
        }
        assert(FileDescriptorProto.is(descriptorOrOptions));
        return undefined;
    }
    visit(a, b) {
        if (b === undefined) {
            for (const file of this._files) {
                visitDescriptorTree(file, a);
            }
        }
        else {
            const startingFrom = a;
            visitDescriptorTree(startingFrom, descriptor => {
                if (descriptor === a) {
                    return; // visitDescriptorTree invokes on starting element. ignore.
                }
                b(descriptor);
            });
        }
    }
    visitTypes(a, b) {
        if (b === undefined) {
            for (const file of this._files) {
                visitDescriptorTree(file, descriptor => {
                    if (isAnyTypeDescriptorProto(descriptor)) {
                        a(descriptor);
                    }
                });
            }
        }
        else {
            visitDescriptorTree(a, descriptor => {
                if (descriptor === a) {
                    return; // visitDescriptorTree invokes on starting element. ignore.
                }
                if (isAnyTypeDescriptorProto(descriptor)) {
                    b(descriptor);
                }
            });
        }
    }
}
/**
 * Visit all logical children of the given descriptor proto.
 *
 * The "visitor" function is called for each element,
 * including the input. It receives two arguments:
 * 1) the current descriptor proto
 * 2) the ancestors of the current descriptor proto (an array of descriptors)
 */
export function visitDescriptorTree(input, visitor) {
    visitWithCarry(input, [], visitor);
}
function visitWithCarry(input, carry, visitor) {
    visitor(input, carry);
    carry = carry.concat(input);
    // noinspection SuspiciousTypeOfGuard
    if (EnumDescriptorProto.is(input)) {
        for (const val of input.value) {
            visitWithCarry(val, carry, visitor);
        }
    }
    else if (DescriptorProto.is(input)) {
        for (const oneof of input.oneofDecl) {
            visitWithCarry(oneof, carry, visitor);
        }
        for (const field of input.field) {
            visitWithCarry(field, carry, visitor);
        }
        for (const message of input.nestedType) {
            visitWithCarry(message, carry, visitor);
        }
        for (const enu of input.enumType) {
            visitWithCarry(enu, carry, visitor);
        }
        for (const extensionField of input.extension) {
            visitWithCarry(extensionField, carry, visitor);
        }
    }
    else if (FileDescriptorProto.is(input)) {
        for (const message of input.messageType) {
            visitWithCarry(message, carry, visitor);
        }
        for (const enu of input.enumType) {
            visitWithCarry(enu, carry, visitor);
        }
        for (const service of input.service) {
            visitWithCarry(service, carry, visitor);
        }
        for (const extensionField of input.extension) {
            visitWithCarry(extensionField, carry, visitor);
        }
    }
    else if (ServiceDescriptorProto.is(input)) {
        for (const method of input.method) {
            visitWithCarry(method, carry, visitor);
        }
    }
    else if (EnumValueDescriptorProto.is(input)) {
        //
    }
    else if (FieldDescriptorProto.is(input)) {
        //
    }
    else if (MethodDescriptorProto.is(input)) {
        //
    }
    else if (OneofDescriptorProto.is(input)) {
        //
    }
    else {
        assertNever(input);
    }
}
