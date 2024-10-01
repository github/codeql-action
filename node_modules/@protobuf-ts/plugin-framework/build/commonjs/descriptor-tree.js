"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.visitDescriptorTree = exports.DescriptorTree = void 0;
const descriptor_1 = require("./google/protobuf/descriptor");
const descriptor_info_1 = require("./descriptor-info");
const runtime_1 = require("@protobuf-ts/runtime");
class DescriptorTree {
    constructor(descriptors, options) {
        const descriptorMap = new Map();
        const optionMap = new Map();
        const files = [];
        for (const [descriptor, info] of descriptors) {
            // infos
            runtime_1.assert(!descriptorMap.has(descriptor));
            descriptorMap.set(descriptor, info);
            // files
            if (descriptor_1.FileDescriptorProto.is(descriptor)) {
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
        runtime_1.assert(v !== undefined);
        return v.ancestors.concat();
    }
    fileOf(descriptor) {
        const v = this._descriptors.get(descriptor);
        runtime_1.assert(v !== undefined);
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
        runtime_1.assert(descriptor_1.FileDescriptorProto.is(descriptorOrOptions));
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
                    if (descriptor_info_1.isAnyTypeDescriptorProto(descriptor)) {
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
                if (descriptor_info_1.isAnyTypeDescriptorProto(descriptor)) {
                    b(descriptor);
                }
            });
        }
    }
}
exports.DescriptorTree = DescriptorTree;
/**
 * Visit all logical children of the given descriptor proto.
 *
 * The "visitor" function is called for each element,
 * including the input. It receives two arguments:
 * 1) the current descriptor proto
 * 2) the ancestors of the current descriptor proto (an array of descriptors)
 */
function visitDescriptorTree(input, visitor) {
    visitWithCarry(input, [], visitor);
}
exports.visitDescriptorTree = visitDescriptorTree;
function visitWithCarry(input, carry, visitor) {
    visitor(input, carry);
    carry = carry.concat(input);
    // noinspection SuspiciousTypeOfGuard
    if (descriptor_1.EnumDescriptorProto.is(input)) {
        for (const val of input.value) {
            visitWithCarry(val, carry, visitor);
        }
    }
    else if (descriptor_1.DescriptorProto.is(input)) {
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
    else if (descriptor_1.FileDescriptorProto.is(input)) {
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
    else if (descriptor_1.ServiceDescriptorProto.is(input)) {
        for (const method of input.method) {
            visitWithCarry(method, carry, visitor);
        }
    }
    else if (descriptor_1.EnumValueDescriptorProto.is(input)) {
        //
    }
    else if (descriptor_1.FieldDescriptorProto.is(input)) {
        //
    }
    else if (descriptor_1.MethodDescriptorProto.is(input)) {
        //
    }
    else if (descriptor_1.OneofDescriptorProto.is(input)) {
        //
    }
    else {
        runtime_1.assertNever(input);
    }
}
