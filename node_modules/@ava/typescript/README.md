# @ava/typescript

Adds [TypeScript](https://www.typescriptlang.org/) support to [AVA](https://avajs.dev).

This is designed to work for projects that precompile TypeScript. It allows AVA to load the compiled JavaScript, while configuring AVA to treat the TypeScript files as test files.

In other words, say you have a test file at `src/test.ts`. You've configured TypeScript to output to `build/`. Using `@ava/typescript` you can run the test using `npx ava src/test.ts`.

## Enabling TypeScript support

Add this package to your project:

```console
npm install --save-dev @ava/typescript
```

Then, enable TypeScript support either in `package.json` or `ava.config.*`:

**`package.json`:**

```json
{
	"ava": {
		"typescript": {
			"rewritePaths": {
				"src/": "build/"
			},
			"compile": false
		}
	}
}
```

Both keys and values of the `rewritePaths` object must end with a `/`. Paths are relative to your project directory.

You can enable compilation via the `compile` property. If `false`, AVA will assume you have already compiled your project. If set to `'tsc'`, AVA will run the TypeScript compiler before running your tests. This can be inefficient when using AVA in watch mode.

Output files are expected to have the `.js` extension.

AVA searches your entire project for `*.js`, `*.cjs`, `*.mjs`, `*.ts`, `*.cts` and `*.mts` files (or other extensions you've configured). It will ignore such files found in the `rewritePaths` targets (e.g. `build/`). If you use more specific paths, for instance `build/main/`, you may need to change AVA's `files` configuration to ignore other directories.

## ES Modules

If your `package.json` has configured `"type": "module"`, or you've configured AVA to treat the `js` extension as `module`, then `@ava/typescript` will import the output file as an ES module. Note that this is based on the *output file*, not the `ts` extension.

## Add additional extensions

You can configure AVA to recognize additional file extensions. To add (partial†) JSX support:

**`package.json`:**

```json
{
	"ava": {
		"typescript": {
			"extensions": [
				"ts",
				"tsx"
			],
			"rewritePaths": {
				"src/": "build/"
			}
		}
	}
}
```

If you use the [`allowJs` TypeScript option](https://www.typescriptlang.org/tsconfig/allowJs.html) you'll have to specify the `js`, `cjs` and `mjs` extensions for them to be rewritten.

See also AVA's [`extensions` option](https://github.com/avajs/ava/blob/master/docs/06-configuration.md#options).

† Note that the [*preserve* mode for JSX](https://www.typescriptlang.org/docs/handbook/jsx.html) is not (yet) supported.
