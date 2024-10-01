"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptionResolver = exports.makeInternalOptions = exports.ServerStyle = exports.ClientStyle = exports.readOurServiceOptions = exports.readOurFileOptions = void 0;
/**
 * Custom file options interpreted by @protobuf-ts/plugin
 */
const rt = require("@protobuf-ts/runtime");
const plugin_framework_1 = require("@protobuf-ts/plugin-framework");
const ts = require("typescript");
/**
 * Read the custom file options declared in protobuf-ts.proto
 */
function readOurFileOptions(file) {
    return read(file.options, emptyFileOptions, OurFileOptions);
}
exports.readOurFileOptions = readOurFileOptions;
/**
 * Read the custom service options declared in protobuf-ts.proto
 */
function readOurServiceOptions(service) {
    return read(service.options, emptyServiceOptions, OurServiceOptions);
}
exports.readOurServiceOptions = readOurServiceOptions;
function read(options, defaults, type) {
    if (!options) {
        return defaults;
    }
    let unknownFields = rt.UnknownFieldHandler.list(options);
    if (!unknownFields.length) {
        return defaults;
    }
    // concat all unknown field data
    let unknownWriter = new rt.BinaryWriter();
    for (let { no, wireType, data } of unknownFields)
        unknownWriter.tag(no, wireType).raw(data);
    let unknownBytes = unknownWriter.finish();
    return type.fromBinary(unknownBytes, { readUnknownField: false });
}
const OurFileOptions = new rt.MessageType("$synthetic.OurFileOptions", [
    {
        no: 777701,
        name: "ts.exclude_options", localName: "ts.exclude_options", jsonName: "ts.exclude_options",
        kind: "scalar",
        T: rt.ScalarType.STRING,
        repeat: rt.RepeatType.PACKED
    }
]);
const OurServiceOptions = new rt.MessageType("$synthetic.OurServiceOptions", [
    {
        no: 777701,
        name: "ts.client", localName: "ts.client", jsonName: "ts.client",
        kind: "enum",
        T: () => ["ts.ClientStyle", ClientStyle],
        repeat: rt.RepeatType.UNPACKED,
    },
    {
        no: 777702,
        name: "ts.server", localName: "ts.server", jsonName: "ts.server",
        kind: "enum",
        T: () => ["ts.ServerStyle", ServerStyle],
        repeat: rt.RepeatType.UNPACKED,
    }
]);
/**
 * The available client styles from @protobuf-ts/plugin
 * The extensions are declared in protobuf-ts.proto
 */
var ClientStyle;
(function (ClientStyle) {
    /**
     * Do not emit a client for this service.
     */
    ClientStyle[ClientStyle["NO_CLIENT"] = 0] = "NO_CLIENT";
    /**
     * Use the call implementations of @protobuf-ts/runtime-rpc.
     * This is the default behaviour.
     */
    ClientStyle[ClientStyle["GENERIC_CLIENT"] = 1] = "GENERIC_CLIENT";
    /**
     * Generate a client using @grpc/grpc-js (major version 1).
     */
    ClientStyle[ClientStyle["GRPC1_CLIENT"] = 4] = "GRPC1_CLIENT";
})(ClientStyle = exports.ClientStyle || (exports.ClientStyle = {}));
/**
 * The available server styles from @protobuf-ts/plugin
 * The extensions are declared in protobuf-ts.proto
 */
