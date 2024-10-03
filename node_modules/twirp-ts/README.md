# Twirp-TS

A complete server and client implementation of the awesome [Twirp Specification](https://twitchtv.github.io/twirp/docs/spec_v7.html) written in typescript. 

Supported spec v7 and v8

----

[![npm version](https://badge.fury.io/js/twirp-ts.svg)](https://badge.fury.io/js/twirp-ts)
[![Coverage Status](https://coveralls.io/repos/github/hopin-team/twirp-ts/badge.svg?branch=main)](https://coveralls.io/github/hopin-team/twirp-ts?branch=main)

Table of Contents:

- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Install Protoc](#install-protoc)
- [Code Generation](#code-generation)
- [Server](#server)
  - [Express](#integrating-with-express) 
  - [Hooks & Interceptors](#server-hooks--interceptors)
  - [Errors](#errors)
  - [Gateway](#Gateway)
- [Client](#twirp-client)
- [Open API V3](#open-api-v3)
- [Migrate to V2](#migrate-to-v2)
- [How to Upgrade](#how-to-upgrade)

## Getting Started

---

### Installation
Run the following to install the package

```
npm i twirp-ts @protobuf-ts/plugin@next -S
```

or

```
yarn add twirp-ts @protobuf-ts/plugin@next
```

Install `ts-proto` instead if you prefer it over `@protobuf-ts`

### Install Protoc
Make sure you have `protoc` or `buf` installed.

**Mac:**
```bash
brew install protobuf
```

**Linux:**
```bash
apt-get install protobuf
```

**Optional**: <br />
This plugin works with [buf](https://docs.buf.build/installation) too, follow the link to see how to install it

## Code Generation

**twirp-ts** relies on either [protobuf-ts](https://github.com/timostamm/protobuf-ts) or [ts-proto](https://github.com/stephenh/ts-proto) to generate protobuf message definitions

The `protoc-gen-twirp_ts` is instead used to generate `server` and `client` code for twirp-ts

It is as simple as adding the following options in your `protoc` command

```bash
PROTOC_GEN_TWIRP_BIN="./node_modules/.bin/protoc-gen-twirp_ts"

--plugin=protoc-gen-twirp_ts=${PROTOC_GEN_TWIRP_BIN} \
--twirp_ts_out=$(OUT_DIR)
```

Here's an example working command with the recomended flags:

<details>
  <summary>using ts-proto (click to see)</summary>

```bash
PROTOC_GEN_TWIRP_BIN="./node_modules/.bin/protoc-gen-twirp_ts"
PROTOC_GEN_TS_BIN="./node_modules/.bin/protoc-gen-ts_proto"

OUT_DIR="./generated"

protoc \
    -I ./protos \
    --plugin=protoc-gen-ts_proto=${PROTOC_GEN_TS_BIN} \
    --plugin=protoc-gen-twirp_ts=${PROTOC_GEN_TWIRP_BIN} \
    --ts_proto_opt=esModuleInterop=true \
    --ts_proto_opt=outputClientImpl=false \
    --ts_proto_out=${OUT_DIR} \
    --twirp_ts_opt="ts_proto" \
    --twirp_ts_out=${OUT_DIR} \
    ./protos/*.proto
```
</details>

<details>
  <summary>using protobuf-ts (click to see)</summary>

```bash
PROTOC_GEN_TWIRP_BIN="./node_modules/.bin/protoc-gen-twirp_ts"
PROTOC_GEN_TS_BIN="./node_modules/.bin/protoc-gen-ts"

OUT_DIR="./generated"

protoc \
  -I ./protos \
  --plugin=protoc-gen-ts=$(PROTOC_GEN_TS_BIN) \
  --plugin=protoc-gen-twirp_ts=$(PROTOC_GEN_TWIRP_BIN) \
  --ts_opt=client_none \
  --ts_opt=generate_dependencies \
  --ts_out=$(OUT_DIR) \
  --twirp_ts_out=$(OUT_DIR) \
  ./protos/*.proto
```
</details>

<details>
  <summary>using protobuf-ts on windows, Git Bash (click to see)</summary>

```bash
OUT_DIR="./generated"

protoc \
  -I ./protos \
  --plugin=protoc-gen-ts=.\\node_modules\\.bin\\protoc-gen-ts.cmd \
  --plugin=protoc-gen-twirp_ts=.\\node_modules\\.bin\\protoc-gen-twirp_ts.cmd \
  --ts_opt=client_none \
  --ts_opt=generate_dependencies \
  --ts_out=${OUT_DIR} \
  --twirp_ts_out=${OUT_DIR} \
  ./protos/*.proto
```
</details>



If you'd like the plugin to generate an `index.ts` file exporting all your generated code
simply add `--twirp_ts_opt="index_file"`

### Server

Once you've generated the server code you can simply start a server as following:

```ts
import * as http from "http";
import {TwirpContext} from "twirp-ts";
import {createHaberdasherServer} from "./generated/haberdasher.twirp";
import {Hat, Size} from "./generated/service";

const server = createHaberdasherServer({
    async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
        // Your implementation
    },
});

http.createServer(server.httpHandler())
    .listen(8080);
```

#### Path prefix

By default the server uses the `/twirp` prefix for every request.
You can change or remove the prefix passing the `prefix` option to the handler

```ts
const server = createHaberdasherServer({
    async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
        // Your implementation
    },
});

server.withPrefix("/custom-prefix") // or false to remove it

http.createServer(server.httpHandler())
  .listen(8080);
```

or you can pass it to the handler directly:

```ts
http.createServer(server.httpHandler({
    prefix: "/custom-prefix", 
})).listen(8080);
```

### Integrating with express

If you'd like to use `express` as your drop in solution to add more routes, or middlewares you can do as following:

```ts
const server = createHaberdasherServer({
    async MakeHat(ctx: TwirpContext, request: Size): Promise<Hat> {
        // ... implementation
    },
});

const app = express();

app.post(server.matchingPath(), server.httpHandler());

app.listen(8000);
```

Note: if you want to change the default prefix use `server.withPrefix()`

### Server Hooks & Interceptors

[Link to Spec](https://twitchtv.github.io/twirp/docs/hooks.html)

**Interceptors** are a form of middleware for Twirp requests. Interceptors can mutate the request and responses, which can enable some powerful integrations, but in most cases, it is better to use Hooks for observability at key points during a request. Mutating the request adds complexity to the request lifecycle.

Be mindful to not hide too much behind interceptors as with every `middleware` alike implementation is easy to increase complexity making it harder to reason about.

Example: 

```ts
const server = createHaberdasherServer({
    // ...
});

async function exampleInterceptor(ctx: TwirpContext, req: any, next: Next) {
    console.log("Before response");

    const response = await next(ctx, req);

    console.log("After response");

    return response;
}

server.use(exampleInterceptor)
```
<br/>

**Server Hooks** They provide callbacks for before and after the request is handled. The Error hook is called only if an error was returned by the handler.

A great place for `metrics` and `logging` 

```ts
const server = createHaberdasherServer({
    // ...
});

const serverHooks: ServerHooks = {
    requestReceived: (ctx) => {
        console.log("Received");
    },
    requestRouted: (ctx) => {
        console.log("Requested");
    },
    responsePrepared: (ctx) => {
        console.log("Prepared");
    },
    responseSent: (ctx) => {
        console.log("Sent");
    },
    error: (ctx, err) => {
        console.log(err);
    }
};

server.use(serverHooks);
```

### Errors

[Link to Spec](https://twitchtv.github.io/twirp/docs/errors.html)

The library comes with a built in `TwirpError` which is the default and standard error for all of your errors.

You can certainly create custom errors that extend a `TwirpError`

For Example:

```ts
import {TwirpError, TwirpErrorCode} from "twirp-ts";

class UnauthenticatedError extends TwirpError {
    constructor(traceId: string) {
        super(TwirpErrorCode.Unauthenticated, "you must login");
        this.withMeta("trace-id", traceId)
    }
}
```

## Gateway
The gateway allows to expose custom http endpoints that automatically maps to your twirp handlers.

The mapping is done in your proto file using the [google.api.http](https://github.com/googleapis/googleapis/blob/master/google/api/http.proto#L46) annotations spec.


### Add the annotation

```proto
service Haberdasher {
  // MakeHat produces a hat of mysterious, randomly-selected color!
  rpc MakeHat(Size) returns (Hat) {
    option (google.api.http) = {
      post: "/hat"
      body: "*"
    };
  };
}
```

### Generating the gateway

add the following option in your `protoc` command:

```
--twirp_ts_opt=gateway
```

Don't forget to regenerate your proto files.

### Gateway Reverse Proxy
Once we generated the gateway we can use it as a stand-alone reverse-proxy server or as a request rewriter.

The following example creates a stand-alone reverse proxy:

```ts
import express from 'express';
import {createGateway} from './generated/gateway.twirp.ts';

const app = express();
const gateway = createGateway();

app.use(gateway.reverseProxy({
  baseUrl: "http://localhost:8000/twirp",
}));

app.listen(8001);
```

### Gateway rewriter
If you prefer to have the gateway in the same server as your twirp endpoint and save a round-trip, you'd want to use the `rewriter`

The rewriter will automatically rewrite the request (once it finds a match) to the corresponded twirp handler

```ts
import express from 'express';
import {createGateway} from './generated/gateway.twirp.ts';

const app = express();
const gateway = createGateway();

app.use(gateway.twirpRewrite());

// All your twirp handlers
app.post(server.matchingPath(), server.httpHandler());

app.listen(8001);
```

**Note:** make sure the middleware is register before your twirp handlers

## Twirp Client

As well as the server you've also got generated client code, ready for you to use. <br />
You can choose between `JSON` client and `Protobuf` client.

The generated code doesn't include an actual library to make `http` requests, but it gives you an interface to implement the one that you like the most.

Alternatively you can use the provided implementation based on node `http` and `https` package.

For example:

```ts
const jsonClient = new HaberdasherClientJSON(NodeHttpRPC({
    baseUrl: "http://localhost:8000/twirp",
}));

const protobufClient = new HaberdasherClientProtobuf(NodeHttpRPC({
    baseUrl: "http://localhost:8000/twirp",
}));
```

For us in the browser, you can use the provided `fetch` based implementation,

For example:

```ts
export const jsonClient = new HaberdasherClientJSON(FetchRPC({
  baseUrl: "http://localhost:8000/twirp",
}));
export const protobufClient = new HaberdasherClientProtobuf(FetchRPC({
  baseUrl: "http://localhost:8000/twirp",
}));
```

Alternatively provided your own implementation. 

You can check the [full example](./example/client.ts) on how to integrate the client with `axios`.

## Open API V3

You can now generate automatically an **OpenAPI V3** compliant spec out of your twirp protobuf definitions!

We support the **Gateway** too!

Add the following options to your `protoc` command:

```
--twirp_ts_opt="openapi_twirp" 
--twirp_ts_opt="openapi_gateway"
```

Enjoy!

## Migrate to V2

The v2 offers new functionalities and stability improvements, a few simple to migrate breaking changes
have been made during the upgrade.

- ts-proto & @protobuf-ts are now `peerDepedencies` which means that you can now update them at your pace.
  - Install either one of the 2 libraries (refer to Getting Started)
  

- The twirp generator now uses `protobuf-ts` as the default generator. pass the `--twirp_ts_opt="ts_proto"` 
to use `ts-proto`
  

- We now generate a single `*.twirp.ts` per `.proto` file instead of 1 file per `service` definition. 
if you have multiple services in one file you'd simply need to fix the imports

## How to upgrade

The package uses Semver Versioning system. <br />
However, keep in mind that the **code-generation** plugin is tightly coupled to the **twirp-ts** library.

Make sure that whenever you update `twirp-ts` you re-generate the server and client code. This make sure that the generated code will be using the updated library

## Licence

MIT <3
