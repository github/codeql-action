import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import escapeStringRegexp from 'escape-string-regexp';
import execa from 'execa';

const pkg = JSON.parse(fs.readFileSync(new URL('package.json', import.meta.url)));
const help = `See https://github.com/avajs/typescript/blob/v${pkg.version}/README.md`;

function isPlainObject(x) {
	return x !== null && typeof x === 'object' && Reflect.getPrototypeOf(x) === Object.prototype;
}

function validate(target, properties) {
	for (const key of Object.keys(properties)) {
		const {required, isValid} = properties[key];
		const missing = !Reflect.has(target, key);

		if (missing) {
			if (required) {
				throw new Error(`Missing '${key}' property in TypeScript configuration for AVA. ${help}`);
			}

			continue;
		}

		if (!isValid(target[key])) {
			throw new Error(`Invalid '${key}' property in TypeScript configuration for AVA. ${help}`);
		}
	}

	for (const key of Object.keys(target)) {
		if (!Reflect.has(properties, key)) {
			throw new Error(`Unexpected '${key}' property in TypeScript configuration for AVA. ${help}`);
		}
	}
}

async function compileTypeScript(projectDir) {
	return execa('tsc', ['--incremental'], {preferLocal: true, cwd: projectDir});
}

const configProperties = {
	compile: {
		required: true,
		isValid(compile) {
			return compile === false || compile === 'tsc';
		},
	},
	rewritePaths: {
		required: true,
		isValid(rewritePaths) {
			if (!isPlainObject(rewritePaths)) {
				return false;
			}

			return Object.entries(rewritePaths).every(([from, to]) => from.endsWith('/') && typeof to === 'string' && to.endsWith('/'));
		},
	},
	extensions: {
		required: false,
		isValid(extensions) {
			return Array.isArray(extensions)
				&& extensions.length > 0
				&& extensions.every(ext => typeof ext === 'string' && ext !== '')
				&& new Set(extensions).size === extensions.length;
		},
	},
};

export default function typescriptProvider({negotiateProtocol}) {
	const protocol = negotiateProtocol(['ava-3.2'], {version: pkg.version});
	if (protocol === null) {
		return;
	}

	return {
		main({config}) {
			if (!isPlainObject(config)) {
				throw new Error(`Unexpected Typescript configuration for AVA. ${help}`);
			}

			validate(config, configProperties);

			const {
				extensions = ['ts'],
				rewritePaths: relativeRewritePaths,
				compile,
			} = config;

			const rewritePaths = Object.entries(relativeRewritePaths).map(([from, to]) => [
				path.join(protocol.projectDir, from),
				path.join(protocol.projectDir, to),
			]);
			const testFileExtension = new RegExp(`\\.(${extensions.map(ext => escapeStringRegexp(ext)).join('|')})$`);

			return {
				async compile() {
					if (compile === 'tsc') {
						await compileTypeScript(protocol.projectDir);
					}

					return {
						extensions: [...extensions],
						rewritePaths: [...rewritePaths],
					};
				},

				get extensions() {
					return [...extensions];
				},

				ignoreChange(filePath) {
					if (!testFileExtension.test(filePath)) {
						return false;
					}

					return rewritePaths.some(([from]) => filePath.startsWith(from));
				},

				resolveTestFile(testfile) {
					if (!testFileExtension.test(testfile)) {
						return testfile;
					}

					const rewrite = rewritePaths.find(([from]) => testfile.startsWith(from));
					if (rewrite === undefined) {
						return testfile;
					}

					const [from, to] = rewrite;
					// TODO: Support JSX preserve mode — https://www.typescriptlang.org/docs/handbook/jsx.html
					return `${to}${testfile.slice(from.length)}`.replace(testFileExtension, '.js');
				},

				updateGlobs({filePatterns, ignoredByWatcherPatterns}) {
					return {
						filePatterns: [
							...filePatterns,
							'!**/*.d.ts',
							...Object.values(relativeRewritePaths).map(to => `!${to}**`),
						],
						ignoredByWatcherPatterns: [
							...ignoredByWatcherPatterns,
							...Object.values(relativeRewritePaths).map(to => `${to}**/*.js.map`),
						],
					};
				},
			};
		},

		worker({extensionsToLoadAsModules, state: {extensions, rewritePaths}}) {
			const useImport = extensionsToLoadAsModules.includes('js');
			const testFileExtension = new RegExp(`\\.(${extensions.map(ext => escapeStringRegexp(ext)).join('|')})$`);

			return {
				canLoad(ref) {
					return testFileExtension.test(ref) && rewritePaths.some(([from]) => ref.startsWith(from));
				},

				async load(ref, {requireFn}) {
					const [from, to] = rewritePaths.find(([from]) => ref.startsWith(from));
					// TODO: Support JSX preserve mode — https://www.typescriptlang.org/docs/handbook/jsx.html
					const rewritten = `${to}${ref.slice(from.length)}`.replace(testFileExtension, '.js');
					return useImport ? import(pathToFileURL(rewritten)) : requireFn(rewritten); // eslint-disable-line node/no-unsupported-features/es-syntax
				},
			};
		},
	};
}
