'use strict';

var regex = /[^\r\n]/;

module.exports = function (str) {
	var result = str.match(regex);
	if (!result) {
		return '';
	}
	var firstIndex = result.index;
	var lastIndex = str.length - 1;
	while (str[lastIndex] === '\r' || str[lastIndex] === '\n') {
		lastIndex--;
	}
	return str.substring(firstIndex, lastIndex + 1);
};
