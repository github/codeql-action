'use strict';

const serializeErr = require('serialize-error');
const indentString = require('indent-string');
const stripAnsi = require('strip-ansi');
const arrify = require('arrify');
const yaml = require('js-yaml');

const serializeError = err => {
	const obj = serializeErr(err);
	obj.at = obj.stack
		.split('\n')
		.slice(1, 2)
		.map(line => line.replace(/at/, '').trim())
		.shift();

	delete obj.stack;

	return obj;
};

exports.start = () => 'TAP version 13';

exports.test = (title, options) => {
	const error = options.error;
	let passed = options.passed;
	let directive = '';

	if (!error) {
		if (options.todo) {
			directive = '# TODO';
			passed = false;
		} else if (options.skip) {
			directive = '# SKIP';
			passed = true;
		}
	}

	const comment = arrify(options.comment)
		.map(line => indentString(line, 4).replace(/^ {4}/, '  * '))
		.join('\n');

	const output = [
		`# ${stripAnsi(title)}`,
		`${passed ? 'ok' : 'not ok'} ${options.index} - ${title} ${directive}`.trim(),
		comment
	];

	if (error) {
		const obj = error instanceof Error ? serializeError(error) : error;

		output.push([
			'  ---',
			indentString(yaml.safeDump(obj).trim(), 4),
			'  ...'
		].join('\n'));
	}

	return output.filter(Boolean).join('\n');
};

exports.finish = stats => {
	stats = stats || {};

	const passed = stats.passed || 0;
	const failed = stats.failed || 0;
	const skipped = stats.skipped || 0;
	const todo = stats.todo || 0;
	const crashed = stats.crashed || 0;

	return [
		`\n1..${passed + failed + skipped + todo}`,
		`# tests ${passed + failed + skipped}`,
		`# pass ${passed}`,
		skipped > 0 ? `# skip ${skipped}` : null,
		`# fail ${failed + crashed + todo}\n`
	].filter(Boolean).join('\n');
};
