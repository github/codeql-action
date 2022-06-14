'use strict'

const core = require('@actions/core');
const fs = require('fs')

const sarif = JSON.parse(fs.readFileSync(core.getInput('sarif-file'), 'utf8'))
const rules = sarif.runs[0].tool.extensions.flatMap(ext => ext.rules || [])

// Expected Queries
const expectedQueriesRun = getInput('queries-run')
const queriesThatShouldHaveRunButDidnt = expectedQueriesRun.reduce((acc, queryId) => {
  if (!rules.some(rule => rule.id === queryId)) {
    acc.push(queryId)
  }
  return acc
}, []);

if (queriesThatShouldHaveRunButDidnt.length > 0) {
  core.setFailed(`The following queries were expected to run but did not: ${queriesThatShouldHaveRunButDidnt.join(', ')}`)
}

// Unexpected Queries
const expectedQueriesNotRun = getInput('queries-not-run')

const queriesThatShouldNotHaveRunButDid = expectedQueriesNotRun.reduce((acc, queryId) => {
  if (rules.some(rule => rule.id === queryId)) {
    acc.push(queryId)
  }
  return acc
}, []);

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

function getInput(name) {
  return core.getInput(name)
    .split(',')
    .map(q => q.trim())
    .filter(q => q.length > 0)
}
