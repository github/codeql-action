'use strict';
const md5OMatic = require('md5-o-matic');

module.exports = input => {
	if (Array.isArray(input)) {
		input = input.join('');
	}

	return md5OMatic(input);
};
