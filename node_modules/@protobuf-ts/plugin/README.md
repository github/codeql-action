@protobuf-ts/plugin
===================

The protocol buffer compiler plugin for TypeScript: [protobuf-ts](https://github.com/timostamm/protobuf-ts) 
 
Installation:

```shell script
# with npm:
npm install -D @protobuf-ts/plugin

# with yarn:
yarn add --dev @protobuf-ts/plugin
```             

This will install the plugin as a development dependency.  

Basic usage:
```shell script
npx protoc --ts_out . --proto_path protos protos/my.proto 
```

With some options:
```shell script
npx protoc \ 
  --ts_out . \
  --ts_opt long_type_string \
  --ts_opt optimize_code_size \
  --proto_path protos \
  protos/my.proto 
```

`protoc` is the protocol buffer compiler. [protobuf-ts](https://github.com/timostamm/protobuf-ts) 
installs it automatically.

Plugin parameters are documented in the [MANUAL](https://github.com/timostamm/protobuf-ts/blob/master/MANUAL.md#the-protoc-plugin).  
For a quick overview of [protobuf-ts](https://github.com/timostamm/protobuf-ts), check the repository [README](https://github.com/timostamm/protobuf-ts/blob/master/README.md).
