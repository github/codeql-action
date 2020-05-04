'use strict';

const tabsToSpaces = require('convert-to-spaces');

const generateLineNumbers = (line, around) => {
	const lineNumbers = [];

	const min = line - around;
	const max = line + around;

	for (let lineNumber = min; lineNumber <= max; lineNumber++) {
		lineNumbers.push(lineNumber);
	}

	return lineNumbers;
};

module.exports = (source, line, options) => {
	if (typeof source !== 'string') {
		throw new TypeError('Source code is missing.');
	}

	if (!line || line < 1) {
		throw new TypeError('Line number must start from `1`.');
	}

	source = tabsToSpaces(source).split(/\r?\n/);

	if (line > source.length) {
		return null;
	}

	options = Object.assign({around: 3}, options);

	return generateLineNumbers(line, options.around)
		.filter(line => source[line - 1] !== undefined)
		.map(line => ({line, value: source[line - 1]}));
};
