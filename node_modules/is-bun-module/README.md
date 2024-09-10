# is-bun-module

## How to use

To check if a specifier is a [Bun module](https://bun.sh/docs/runtime/bun-apis):

```typescript
import { isBunModule } from "is-bun-module";
isBunModule("bun"); // true
isBunModule("bun:test", "1.0.0"); // true
isBunModule("notBunModule"); // false
```

To check if a specifier is a Node module [supported by Bun](https://bun.sh/docs/runtime/nodejs-apis):

```typescript
import { isSupportedNodeModule } from "is-bun-module";
isSupportedNodeModule("fs"); // true
isSupportedNodeModule("node:fs"); // true
isSupportedNodeModule("node:notNodeModule"); // false
isSupportedNodeModule("node:http2", "1.0.0"); // false, added in 1.0.13
```

## Notes

- **Only Bun v1.0.0+ is supported**
- You can also pass `latest` as Bun version
- Inspired by [is-core-module](https://github.com/inspect-js/is-core-module) and made for [eslint-import-resolver-typescript](https://github.com/import-js/eslint-import-resolver-typescript)