var ServerStyle;
(function (ServerStyle) {
    /**
     * Do not emit a server for this service.
     * This is the default behaviour.
     */
    ServerStyle[ServerStyle["NO_SERVER"] = 0] = "NO_SERVER";
    /**
     * Generate a generic server interface.
     * Adapters be used to serve the service, for example @protobuf-ts/grpc-backend
     * for gRPC.
     */
    ServerStyle[ServerStyle["GENERIC_SERVER"] = 1] = "GENERIC_SERVER";
    /**
     * Generate a server for @grpc/grpc-js (major version 1).
     */
    ServerStyle[ServerStyle["GRPC1_SERVER"] = 2] = "GRPC1_SERVER";
})(ServerStyle = exports.ServerStyle || (exports.ServerStyle = {}));
const emptyFileOptions = OurFileOptions.create();
const emptyServiceOptions = OurServiceOptions.create();
function makeInternalOptions(params, pluginCredit) {
    const o = Object.assign({}, {
        generateDependencies: false,
        normalLongType: rt.LongType.BIGINT,
        normalOptimizeMode: plugin_framework_1.FileOptions_OptimizeMode.SPEED,
        forcedOptimizeMode: undefined,
        normalClientStyle: ClientStyle.GENERIC_CLIENT,
        forcedClientStyle: undefined,
        normalServerStyle: ServerStyle.NO_SERVER,
        forcedServerStyle: undefined,
        synthesizeEnumZeroValue: 'UNSPECIFIED$',
        oneofKindDiscriminator: 'oneofKind',
        runtimeRpcImportPath: '@protobuf-ts/runtime-rpc',
        runtimeImportPath: '@protobuf-ts/runtime',
        forceExcludeAllOptions: false,
        keepEnumPrefix: false,
        useProtoFieldName: false,
        tsNoCheck: false,
        esLintDisable: false,
        transpileTarget: undefined,
        transpileModule: ts.ModuleKind.ES2015,
        forceDisableServices: false,
        addPbSuffix: false,
    });
    if (pluginCredit) {
        o.pluginCredit = pluginCredit;
    }
    if (params === null || params === void 0 ? void 0 : params.generate_dependencies) {
        o.generateDependencies = true;
    }
    if (params === null || params === void 0 ? void 0 : params.force_exclude_all_options) {
        o.forceExcludeAllOptions = true;
    }
    if (params === null || params === void 0 ? void 0 : params.keep_enum_prefix) {
        o.keepEnumPrefix = true;
    }
    if (params === null || params === void 0 ? void 0 : params.use_proto_field_name) {
        o.useProtoFieldName = true;
    }
    if (params === null || params === void 0 ? void 0 : params.ts_nocheck) {
        o.tsNoCheck = true;
    }
    if (params === null || params === void 0 ? void 0 : params.eslint_disable) {
        o.esLintDisable = true;
    }
    if (params === null || params === void 0 ? void 0 : params.long_type_string) {
        o.normalLongType = rt.LongType.STRING;
    }
    if (params === null || params === void 0 ? void 0 : params.long_type_number) {
        o.normalLongType = rt.LongType.NUMBER;
    }
    if (params === null || params === void 0 ? void 0 : params.optimize_code_size) {
        o.normalOptimizeMode = plugin_framework_1.FileOptions_OptimizeMode.CODE_SIZE;
    }
    if (params === null || params === void 0 ? void 0 : params.force_optimize_speed) {
        o.forcedOptimizeMode = plugin_framework_1.FileOptions_OptimizeMode.SPEED;
    }
    if (params === null || params === void 0 ? void 0 : params.force_optimize_code_size) {
        o.forcedOptimizeMode = plugin_framework_1.FileOptions_OptimizeMode.CODE_SIZE;
    }
    if (params === null || params === void 0 ? void 0 : params.client_none) {
        o.normalClientStyle = ClientStyle.NO_CLIENT;
    }
    if (params === null || params === void 0 ? void 0 : params.client_grpc1) {
        o.normalClientStyle = ClientStyle.GRPC1_CLIENT;
    }
    if (params === null || params === void 0 ? void 0 : params.force_client_none) {
        o.forcedClientStyle = ClientStyle.NO_CLIENT;
    }
    if (params === null || params === void 0 ? void 0 : params.server_generic) {
        o.normalServerStyle = ServerStyle.GENERIC_SERVER;
    }
    if (params === null || params === void 0 ? void 0 : params.server_grpc1) {
        o.normalServerStyle = ServerStyle.GRPC1_SERVER;
    }
    if (params === null || params === void 0 ? void 0 : params.force_server_none) {
        o.forcedServerStyle = ServerStyle.NO_SERVER;
    }
    if (params === null || params === void 0 ? void 0 : params.add_pb_suffix) {
        o.addPbSuffix = true;
    }
    if (params === null || params === void 0 ? void 0 : params.force_disable_services) {
        o.forceDisableServices = true;
    }
    if (params === null || params === void 0 ? void 0 : params.output_javascript) {
        o.transpileTarget = ts.ScriptTarget.ES2020;
    }
    if (params === null || params === void 0 ? void 0 : params.output_javascript_es2015) {
        o.transpileTarget = ts.ScriptTarget.ES2015;
    }
    if (params === null || params === void 0 ? void 0 : params.output_javascript_es2016) {
        o.transpileTarget = ts.ScriptTarget.ES2016;
    }
    if (params === null || params === void 0 ? void 0 : params.output_javascript_es2017) {
        o.transpileTarget = ts.ScriptTarget.ES2017;
    }
    if (params === null || params === void 0 ? void 0 : params.output_javascript_es2018) {
        o.transpileTarget = ts.ScriptTarget.ES2018;
    }
    if (params === null || params === void 0 ? void 0 : params.output_javascript_es2019) {
        o.transpileTarget = ts.ScriptTarget.ES2019;
    }
    if (params === null || params === void 0 ? void 0 : params.output_javascript_es2020) {
        o.transpileTarget = ts.ScriptTarget.ES2020;
    }
    if (params === null || params === void 0 ? void 0 : params.output_legacy_commonjs) {
        o.transpileModule = ts.ModuleKind.CommonJS;
    }
    return o;
}
exports.makeInternalOptions = makeInternalOptions;
class OptionResolver {
    constructor(interpreter, stringFormat, options) {
        this.interpreter = interpreter;
        this.stringFormat = stringFormat;
        this.options = options;
    }
    getOptimizeMode(file) {
        var _a;
        if (this.options.forcedOptimizeMode !== undefined) {
            return this.options.forcedOptimizeMode;
        }
        if (((_a = file.options) === null || _a === void 0 ? void 0 : _a.optimizeFor) !== undefined) {
            return file.options.optimizeFor;
        }
        return this.options.normalOptimizeMode;
    }
    getClientStyles(descriptor) {
        const opt = this.interpreter.readOurServiceOptions(descriptor)["ts.client"];
        // always check service options valid
        if (opt.includes(ClientStyle.NO_CLIENT) && opt.some(s => s !== ClientStyle.NO_CLIENT)) {
            let err = new Error(`You provided invalid options for ${this.stringFormat.formatQualifiedName(descriptor, true)}. If you set (ts.client) = NO_CLIENT, you cannot set additional client styles.`);
            err.name = `PluginMessageError`;
            throw err;
        }
        if (this.options.forcedClientStyle !== undefined) {
            return [this.options.forcedClientStyle];
        }
        // look for service options
        if (opt.length) {
            return opt
                .filter(s => s !== ClientStyle.NO_CLIENT)
                .filter((value, index, array) => array.indexOf(value) === index);
        }
        // fall back to normal style set by option
        return [this.options.normalClientStyle];
    }
    getServerStyles(descriptor) {
        const opt = this.interpreter.readOurServiceOptions(descriptor)["ts.server"];
        // always check service options valid
        if (opt.includes(ServerStyle.NO_SERVER) && opt.some(s => s !== ServerStyle.NO_SERVER)) {
            let err = new Error(`You provided invalid options for ${this.stringFormat.formatQualifiedName(descriptor, true)}. If you set (ts.server) = NO_SERVER, you cannot set additional server styles.`);
            err.name = `PluginMessageError`;
            throw err;
        }
        if (this.options.forcedServerStyle !== undefined) {
            return [this.options.forcedServerStyle];
        }
        // look for service options
        if (opt.length) {
            return opt
                .filter(s => s !== ServerStyle.NO_SERVER)
                .filter((value, index, array) => array.indexOf(value) === index);
        }
        // fall back to normal style set by option
        return [this.options.normalServerStyle];
    }
}
exports.OptionResolver = OptionResolver;
