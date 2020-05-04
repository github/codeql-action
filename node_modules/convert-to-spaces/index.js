'use strict';

module.exports = (str, spaces) => {
	return str.replace(/^\t+/gm, $1 => ' '.repeat($1.length * (spaces || 2)));
};
