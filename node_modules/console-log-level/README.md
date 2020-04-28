# console-log-level

A dead simple logger. Will log to STDOUT or STDERR depending on the
chosen log level. It uses `console.info`, `console.warn` and
`console.error` and hence supports the same API.

Log levels supported: trace, debug, info, warn, error and fatal.

[![npm](https://img.shields.io/npm/v/console-log-level.svg)](https://www.npmjs.com/package/console-log-level)
[![Build status](https://travis-ci.org/watson/console-log-level.svg?branch=master)](https://travis-ci.org/watson/console-log-level)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](https://github.com/feross/standard)

## Installation

```
npm install console-log-level
```

## Example usage

```js
var log = require('console-log-level')({ level: 'info' })

log.trace('a') // will not do anything
log.debug('b') // will not do anything
log.info('c')  // will output 'c\n' on STDOUT
log.warn('d')  // will output 'd\n' on STDERR
log.error('e') // will output 'e\n' on STDERR
log.fatal('f') // will output 'f\n' on STDERR
```

## Options

Configure the logger by passing an options object:

```js
var log = require('console-log-level')({
  prefix: function (level) {
    return new Date().toISOString()
  },
  level: 'info'
})
```

### level

A `string` to specify the log level. Defaults to `info`.

### prefix

Specify this option if you want to set a prefix for all log messages.
This must be a `string` or a `function` that returns a string.

Will get the level of the currently logged message as the first
argument.

### stderr

A `boolean` to log everything to stderr. Defauls to `false`.

## License

[MIT](LICENSE)
