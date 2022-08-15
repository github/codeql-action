const { test } = require('tap')
const crypto = require('crypto')

const fastFolderSize = require('.')
const fastFolderSizeSync = require('./sync')

test('folder size is larger than 0', t => {
  fastFolderSize('.', (err, bytes) => {
    t.error(err)
    t.ok(Number.isFinite(bytes))
    t.ok(bytes > 0)
    t.end()
  })
})

test('folder size is correct', t => {
  const writtenBytes = 8 * 1024

  const testdirName = t.testdir({
    whatever: crypto.randomBytes(writtenBytes),
  })

  fastFolderSize(testdirName, (err, bytes) => {
    t.error(err)
    console.log('real size:', writtenBytes, 'found size:', bytes)
    t.ok(bytes >= writtenBytes)
    t.ok(bytes <= writtenBytes * 1.5)
    t.end()
  })
})

test('sync: folder size is larger than 0', t => {
  const bytes = fastFolderSizeSync('.')
  t.ok(Number.isFinite(bytes))
  t.ok(bytes > 0)
  t.end()
})

test('sync: folder size is correct', t => {
  const writtenBytes = 8 * 1024

  const testdirName = t.testdir({
    whatever: crypto.randomBytes(writtenBytes),
  })

  const bytes = fastFolderSizeSync(testdirName)
  console.log('real size:', writtenBytes, 'found size:', bytes)
  t.ok(bytes >= writtenBytes)
  t.ok(bytes <= writtenBytes * 1.5)
  t.end()
})
