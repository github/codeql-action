# equal-length [![Build Status](https://travis-ci.org/vadimdemedes/equal-length.svg?branch=master)](https://travis-ci.org/vadimdemedes/equal-length)

> Extend lines to equal length


## Install

```
$ npm install --save equal-length
```


## Usage

*.join() and .split() are used only to demo line length*

```js
const equalLength = require('equal-length');

equalLength([
	'abc',
	'a'
].join('\n')).split('\n');
// => [
// 'abc',
// 'a  '
// ]
```


## API

### equalLength(input)

#### input

Type: `string`

Multiline string.


## License

MIT © [Vadim Demedes](https://github.com/vadimdemedes)
