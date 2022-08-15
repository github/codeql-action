#!/usr/bin/env node

'use strict'

const fastFolderSize = require('.')

fastFolderSize(process.argv.slice(2)[0], (err, bytes) => {
  if (err) {
    throw err
  }

  console.log(bytes)
})
