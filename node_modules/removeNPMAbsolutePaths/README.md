[![NPM version][npm-image]][npm-url]
[![Node.js CI][ci-image]][ci-url]
[![Test coverage][coveralls-image]][coveralls-url]
[![Downloads][downloads-image]][downloads-url]

# removeNPMAbsolutePaths

removeNPMAbsolutePaths is a small utility to remove the fields that npm adds to the modules in `node_modules` containing local absolute paths.

It has been noted that the `package.json` of modules in the `node_modules` folder contain some extra fields like `_args` and `where` which contain the absolute path of the module. According to NPM those fields are not even used.

The problem comes when you are planning to package your application using electron, NW.js or similar and distribute it. You might not want to distribute files containing absolute paths within your computer.

A feature request has been raised to NPM to fix this issue but they have made clear they don't plan to fix this.
  - https://github.com/npm/npm/issues/12110 (feature request)
  - https://github.com/npm/npm/issues/10393 (discussion about the topic)

## Using removeNPMAbsolutePaths

removeNPMAbsolutePaths simply loop through all the files in the given folder, open the files called `package.json` and remove all the fields starting with an underscore (`_`).

You can  install removeNPMAbsolutePaths globally and use it from the command line
```sh 
$ npm install -g removeNPMAbsolutePaths
$ removeNPMAbsolutePaths '<PROJECT_FOLDER>'
```
or use it from whithin your code
```javascript
const  removeNPMAbsolutePaths = require('removeNPMAbsolutePaths');

try {
  const results = await removeNPMAbsolutePaths('<PROJECT_FOLDER>');
  results.forEach(result => {
    // Print only information about files that couldn't be processed
    if (!result.success) {
      console.log(result.err.message);
    }
  });
} catch(err) {
  console.log(err.message);
}
```
Using `removeNPMAbsolutePaths` from within Javascript returns a promise containing information about all the folders and files processed and whether they where successfully processed and rewritten or not.

### Options
removeNPMAbsolutePaths can be configured using tags. Tags can be added to the command line commands:
```sh 
$ removeNPMAbsolutePaths '<PROJECT_FOLDER>' --force --fields _where _args
```
or passed programmatically in an options object
```javascript
removeNPMAbsolutePaths('<PROJECT_FOLDER>', { force: true, fields: ['_where', '_args']});
```

#### force
removeNPMAbsolutePaths only rewrite to disk the files that it modifies. Passing the `--force` tag will rewritte all the files even if they haven't been modfied. This might be useful if you want all the package.json files to have always exactly the same styling for example for hashing.

#### fields
removeNPMAbsolutePaths by default removes all fields starting with `_`. Passing the `--fields` tag followed by a list of field names you want removed will cause it to remove only those ones you list. This might be useful if only some of the fields in package.json are bothering you.


## License
MIT


[npm-image]: https://img.shields.io/npm/v/removeNPMAbsolutePaths.svg?style=flat-square
[npm-url]: https://www.npmjs.com/package/removeNPMAbsolutePaths
[ci-image]: https://github.com/juanjoDiaz/removeNPMAbsolutePaths/actions/workflows/on-push.yaml/badge.svg
[ci-url]: https://github.com/juanjoDiaz/removeNPMAbsolutePaths/actions/workflows/on-push.yaml
[coveralls-image]: https://img.shields.io/coveralls/juanjoDiaz/removeNPMAbsolutePaths/master.svg?style=flat-square
[coveralls-url]: https://coveralls.io/github/juanjoDiaz/removeNPMAbsolutePaths?branch=master
[downloads-image]: https://img.shields.io/npm/dm/removeNPMAbsolutePaths.svg?style=flat-square
[downloads-url]: https://www.npmjs.com/package/removeNPMAbsolutePaths
