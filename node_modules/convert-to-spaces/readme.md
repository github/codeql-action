# convert-to-spaces [![Build Status](https://travis-ci.org/vadimdemedes/convert-to-spaces.svg?branch=master)](https://travis-ci.org/vadimdemedes/convert-to-spaces)

> Convert tabs to spaces in a string


## Install

```
$ npm install --save convert-to-spaces
```


## Usage

```js
const convertToSpaces = require('convert-to-spaces');

convertToSpaces('\t\thello!');
//=> '    hello!'
```


## API

### convertToSpaces(str, [spaces])

#### str

Type: `string`

Source string.

#### spaces

Type: `number`<br>
Default: `2`

Number of spaces instead of each tab.


## Related

- [convert-to-tabs](https://github.com/vadimdemedes/convert-to-tabs) - Convert spaces to tabs.


## License

MIT © [Vadim Demedes](https://vadimdemedes.com)
