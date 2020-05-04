# @ava/typescript

Adds rudimentary [TypeScript](https://www.typescriptlang.org/) support to [AVA](https://avajs.dev).

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
			}
		}
	}
}
```

Both keys and values of the `rewritePaths` object must end with a `/`. Paths are relative to your project directory.

Output files are expected to have the `.js` extension.

AVA searches your entire project for `*.js`, `*.cjs`, `*.mjs` and `*.ts` files (or other extensions you've configured). It will ignore such files found in the `rewritePaths` targets (e.g. `build/`). If you use more specific paths, for instance `build/main/`, you may need to change AVA's `files` configuration to ignore other directories.

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

See also AVA's [`extensions` option](https://github.com/avajs/ava/blob/master/docs/06-configuration.md#options).

† Note that the [*preserve* mode for JSX](https://www.typescriptlang.org/docs/handbook/jsx.html) is not (yet) supported.
