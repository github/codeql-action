'use strict'

const { execSync } = require('child_process')
const { commands, processOutput } = require('./os.js')

function fastFolderSize(target) {
  const command = commands[process.platform] || commands['linux']
  const stdout = execSync(command, { cwd: target }).toString()

  const processFn = processOutput[process.platform] || processOutput['linux']
  const bytes = processFn(stdout)

  return bytes
}

module.exports = fastFolderSize
