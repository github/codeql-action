'use strict';

const proxyquire = require('proxyquire');
const path = require('path');
require('should');

let files = [
  '/root',
  '/root/folder',
  '/root/folder/subfolder',
  '/root/folder/subfolder/file4',
  '/root/folder/file3',
  '/root/file1',
  '/root/file2'
];

const sizes = {
  '/root/folder/subfolder/file4': 4,
  '/root/folder/file3': 3,
  '/root/file1': 1,
  '/root/file2': 2
};

let inos = {};

Object.keys(sizes).forEach(file => {
  const file2 = file.replace(/\//g, path.sep);

  sizes[file2] = sizes[file];
});

files = files.map(file => file.replace(/\//g, path.sep));

let inoCounter = 0;

const fs = {
  lstat: (item, cb) => {
    const stats = {
      size: sizes[item],
      isDirectory: () => {
        return ((item === files[0]) || /folder$/.test(item));
      },
      ino: inos[item] || ++inoCounter
    };

    setImmediate(() => cb(null, stats));
  },
  readdir: (item, cb) => {
    setImmediate(() => {
      const list = files.filter(file => {
        return ((file !== item) && (file.indexOf(item) !== -1));
      }).map(file => {
        return file.replace(item, '');
      }).filter(it => {
        return (it.lastIndexOf(path.sep) <= 0);
      });

      cb(null, list);
    });
  }
};

describe('getSize', () => {
  let getSize;

  before(() => {
    getSize = proxyquire.load('./index', {
      fs: fs
    });
  });

  it('should get the size of the folder', (done) => {
    getSize(files[0], (err, total) => {
      total.should.eql(10);

      done();
    });
  });

  it('should ignore files', (done) => {
    getSize(files[0], /(file1|file2)/, (err, total) => {
      total.should.eql(7);

      done();
    });
  });

  it('should not count hardlinks twice', (done) => {
    inos['/root/file1'] = 222;
    inos['/root/file2'] = inos['/root/file1'];

    getSize(files[0], (err, total) => {
      total.should.eql(8);

      delete inos['/root/file1'];
      delete inos['/root/file2'];

      done();
    });

  });
});
