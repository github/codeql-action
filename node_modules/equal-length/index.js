'use strict';

module.exports = input => {
	if (typeof input !== 'string') {
		throw new TypeError(`Expected input to be a string, got ${typeof input}`);
	}

	const lines = input.split('\n');
	const maxLength = Math.max.apply(null, lines.map(line => line.length));

	return lines
		.map(line => {
			if (line.length < maxLength) {
				line += ' '.repeat(maxLength - line.length);
			}

			return line;
		})
		.join('\n');
};
