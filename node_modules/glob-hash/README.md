# glob-hash
npm module to hash the contents of files matched by globs

[![MIT License Badge](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/roccivic/glob-hash/blob/master/LICENSE.txt)
[![npm](https://img.shields.io/npm/v/glob-hash.svg)](https://www.npmjs.com/package/glob-hash)
[![Build Status](https://travis-ci.org/roccivic/glob-hash.svg?branch=master)](https://travis-ci.org/roccivic/glob-hash)
[![Build status](https://ci.appveyor.com/api/projects/status/22b1tjoqm0yksnqb/branch/master?svg=true)](https://ci.appveyor.com/project/roccivic/glob-hash/branch/master)
[![Code Climate](https://codeclimate.com/github/roccivic/glob-hash/badges/gpa.svg)](https://codeclimate.com/github/roccivic/glob-hash)

# Via Command line

## Install
```sh
npm install -g glob-hash
```

## Use
Note: option ```-i/--include``` is mandatory

    Usage: glob-hash [options]

    Options:

    -h, --help                output usage information
    -V, --version             output the version number
    -i, --include <glob>      Files to include. Mandatory. May be used multiple times.
    -e, --exclude [glob]      Files to exclude. May be used multiple times.
    -a, --algorithm [string]  The hashing algorithm to use. Defaults to "sha256".
    -f, --files               Show matched files and exit.
    -j, --jail [path]         A jail path. Reading outside the jail path will throw an error.
    -n, --filenames           Include filenames in the hash.

# Via API

## Install
```sh
npm install glob-hash --save
```

## Use
### Sample
```js
var globHash = require('glob-hash');

globHash(options)
.then(function(hash) {
    console.log(hash);
}, function(error) {
    console.log(error);
});
```

### Options
*Array* **include** - An array of [globs](https://www.npmjs.com/package/glob) used to match the files to hash. **Mandatory option**.

*Array* **exclude** - An array of [globs](https://www.npmjs.com/package/glob) to exclude from the search.

*String* **algorithm** - The hashing algorithms to use. Defaults to **"sha256"**, see [crypto.getHashes](https://nodejs.org/api/crypto.html#crypto_crypto_gethashes).

*Boolean* **files** - Returns an array of files matched by the globs, instead of returning the hash.

*String* **jail** - A jail path. Reading outside the jail path will throw an error. Defaults to never throwing.

*Boolean* **filenames** - Include filename in the file hash. If used in combination with jail path, filename includes relative path from jail, otherwise it includes full path.

### More samples
```js
// Get hash
globHash({
    include: ['src/**/*.js', '**/*.json'],
    exclude: ['package.json'],
    algorithm: 'sha256' // This is the default
})
.then(
    function(result) {
        console.log(result);
    },
    function(error) {
        console.log(error);
    }
);
```

```js
// Get list of matched files
globHash({
    include: ['src/**/*.js', '**/*.json'],
    exclude: ['package.json'],
    files: true
})
.then(
    function(result) {
        console.log(result);
    },
    function(error) {
        console.log(error);
    }
);
```

# Test
```
npm test
```