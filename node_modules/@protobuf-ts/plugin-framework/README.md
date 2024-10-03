@protobuf-ts/plugin-framework
=============================

A framework to create protoc plugins in typescript.

The google protocol buffer compiler (protoc) has a plugin system. With a 
protoc plugin, it is possible to generate code for .proto files in any 
language, not just the ones supported directly by protoc. 

A protoc plugin receives a `CodeGeneratorRequest` (a protobuf message) 
via stdin and returns a `CodeGeneratorResponse` via stdout. 
 
This framework aims to make it as easy as possible to write a protoc 
plugin in typescript. It has special support for generating typescript 
code, but can be used to generate code in other languages. 



### Features

- provides a symbol table that can be used to track generated types 
  in any language
  
- has special support for generating typescript code using the 
  typescript compiler API. For example, it has a simple API to import 
  objects from a package, or from the symbol table.

- provides a base class for plugins that supports parameters, error 
  handling, supported features and easy setup.

- builds a tree of descriptors so that it is trivial to lookup the 
  parent of a nested message, for example.

- builds a lookup object to find the descriptor for a given type name 

- provides a string format object that can print a message field like 
  it was typed by the user.
  
- provides a source code comment lookup that can be used to easily 
  find comments for a given element in a .proto

- provides convenience methods to check if a field was declared 
  optional or as a oneof member 


### Getting started

- Check the types and comments of [descriptor.proto](https://github.com/protocolbuffers/protobuf/blob/master/src/google/protobuf/descriptor.proto)
  and [plugin.proto](https://github.com/protocolbuffers/protobuf/blob/master/src/google/protobuf/compiler/plugin.proto)
  to get familiar with the plugin system of protoc.
- Take a look at `descriptor-registry.ts` to see the if it can help you work with the 
  descriptor protos that the compiler sends you.
- Take a look at `plugin-base.ts` for a base class that can help with some plumbing.
- Take a look at the source code of [protobuf-ts](https://github.com/timostamm/protobuf-ts/), which uses this framework.    


### Copyright

- The files [plugin.ts](https://github.com/timostamm/protobuf-ts/blob/master/packages/plugin-framework/src/google/protobuf/compiler/plugin.ts) and [descriptor.ts](https://github.com/timostamm/protobuf-ts/blob/master/packages/plugin-framework/src/google/protobuf/descriptor.ts) are Copyright 2008 Google Inc., licensed under BSD-3-Clause
- All other files are licensed under Apache-2.0, see [LICENSE](https://github.com/timostamm/protobuf-ts/blob/master/packages/plugin-framework/LICENSE). 

