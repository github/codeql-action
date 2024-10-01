@protobuf-ts/protoc
===================


Installs the protocol buffer compiler "protoc" for you. 


Installation (not necessary if you use the [protobuf-ts plugin](https://github.com/timostamm/protobuf-ts/tree/master/packages/plugin)):

```shell script
# with npm:
npm install @protobuf-ts/protoc

# with yarn:
yarn add @protobuf-ts/protoc
```

Now you can run protoc as usual, you just have to prefix your command with 
`npx` or `yarn`:

```shell script
# with npm:
npx protoc --version 

# with yarn:
yarn protoc --version 
``` 

If you do not already have protoc in your `$PATH`, this will automatically 
download the latest release of protoc for your platform from the github 
release page, then run the executable with your arguments.   


#### Yarn berry

This package is not compatible with Yarn berry. Please use 
[node-protoc](https://www.npmjs.com/package/node-protoc).


#### Installing a specific version

Add the following to your package json:

```
"config": {
   "protocVersion": "3.11.0"
}
``` 

#### Prevent using protoc from `$PATH`

Add a `protocVersion` to your package json, see above.


#### Added arguments

The script passes all given arguments to protoc and adds the 
following arguments:  

1. `--proto_path` that points to the `include/` directory of the 
   downloaded release (skipped when found on `$PATH`)
2. `--plugin` argument for all plugins found in `node_modules/.bin/`
3. `--proto_path` argument for `node_modules/@protobuf-ts/plugin` 

