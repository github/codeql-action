var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { CodeGeneratorRequest, CodeGeneratorResponse, CodeGeneratorResponse_File } from "./google/protobuf/compiler/plugin";
import { types } from "util";
import { PbULong } from "@protobuf-ts/runtime";
/**
 * Base class for a protobuf plugin.
 *
 * Implement the abstract `generate()` method to create a plugin.
 * The method takes a `CodeGeneratorRequest` and returns an
 * array of `GeneratedFile` or a promise thereof.
 *
 *
 * Usage:
 *
 *   #!/usr/bin/env node
 *   const {MyPlugin} = require( ... );
 *   new MyPlugin.run().catch(_ => {
 *     process.stderr.write('failed to run plugin');
 *     process.exit(1);
 *   });
 *
 * Reads a `CodeGeneratorRequest` created by `protoc` from stdin,
 * passes it to the plugin-function and writes a
 * `CodeGeneratorResponse` to stdout.
 *
 *
 * Options:
 *
 * Use the `parseOptions()` method the parse the parameter
 * of a `CodeGeneratorRequest` to a map of flags. Options are
 * validated and usage is generated on error.
 *
 *
 * Error handling:
 *
 * `generate()` may raise an error, reject it's promise or
 * return an `GeneratedFile` with an attached error.
 *
 * Throwing `new Error("hello")` will result in the output:
 *
 *   $ protoc --xx_out=/tmp -I protos protos/*
 *   --xx_out: Error: hello
 *       at /path/to/your-plugin.js:69
 *       ...
 *
 *
 */
export class PluginBase {
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let response, bytes = yield this.readBytes(process.stdin), request = CodeGeneratorRequest.fromBinary(bytes);
                try {
                    const files = yield this.generate(request);
                    response = this.createResponse(files);
                }
                catch (error) {
                    response = CodeGeneratorResponse.create({
                        error: this.errorToString(error)
                    });
                }
                this.setBlockingStdout();
                process.stdout.write(CodeGeneratorResponse.toBinary(response));
            }
            catch (error) {
                process.stderr.write('Plugin failed to read CodeGeneratorRequest from stdin or write CodeGeneratorResponse to stdout.\n');
                process.stderr.write(this.errorToString(error));
                process.stderr.write('\n');
                process.exit(1);
            }
        });
    }
    getSupportedFeatures() {
        return [];
    }
    parseOptions(spec, parameter) {
        var _a, _b, _c, _d;
        this.validateOptionsSpec(spec);
        let given = parameter ? parameter.split(',') : [];
        let known = Object.keys(spec);
        let excess = given.filter(i => !known.includes(i));
        if (excess.length > 0) {
            this.throwOptionError(spec, `Option "${excess.join('", "')}" not recognized.`);
        }
        for (let [key, val] of Object.entries(spec)) {
            if (given.includes(key)) {
                let missing = (_b = (_a = val.requires) === null || _a === void 0 ? void 0 : _a.filter(i => !given.includes(i))) !== null && _b !== void 0 ? _b : [];
                if (missing.length > 0) {
                    this.throwOptionError(spec, `Option "${key}" requires option "${missing.join('", "')}" to be set.`);
                }
                let excess = (_d = (_c = val.excludes) === null || _c === void 0 ? void 0 : _c.filter(i => given.includes(i))) !== null && _d !== void 0 ? _d : [];
                if (excess.length > 0) {
                    this.throwOptionError(spec, `If option "${key}" is set, option "${excess.join('", "')}" cannot be set.`);
                }
            }
        }
        let resolved = {};
        for (let key of Object.keys(spec)) {
            resolved[key] = given.includes(key);
        }
        return resolved;
    }
    throwOptionError(spec, error) {
        let text = '';
        text += error + '\n';
        text += `\n`;
        text += `Available options:\n`;
        text += `\n`;
        for (let [key, val] of Object.entries(spec)) {
            text += `- "${key}"\n`;
            for (let l of val.description.split('\n')) {
                text += `  ${l}\n`;
            }
            text += `\n`;
        }
        let err = new Error(text);
        err.name = `ParameterError`;
        throw err;
    }
    validateOptionsSpec(spec) {
        var _a, _b;
        let known = Object.keys(spec);
        for (let [key, { excludes, requires }] of Object.entries(spec)) {
            let r = (_a = requires === null || requires === void 0 ? void 0 : requires.filter(i => !known.includes(i))) !== null && _a !== void 0 ? _a : [];
            if (r.length > 0) {
                throw new Error(`Invalid parameter spec for parameter "${key}". "requires" points to unknown parameters: ${r.join(', ')}`);
            }
            let e = (_b = excludes === null || excludes === void 0 ? void 0 : excludes.filter(i => !known.includes(i))) !== null && _b !== void 0 ? _b : [];
            if (e.length > 0) {
                throw new Error(`Invalid parameter spec for parameter "${key}". "excludes" points to unknown parameters: ${e.join(', ')}`);
            }
        }
    }
    readBytes(stream) {
        return new Promise(resolve => {
            const chunks = [];
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => {
                resolve(Buffer.concat(chunks));
            });
        });
    }
    createResponse(files) {
        // we have to respond with an xor of all of our supported features.
        // we should be working on a ulong here, but we cannot rely on bigint support.
        let feat = 0;
        for (let f of this.getSupportedFeatures()) {
            feat = feat ^ f;
        }
        return CodeGeneratorResponse.create({
            file: files
                .map(f => CodeGeneratorResponse_File.create({
                name: f.getFilename(),
                content: f.getContent()
            }))
                .filter(f => f.content && f.content.length > 0),
            supportedFeatures: PbULong.from(feat).toString()
        });
    }
    errorToString(error) {
        var _a;
        if (error && typeof error.name == 'string' && error.name == 'ParameterError') {
            return error.name + '\n\n' + error.message;
        }
        if (error && typeof error.name == 'string' && error.name == 'PluginMessageError') {
            return error.message;
        }
        if (types.isNativeError(error)) {
            return (_a = error.stack) !== null && _a !== void 0 ? _a : error.toString();
        }
        let text;
        try {
            text = error.toString();
        }
        catch (e) {
            text = 'unknown error';
        }
        return text;
    }
    setBlockingStdout() {
        // Fixes https://github.com/timostamm/protobuf-ts/issues/134
        // Node is buffering chunks to stdout, meaning that for big generated
        // files the CodeGeneratorResponse will not reach protoc completely.
        // To fix this, we set stdout to block using the internal private
        // method setBlocking(true)
        const stdoutHandle = process.stdout._handle;
        if (stdoutHandle) {
            stdoutHandle.setBlocking(true);
        }
    }
}
