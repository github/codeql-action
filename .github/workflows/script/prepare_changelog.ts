#!/usr/bin/env ts-node

import * as fs from 'fs';

const EMPTY_CHANGELOG = 'No changes.\n\n';

// Prepare the changelog for the new release
// This function will extract the part of the changelog that
// we want to include in the new release.
function extractChangelogSnippet(changelogFile: string, versionTag: string): string {
  let output = '';
  
  if (!fs.existsSync(changelogFile)) {
    output = EMPTY_CHANGELOG;
  } else {
    const content = fs.readFileSync(changelogFile, 'utf8');
    const lines = content.split('\n');
    
    // Include everything up to, but excluding the second heading
    let foundFirstSection = false;
    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (foundFirstSection) {
          break;
        }
        foundFirstSection = true;
      }
      output += line + '\n';
    }
  }
  
  output += `See the full [CHANGELOG.md](https://github.com/github/codeql-action/blob/${versionTag}/CHANGELOG.md) for more information.`;
  
  return output;
}

// Main execution
if (process.argv.length < 4) {
  throw new Error('Expecting argument: changelog_file version_tag');
}

const changelogFile = process.argv[2];
const versionTag = process.argv[3];

console.log(extractChangelogSnippet(changelogFile, versionTag));