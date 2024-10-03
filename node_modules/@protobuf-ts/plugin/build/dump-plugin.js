"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DumpPlugin = void 0;
const fs_1 = require("fs");
const path = require("path");
const plugin_framework_1 = require("@protobuf-ts/plugin-framework");
const BIN_SUFFIX = '.codegenreq';
const JSON_SUFFIX = '.json';
const USAGE = `protoc-gen-dump can be run in 2 ways, depending on the given parameter (--dump_opt=<parameter>)
1) parameter ending in ${BIN_SUFFIX}
Dumps a 'CodeGeneratorRequest' in binary format. 
The request is dumped to the path specified by the parameter.
Example: 
    protoc --plugin node_modules/.bin/protoc-gen-dump --dump_opt my-dump.bin --dump_out . -I protos/ protos/*.proto

2) parameter ending in ${JSON_SUFFIX}
Dumps a 'CodeGeneratorRequest' in JSON format. 
The request is dumped to the path specified by the parameter.
Example:
    protoc --plugin node_modules/.bin/protoc-gen-dump --dump_opt my-dump.json --dump_out . -I protos/ protos/*.proto

`;
class DumpPlugin extends plugin_framework_1.PluginBase {
    constructor() {
        super(...arguments);
        // we support proto3-optionals, so we let protoc know
        this.getSupportedFeatures = () => [plugin_framework_1.CodeGeneratorResponse_Feature.PROTO3_OPTIONAL];
    }
    generate(request) {
        const parameter = request.parameter;
        if (parameter === null || parameter === void 0 ? void 0 : parameter.endsWith(JSON_SUFFIX)) {
            DumpPlugin.mkdir(parameter);
            fs_1.writeFileSync(parameter, plugin_framework_1.CodeGeneratorRequest.toJsonString(request, { prettySpaces: 2 }));
        }
        else if (parameter === null || parameter === void 0 ? void 0 : parameter.endsWith(BIN_SUFFIX)) {
            DumpPlugin.mkdir(parameter);
            let bytes = plugin_framework_1.CodeGeneratorRequest.toBinary(request);
            fs_1.writeFileSync(parameter, bytes);
            try {
                plugin_framework_1.CodeGeneratorRequest.fromBinary(bytes);
            }
            catch (e) {
                throw new Error("Sanity check failed: " + e);
            }
        }
        else {
            throw USAGE;
        }
        return [];
    }
    static mkdir(file) {
        if (!fs_1.existsSync(path.dirname(file))) {
            fs_1.mkdirSync(path.dirname(file), { recursive: true });
        }
    }
}
exports.DumpPlugin = DumpPlugin;
