"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutFile = void 0;
const plugin_framework_1 = require("@protobuf-ts/plugin-framework");
/**
 * A protobuf-ts output file.
 */
class OutFile extends plugin_framework_1.TypescriptFile {
    constructor(name, fileDescriptor, registry, options) {
        super(name);
        this.fileDescriptor = fileDescriptor;
        this.registry = registry;
        this.options = options;
    }
    getContent() {
        if (this.isEmpty()) {
            return "";
        }
        return this.getHeader() + super.getContent();
    }
    getHeader() {
        if (this.isEmpty()) {
            return "";
        }
        if (!this.header) {
            this.header = this.makeHeader();
        }
        return this.header;
    }
    makeHeader() {
        var _a;
        let props = [];
        if (this.fileDescriptor.package) {
            props.push('package "' + this.fileDescriptor.package + '"');
        }
        props.push('syntax ' + ((_a = this.fileDescriptor.syntax) !== null && _a !== void 0 ? _a : 'proto2'));
        const header = [];
        if (this.options.esLintDisable) {
            header.push(`/* eslint-disable */`);
        }
        header.push(...[
            `// @generated ${this.options.pluginCredit}`,
            `// @generated from protobuf file "${this.fileDescriptor.name}" (${props.join(', ')})`,
            `// tslint:disable`
        ]);
        if (this.options.tsNoCheck) {
            header.push(`// @ts-nocheck`);
        }
        if (this.registry.isExplicitlyDeclaredDeprecated(this.fileDescriptor)) {
            header.push('// @deprecated');
        }
        [
            ...this.registry.sourceCodeComments(this.fileDescriptor, plugin_framework_1.FileDescriptorProtoFields.syntax).leadingDetached,
            ...this.registry.sourceCodeComments(this.fileDescriptor, plugin_framework_1.FileDescriptorProtoFields.package).leadingDetached
        ].every(block => header.push('//', ...block.split('\n').map(l => '//' + l), '//'));
        let head = header.join('\n');
        if (head.length > 0 && !head.endsWith('\n')) {
            head += '\n';
        }
        return head;
    }
}
exports.OutFile = OutFile;
