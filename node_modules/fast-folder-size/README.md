> The license of this software has changed to AWISC - Anti War ISC License

# fast-folder-size

[![ci](https://github.com/simoneb/fast-folder-size/actions/workflows/ci.yml/badge.svg)](https://github.com/simoneb/fast-folder-size/actions/workflows/ci.yml)

Node CLI or module to calculate folder size.

It uses:

- [Sysinternals DU](https://docs.microsoft.com/en-us/sysinternals/downloads/du) on Windows, automatically downloaded at installation time because the license does not allow redistribution. See below about specifying the download location.
- native `du` on other platforms

## Installation

```
npm i fast-folder-size
```

## Usage

### Programmatically

```js
const { promisify } = require('util')
const fastFolderSize = require('fast-folder-size')
const fastFolderSizeSync = require('fast-folder-size/sync')

// callback
fastFolderSize('.', (err, bytes) => {
  if (err) {
    throw err
  }

  console.log(bytes)
})

// promise
const fastFolderSizeAsync = promisify(fastFolderSize)
const bytes = await fastFolderSizeAsync('.')

console.log(bytes)

// sync
const bytes = fastFolderSizeSync('.')

console.log(bytes)
```

### Command line

```bash
fast-folder-size .
```

### Downloading the Sysinternals DU.zip

By default the Sysinternals DU.zip is downloaded from https://download.sysinternals.com/files/DU.zip.

If you need to change this, e.g. to download from an internal package repository, 
set the **FAST_FOLDER_SIZE_DU_ZIP_LOCATION** environment variable. For example:

```shell
export FAST_FOLDER_SIZE_DU_ZIP_LOCATION=https://your.internal.repository/DU.zip
```
