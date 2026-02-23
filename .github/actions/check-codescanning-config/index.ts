
import * as core from '@actions/core'
import * as yaml from 'js-yaml'
import * as fs from 'fs'
import * as assert from 'assert'

const actualConfig = loadActualConfig()

function sortConfigArrays(config) {
  for (const key of Object.keys(config)) {
    const value = config[key];
    if (key === 'queries' && Array.isArray(value)) {
      config[key] = value.sort();
    }
  }
  return config;
}

const rawExpectedConfig = process.argv[3].trim()
if (!rawExpectedConfig) {
  core.setFailed('No expected configuration provided')
} else {
  core.startGroup('Expected generated user config')
  core.info(yaml.dump(JSON.parse(rawExpectedConfig)))
  core.endGroup()
}

const expectedConfig = rawExpectedConfig ? JSON.parse(rawExpectedConfig) : undefined;

assert.deepStrictEqual(
  sortConfigArrays(actualConfig),
  sortConfigArrays(expectedConfig),
  'Expected configuration does not match actual configuration'
);


function loadActualConfig() {
  if (!fs.existsSync(process.argv[2])) {
    core.info('No configuration file found')
    return undefined
  } else {
    const rawActualConfig = fs.readFileSync(process.argv[2], 'utf8')
    core.startGroup('Actual generated user config')
    core.info(rawActualConfig)
    core.endGroup()

    return yaml.load(rawActualConfig)
  }
}
