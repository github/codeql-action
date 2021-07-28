# file-url

> Convert a file path to a file url: `unicorn.jpg` → `file:///Users/sindresorhus/unicorn.jpg`

## Install

```
$ npm install file-url
```

## Usage

```js
import fileUrl from 'file-url';

fileUrl('unicorn.jpg');
//=> 'file:///Users/sindresorhus/dev/file-url/unicorn.jpg'

fileUrl('/Users/pony/pics/unicorn.jpg');
//=> 'file:///Users/pony/pics/unicorn.jpg'

fileUrl('unicorn.jpg', {resolve: false});
//=> 'file:///unicorn.jpg'
```

## API

### fileUrl(filePath, options?)

Returns the `filePath` converted to a file URL.

#### filePath

Type: `string`

File path to convert.

#### options

Type: `object`

##### resolve

Type: `boolean`\
Default: `true`

Passing `false` will make it not call `path.resolve()` on the path.

## Related

- [file-url-cli](https://github.com/sindresorhus/file-url-cli) - CLI for this module
