const https = require('https')
const path = require('path')
const unzipper = require('unzipper')

// Only run for Windows
if (process.platform !== 'win32') {
  process.exit(0)
}

const duZipLocation =
  process.env.FAST_FOLDER_SIZE_DU_ZIP_LOCATION ||
  'https://download.sysinternals.com/files/DU.zip'

https.get(duZipLocation, function (res) {
  res.pipe(unzipper.Extract({ path: path.join(__dirname, 'bin') }))
})
