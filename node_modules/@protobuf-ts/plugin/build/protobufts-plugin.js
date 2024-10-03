"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtobuftsPlugin = void 0;
const plugin_framework_1 = require("@protobuf-ts/plugin-framework");
const out_file_1 = require("./out-file");
const local_type_name_1 = require("./code-gen/local-type-name");
const interpreter_1 = require("./interpreter");
const our_options_1 = require("./our-options");
const service_server_generator_grpc_1 = require("./code-gen/service-server-generator-grpc");
const comment_generator_1 = require("./code-gen/comment-generator");
const message_interface_generator_1 = require("./code-gen/message-interface-generator");
const message_type_generator_1 = require("./code-gen/message-type-generator");
const enum_generator_1 = require("./code-gen/enum-generator");
const service_type_generator_1 = require("./code-gen/service-type-generator");
const service_client_generator_generic_1 = require("./code-gen/service-client-generator-generic");
const file_table_1 = require("./file-table");
const service_server_generator_generic_1 = require("./code-gen/service-server-generator-generic");
const service_client_generator_grpc_1 = require("./code-gen/service-client-generator-grpc");
const ts = require("typescript");
const runtime_1 = require("@protobuf-ts/runtime");
const well_known_types_1 = require("./message-type-extensions/well-known-types");
class ProtobuftsPlugin extends plugin_framework_1.PluginBase {
    constructor(version) {
        super();
        this.version = version;
        this.parameters = {
            // @formatter:off
            // long type
            long_type_string: {
                description: "Sets jstype = JS_STRING for message fields with 64 bit integral values. \n" +
                    "The default behaviour is to use native `bigint`. \n" +
                    "Only applies to fields that do *not* use the option `jstype`.",
                excludes: ["long_type_number", "long_type_bigint"],
            },
            long_type_number: {
                description: "Sets jstype = JS_NUMBER for message fields with 64 bit integral values. \n" +
                    "The default behaviour is to use native `bigint`. \n" +
                    "Only applies to fields that do *not* use the option `jstype`.",
                excludes: ["long_type_string", "long_type_bigint"],
            },
            long_type_bigint: {
                description: "Sets jstype = JS_NORMAL for message fields with 64 bit integral values. \n" +
                    "This is the default behavior. \n" +
                    "Only applies to fields that do *not* use the option `jstype`.",
                excludes: ["long_type_string", "long_type_number"],
            },
            // misc
            generate_dependencies: {
                description: "By default, only the PROTO_FILES passed as input to protoc are generated, \n" +
                    "not the files they import (with the exception of well-known types, which are \n" +
                    "always generated when imported). \n" +
                    "Set this option to generate code for dependencies too.",
            },
            force_exclude_all_options: {
                description: "By default, custom options are included in the metadata and can be blacklisted \n" +
                    "with our option (ts.exclude_options). Set this option if you are certain you \n" +
                    "do not want to include any options at all.",
            },
            keep_enum_prefix: {
                description: "By default, if all enum values share a prefix that corresponds with the enum's \n" +
                    "name, the prefix is dropped from the value names. Set this option to disable \n" +
                    "this behavior.",
            },
            use_proto_field_name: {
                description: "By default interface fields use lowerCamelCase names by transforming proto field\n" +
                    "names to follow common style convention for TypeScript. Set this option to preserve\n" +
                    "original proto field names in generated interfaces.",
            },
            ts_nocheck: {
                description: "Generate a @ts-nocheck annotation at the top of each file. This will become the \n" +
                    "default behaviour in the next major release.",
                excludes: ['disable_ts_nocheck'],
            },
            disable_ts_nocheck: {
                description: "Do not generate a @ts-nocheck annotation at the top of each file. Since this is \n" +
                    "the default behaviour, this option has no effect.",
                excludes: ['ts_nocheck'],
            },
            eslint_disable: {
                description: "Generate a eslint-disable comment at the top of each file. This will become the \n" +
                    "default behaviour in the next major release.",
                excludes: ['no_eslint_disable'],
            },
            no_eslint_disable: {
                description: "Do not generate a eslint-disable comment at the top of each file. Since this is \n" +
                    "the default behaviour, this option has no effect.",
                excludes: ['eslint_disable'],
            },
            add_pb_suffix: {
                description: "Adds the suffix `_pb` to the names of all generated files. This will become the \n" +
                    "default behaviour in the next major release.",
            },
            // output types
            output_typescript: {
                description: "Output TypeScript files. This is the default behavior.",
                excludes: ["output_javascript", "output_javascript_es2015", "output_javascript_es2016", "output_javascript_es2017", "output_javascript_es2018", "output_javascript_es2019", "output_javascript_es2020"]
            },
            output_javascript: {
                description: "Output JavaScript for the currently recommended target ES2020. The target may \n" +
                    "change with a major release of protobuf-ts. \n" +
                    "Along with JavaScript files, this always outputs TypeScript declaration files.",
                excludes: ["output_typescript", "output_javascript_es2015", "output_javascript_es2016", "output_javascript_es2017", "output_javascript_es2018", "output_javascript_es2019", "output_javascript_es2020"]
            },
            output_javascript_es2015: {
                description: "Output JavaScript for the ES2015 target.",
                excludes: ["output_typescript", "output_javascript_es2016", "output_javascript_es2017", "output_javascript_es2018", "output_javascript_es2019", "output_javascript_es2020"]
            },
            output_javascript_es2016: {
                description: "Output JavaScript for the ES2016 target.",
                excludes: ["output_typescript", "output_javascript_es2015", "output_javascript_es2017", "output_javascript_es2018", "output_javascript_es2019", "output_javascript_es2020"]
            },
            output_javascript_es2017: {
                description: "Output JavaScript for the ES2017 target.",
                excludes: ["output_typescript", "output_javascript_es2015", "output_javascript_es2016", "output_javascript_es2018", "output_javascript_es2019", "output_javascript_es2020"]
            },
            output_javascript_es2018: {
                description: "Output JavaScript for the ES2018 target.",
                excludes: ["output_typescript", "output_javascript_es2015", "output_javascript_es2016", "output_javascript_es2017", "output_javascript_es2019", "output_javascript_es2020"]
            },
            output_javascript_es2019: {
                description: "Output JavaScript for the ES2019 target.",
                excludes: ["output_typescript", "output_javascript_es2015", "output_javascript_es2016", "output_javascript_es2017", "output_javascript_es2018", "output_javascript_es2020"]
            },
            output_javascript_es2020: {
                description: "Output JavaScript for the ES2020 target.",
                excludes: ["output_typescript", "output_javascript_es2015", "output_javascript_es2016", "output_javascript_es2017", "output_javascript_es2018", "output_javascript_es2019"]
            },
            output_legacy_commonjs: {
                description: "Use CommonJS instead of the default ECMAScript module system.",
                excludes: ["output_typescript"]
            },
            // client
            client_none: {
                description: "Do not generate rpc clients. \n" +
                    "Only applies to services that do *not* use the option `ts.client`. \n" +
                    "If you do not want rpc clients at all, use `force_client_none`.",
                excludes: ['client_generic', 'client_grpc1'],
            },
            client_generic: {
                description: "Only applies to services that do *not* use the option `ts.client`. \n" +
                    "Since GENERIC_CLIENT is the default, this option has no effect.",
                excludes: ['client_none', 'client_grpc1', 'force_client_none', 'force_disable_services'],
            },
            client_grpc1: {
                description: "Generate a client using @grpc/grpc-js (major version 1). \n" +
                    "Only applies to services that do *not* use the option `ts.client`.",
                excludes: ['client_none', 'client_generic', 'force_client_none', 'force_disable_services'],
            },
            force_client_none: {
                description: "Do not generate rpc clients, ignore options in proto files.",
                excludes: ['client_none', 'client_generic', 'client_grpc1'],
            },
            // server
            server_none: {
                description: "Do not generate rpc servers. \n" +
                    "This is the default behaviour, but only applies to services that do \n" +
                    "*not* use the option `ts.server`. \n" +
                    "If you do not want servers at all, use `force_server_none`.",
                excludes: ['server_grpc1'],
            },
            server_generic: {
                description: "Generate a generic server interface. Adapters are used to serve the service, \n" +
                    "for example @protobuf-ts/grpc-backend for gRPC. \n" +
                    "Note that this is an experimental feature and may change with a minor release. \n" +
                    "Only applies to services that do *not* use the option `ts.server`.",
                excludes: ['server_none', 'force_server_none', 'force_disable_services'],
            },
            server_grpc1: {
                description: "Generate a server interface and definition for use with @grpc/grpc-js \n" +
                    "(major version 1). \n" +
                    "Only applies to services that do *not* use the option `ts.server`.",
                excludes: ['server_none', 'force_server_none', 'force_disable_services'],
            },
            force_server_none: {
                description: "Do not generate rpc servers, ignore options in proto files.",
            },
            force_disable_services: {
                description: "Do not generate anything for service definitions, and ignore options in proto \n" +
                    "files. This is the same as setting both options `force_server_none` and \n" +
                    "`force_client_none`, but also stops generating service metadata.",
                excludes: ['client_generic', 'client_grpc1', 'server_generic', 'server_grpc1']
            },
            // optimization
            optimize_speed: {
                description: "Sets optimize_for = SPEED for proto files that have no file option \n" +
                    "'option optimize_for'. Since SPEED is the default, this option has no effect.",
                excludes: ['force_optimize_speed'],
            },
            optimize_code_size: {
                description: "Sets optimize_for = CODE_SIZE for proto files that have no file option \n" +
                    "'option optimize_for'.",
                excludes: ['force_optimize_speed'],
            },
            force_optimize_code_size: {
                description: "Forces optimize_for = CODE_SIZE for all proto files, ignore file options.",
                excludes: ['optimize_code_size', 'force_optimize_speed']
            },
            force_optimize_speed: {
                description: "Forces optimize_for = SPEED for all proto files, ignore file options.",
                excludes: ['optimize_code_size', 'force_optimize_code_size']
            },
        };
        // we support proto3-optionals, so we let protoc know
        this.getSupportedFeatures = () => [plugin_framework_1.CodeGeneratorResponse_Feature.PROTO3_OPTIONAL];
        this.version = version;
    }
    generate(request) {
        const options = our_options_1.makeInternalOptions(this.parseOptions(this.parameters, request.parameter), `by protobuf-ts ${this.version}` + (request.parameter ? ` with parameter ${request.parameter}` : '')), registry = plugin_framework_1.DescriptorRegistry.createFrom(request), symbols = new plugin_framework_1.SymbolTable(), fileTable = new file_table_1.FileTable(), imports = new plugin_framework_1.TypeScriptImports(symbols), comments = new comment_generator_1.CommentGenerator(registry), interpreter = new interpreter_1.Interpreter(registry, options), optionResolver = new our_options_1.OptionResolver(interpreter, registry, options), genMessageInterface = new message_interface_generator_1.MessageInterfaceGenerator(symbols, registry, imports, comments, interpreter, options), genEnum = new enum_generator_1.EnumGenerator(symbols, registry, imports, comments, interpreter, options), genMessageType = new message_type_generator_1.MessageTypeGenerator(symbols, registry, imports, comments, interpreter, options), genServiceType = new service_type_generator_1.ServiceTypeGenerator(symbols, registry, imports, comments, interpreter, options), genServerGeneric = new service_server_generator_generic_1.ServiceServerGeneratorGeneric(symbols, registry, imports, comments, interpreter, options), genServerGrpc = new service_server_generator_grpc_1.ServiceServerGeneratorGrpc(symbols, registry, imports, comments, interpreter, options), genClientGeneric = new service_client_generator_generic_1.ServiceClientGeneratorGeneric(symbols, registry, imports, comments, interpreter, options), genClientGrpc = new service_client_generator_grpc_1.ServiceClientGeneratorGrpc(symbols, registry, imports, comments, interpreter, options);
        let tsFiles = [];
        // ensure unique file names
        for (let fileDescriptor of registry.allFiles()) {
            const base = fileDescriptor.name.replace('.proto', '') + (options.addPbSuffix ? "_pb" : "");
            fileTable.register(base + '.ts', fileDescriptor);
        }
        for (let fileDescriptor of registry.allFiles()) {
            const base = fileDescriptor.name.replace('.proto', '') + (options.addPbSuffix ? "_pb" : "");
            fileTable.register(base + '.server.ts', fileDescriptor, 'generic-server');
            fileTable.register(base + '.grpc-server.ts', fileDescriptor, 'grpc1-server');
            fileTable.register(base + '.client.ts', fileDescriptor, 'client');
            fileTable.register(base + '.promise-client.ts', fileDescriptor, 'promise-client');
            fileTable.register(base + '.rx-client.ts', fileDescriptor, 'rx-client');
            fileTable.register(base + '.grpc-client.ts', fileDescriptor, 'grpc1-client');
        }
        for (let fileDescriptor of registry.allFiles()) {
            const outMain = new out_file_1.OutFile(fileTable.get(fileDescriptor).name, fileDescriptor, registry, options), outServerGeneric = new out_file_1.OutFile(fileTable.get(fileDescriptor, 'generic-server').name, fileDescriptor, registry, options), outServerGrpc = new out_file_1.OutFile(fileTable.get(fileDescriptor, 'grpc1-server').name, fileDescriptor, registry, options), outClientCall = new out_file_1.OutFile(fileTable.get(fileDescriptor, 'client').name, fileDescriptor, registry, options), outClientPromise = new out_file_1.OutFile(fileTable.get(fileDescriptor, 'promise-client').name, fileDescriptor, registry, options), outClientRx = new out_file_1.OutFile(fileTable.get(fileDescriptor, 'rx-client').name, fileDescriptor, registry, options), outClientGrpc = new out_file_1.OutFile(fileTable.get(fileDescriptor, 'grpc1-client').name, fileDescriptor, registry, options);
            tsFiles.push(outMain, outServerGeneric, outServerGrpc, outClientCall, outClientPromise, outClientRx, outClientGrpc);
            registry.visitTypes(fileDescriptor, descriptor => {
                // we are not interested in synthetic types like map entry messages
                if (registry.isSyntheticElement(descriptor))
                    return;
                // register all symbols, regardless whether they are going to be used - we want stable behaviour
                symbols.register(local_type_name_1.createLocalTypeName(descriptor, registry), descriptor, outMain);
                if (plugin_framework_1.ServiceDescriptorProto.is(descriptor)) {
                    genClientGeneric.registerSymbols(outClientCall, descriptor);
                    genClientGrpc.registerSymbols(outClientGrpc, descriptor);
                    genServerGeneric.registerSymbols(outServerGeneric, descriptor);
                    genServerGrpc.registerSymbols(outServerGrpc, descriptor);
                }
            });
            registry.visitTypes(fileDescriptor, descriptor => {
                // we are not interested in synthetic types like map entry messages
                if (registry.isSyntheticElement(descriptor))
                    return;
                if (plugin_framework_1.DescriptorProto.is(descriptor)) {
                    genMessageInterface.generateMessageInterface(outMain, descriptor);
                }
                if (plugin_framework_1.EnumDescriptorProto.is(descriptor)) {
                    genEnum.generateEnum(outMain, descriptor);
                }
            });
            registry.visitTypes(fileDescriptor, descriptor => {
                // still not interested in synthetic types like map entry messages
                if (registry.isSyntheticElement(descriptor))
                    return;
                if (plugin_framework_1.DescriptorProto.is(descriptor)) {
                    genMessageType.generateMessageType(outMain, descriptor, optionResolver.getOptimizeMode(fileDescriptor));
                }
                if (!options.forceDisableServices) {
                    if (plugin_framework_1.ServiceDescriptorProto.is(descriptor)) {
                        // service type
                        genServiceType.generateServiceType(outMain, descriptor);
                        // clients
                        const clientStyles = optionResolver.getClientStyles(descriptor);
                        if (clientStyles.includes(our_options_1.ClientStyle.GENERIC_CLIENT)) {
                            genClientGeneric.generateInterface(outClientCall, descriptor);
                            genClientGeneric.generateImplementationClass(outClientCall, descriptor);
                        }
                        if (clientStyles.includes(our_options_1.ClientStyle.GRPC1_CLIENT)) {
                            genClientGrpc.generateInterface(outClientGrpc, descriptor);
                            genClientGrpc.generateImplementationClass(outClientGrpc, descriptor);
                        }
                        // servers
                        const serverStyles = optionResolver.getServerStyles(descriptor);
                        if (serverStyles.includes(our_options_1.ServerStyle.GENERIC_SERVER)) {
                            genServerGeneric.generateInterface(outServerGeneric, descriptor);
                        }
                        if (serverStyles.includes(our_options_1.ServerStyle.GRPC1_SERVER)) {
                            genServerGrpc.generateInterface(outServerGrpc, descriptor);
                            genServerGrpc.generateDefinition(outServerGrpc, descriptor);
                        }
                    }
                }
            });
        }
        // plugins should only return files requested to generate
        // unless our option "generate_dependencies" is set.
        // We always return well-known types, because we do not
        // maintain them in a package - they are always generated
        // on demand.
        if (!options.generateDependencies) {
            tsFiles = tsFiles.filter(file => {
                const protoFilename = file.fileDescriptor.name;
                runtime_1.assert(protoFilename);
                if (request.fileToGenerate.includes(protoFilename)) {
                    return true;
                }
                if (well_known_types_1.WellKnownTypes.protoFilenames.includes(protoFilename)) {
                    return true;
                }
                return false;
            });
        }
        // if a proto file is imported to use custom options, or if a proto file declares custom options,
        // we do not to emit it. unless it was explicitly requested.
        const outFileDescriptors = tsFiles.map(of => of.fileDescriptor);
        tsFiles = tsFiles.filter(of => request.fileToGenerate.includes(of.fileDescriptor.name)
            || registry.isFileUsed(of.fileDescriptor, outFileDescriptors));
        return this.transpile(tsFiles, options);
    }
    transpile(tsFiles, options) {
        if (options.transpileTarget === undefined) {
            return tsFiles;
        }
        const opt = {
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
            skipLibCheck: true,
            declaration: true,
            module: options.transpileModule,
            target: options.transpileTarget,
        };
        const [program,] = plugin_framework_1.setupCompiler(opt, tsFiles, tsFiles.map(f => f.getFilename()));
        const results = [];
        let err;
        program.emit(undefined, (fileName, data, writeByteOrderMark, onError, sourceFiles) => {
            // We have to go through some hoops here because the header we add to each file
            // is not part of the AST. So we find the TypeScript file we generated for each
            // emitted file and add the header to each output ourselves.
            if (!sourceFiles) {
                err = new Error(`unable to map emitted file "${fileName}" to a source file: missing source files`);
                return;
            }
            if (sourceFiles.length !== 1) {
                err = new Error(`unable to map emitted file "${fileName}" to a source file: expected 1 source file, got ${sourceFiles.length}`);
                return;
            }
            const tsFile = tsFiles.find(x => sourceFiles[0].fileName === x.getFilename());
            if (!tsFile) {
                err = new Error(`unable to map emitted file "${fileName}" to a source file: not found`);
                return;
            }
            const content = tsFile.getHeader() + data;
            results.push({
                getFilename() {
                    return fileName;
                },
                getContent() {
                    return content;
                }
            });
        });
        if (err) {
            throw err;
        }
        return results;
    }
}
exports.ProtobuftsPlugin = ProtobuftsPlugin;
