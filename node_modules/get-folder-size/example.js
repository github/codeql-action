'use strict';

const path = require('path');
const getSize = require('./');

if (!process.env.FOLDER) {
  throw new Error('FOLDER env var needed');
}

getSize(path.resolve(process.env.FOLDER), (err, size) => {
  if (err) { throw err; }

  console.log(size + ' bytes');
  console.log((size / 1024 / 1024).toFixed(2) + ' Mb');
});
