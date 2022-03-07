'use strict';

const path = require('path');
const {
  stat, readdir, readFile, writeFile,
} = require('fs').promises;

const errno = require('./errno');

class ProcessingError extends Error {
  constructor(message, err) {
    super(message + ((err && err.errno) ? ` (${errno[err.errno]})` : ''));
    this.cause = err;
  }
}

async function getStats(filePath) {
  try {
    return await stat(filePath);
  } catch (err) {
    throw new ProcessingError(`Can't read directory/file at "${filePath}"`, err);
  }
}

async function processFile(filePath, opts) {
  try {
    let data;
    try {
      data = await readFile(filePath, 'utf8');
    } catch (err) {
      throw new ProcessingError(`Can't read file at "${filePath}"`, err);
    }

    let shouldWriteFile = false;
    let obj;
    try {
      obj = JSON.parse(data);
    } catch (err) {
      throw new ProcessingError(`Malformed package.json file at "${filePath}"`, err);
    }

    Object.keys(obj).forEach((key) => {
      const shouldBeDeleted = opts.fields ? (opts.fields.indexOf(key) !== -1) : (key[0] === '_');
      if (shouldBeDeleted) {
        delete obj[key];
        shouldWriteFile = true;
      }
    });

    if (shouldWriteFile || opts.force) {
      try {
        await writeFile(filePath, `${JSON.stringify(obj, null, '  ')}${data.endsWith('\n') ? '\n' : ''}`);
      } catch (err) {
        throw new ProcessingError(`Can't write processed file to "${filePath}"`, err);
      }

      return { filePath, rewritten: true, success: true };
    }

    return { filePath, rewritten: false, success: true };
  } catch (err) {
    return { filePath, err, success: false };
  }
}

async function processDir(dirPath, opts) {
  try {
    let files;
    try {
      files = await readdir(dirPath);
    } catch (err) {
      throw new ProcessingError(`Can't read directory at "${dirPath}"`, err);
    }

    const results = await Promise.all(files.map(async (fileName) => {
      const filePath = path.join(dirPath, fileName);

      const stats = await getStats(filePath);

      if (stats.isDirectory()) {
        return processDir(filePath, opts);
      }

      if (fileName === 'package.json') {
        return processFile(filePath, opts);
      }

      return undefined;
    }));

    return results.reduce((arr, value) => {
      if (!value) {
        return arr;
      }

      if (Array.isArray(value)) {
        return [...arr, ...value];
      }

      return [...arr, value];
    }, [{ dirPath, success: true }]);
  } catch (err) {
    return [{ dirPath, err, success: false }];
  }
}

async function removeNPMAbsolutePaths(filePath, opts = {}) {
  if (!filePath) {
    throw new ProcessingError('Missing path.\nThe first argument should be the path to a directory or a package.json file.');
  }

  if (opts.fields && (!Array.isArray(opts.fields) || opts.fields.length === 0)) {
    throw new ProcessingError('Invalid option: fields.\nThe fields option should be an array cotaining the names of the specific fields that should be removed.');
  }

  const stats = await getStats(filePath);

  if (stats.isDirectory()) {
    return processDir(filePath, opts);
  }

  if (path.basename(filePath) === 'package.json') {
    return [await processFile(filePath, opts)];
  }

  throw new Error('Invalid path provided. The path should be a directory or a package.json file.');
}

module.exports = removeNPMAbsolutePaths;
