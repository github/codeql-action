# Check disk space

[![Continue Integration](https://img.shields.io/github/workflow/status/Alex-D/check-disk-space/Continuous%20Integration?style=for-the-badge)](https://github.com/Alex-D/check-disk-space/actions/workflows/ci.yml)
[![check-disk-space on npm](https://img.shields.io/npm/v/check-disk-space?style=for-the-badge)](https://www.npmjs.com/package/check-disk-space)
[![License MIT](https://img.shields.io/github/license/Alex-D/check-disk-space.svg?style=for-the-badge)](LICENSE)


## Introduction

Light multi-platform disk space checker without third party for Node.js.

- Works on Linux, macOS and Windows
- Take care of mounting points on unix-like systems
- No dependencies
- TypeScript support


## Install

`npm install check-disk-space`


## Usage

```js
// ES
import checkDiskSpace from 'check-disk-space'

// CommonJS
const checkDiskSpace = require('check-disk-space').default

// On Windows
checkDiskSpace('C:/blabla/bla').then((diskSpace) => {
    console.log(diskSpace)
    // {
    //     diskPath: 'C:',
    //     free: 12345678,
    //     size: 98756432
    // }
    // Note: `free` and `size` are in bytes
})

// On Linux or macOS
checkDiskSpace('/mnt/mygames').then((diskSpace) => {
    console.log(diskSpace)
    // {
    //     diskPath: '/',
    //     free: 12345678,
    //     size: 98756432
    // }
    // Note: `free` and `size` are in bytes
})
```
