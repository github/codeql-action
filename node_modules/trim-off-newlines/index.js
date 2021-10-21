'use strict';

var regex = /^(?:\r|\n)+|(?:\r|\n)+$/g;

module.exports = function (str) {
	return str.replace(regex, '');
};
