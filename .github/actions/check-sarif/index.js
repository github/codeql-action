'use strict'

const core = require('@actions/core')
const fs = require('fs')

const sarif = JSON.parse(fs.readFileSync(core.getInput('sarif-file'), 'utf8'))
const rules = sarif.runs[0].tool.extensions.flatMap(ext => ext.rules || [])
const ruleIds = rules.map(rule => rule.id)

// Check that all the expected queries ran
const expectedQueriesRun = getQueryIdsInput('queries-run')
const queriesThatShouldHaveRunButDidNot = expectedQueriesRun.filter(queryId => !ruleIds.includes(queryId))

if (queriesThatShouldHaveRunButDidNot.length > 0) {
  core.setFailed(`The following queries were expected to run but did not: ${queriesThatShouldHaveRunButDidNot.join(', ')}`)
}

// Check that all the unexpected queries did not run
const expectedQueriesNotRun = getQueryIdsInput('queries-not-run')

const queriesThatShouldNotHaveRunButDid = expectedQueriesNotRun.filter(queryId => ruleIds.includes(queryId))

if (queriesThatShouldNotHaveRunButDid.length > 0) {
  core.setFailed(`The following queries were NOT expected to have run but did: ${queriesThatShouldNotHaveRunButDid.join(', ')}`)
}


core.startGroup('All queries run')
rules.forEach(rule => {
  core.info(`${rule.id}: ${(rule.properties && rule.properties.name) || rule.name}`)
})
core.endGroup()

core.startGroup('Full SARIF')
core.info(JSON.stringify(sarif, null, 2))
core.endGroup()

function getQueryIdsInput(name) {
  return core.getInput(name)
    .split(',')
    .map(q => q.trim())
    .filter(q => q.length > 0)
}
