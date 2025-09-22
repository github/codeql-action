#!/usr/bin/env ts-node

import * as fs from 'fs';

const EMPTY_CHANGELOG = `# CodeQL Action Changelog

`;

function getTodayString(): string {
  const today = new Date();
  return today.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

// Include everything up to and after the first heading,
// but not the first heading and body.
function dropUnreleasedSection(lines: string[]): [string, string] {
  let beforeFirstSection = '';
  let afterFirstSection = '';
  let foundFirstSection = false;
  let skippedFirstSection = false;

  for (const line of lines) {
    if (line.startsWith('## ') && !foundFirstSection) {
      foundFirstSection = true;
    } else if (line.startsWith('## ') && foundFirstSection) {
      skippedFirstSection = true;
    }

    if (!foundFirstSection) {
      beforeFirstSection += line + '\n';
    }
    if (skippedFirstSection) {
      afterFirstSection += line + '\n';
    }
  }

  return [beforeFirstSection, afterFirstSection];
}

function updateChangelog(targetVersion: string, rollbackVersion: string, newVersion: string): void {
  let beforeFirstSection = EMPTY_CHANGELOG;
  let afterFirstSection = '';

  if (fs.existsSync('CHANGELOG.md')) {
    const content = fs.readFileSync('CHANGELOG.md', 'utf8');
    [beforeFirstSection, afterFirstSection] = dropUnreleasedSection(content.split('\n'));
  }

  const newHeader = `## ${newVersion} - ${getTodayString()}\n`;

  process.stdout.write(beforeFirstSection);
  console.log(newHeader);
  console.log(`This release rolls back ${rollbackVersion} due to issues with that release. It is identical to ${targetVersion}.\n`);
  process.stdout.write(afterFirstSection);
}

// Parse command line arguments
interface Args {
  targetVersion?: string;
  rollbackVersion?: string;
  newVersion?: string;
}

function parseArgs(): Args {
  const args: Args = {};
  
  for (let i = 2; i < process.argv.length; i++) {
    switch (process.argv[i]) {
      case '--target-version':
      case '-t':
        args.targetVersion = process.argv[++i];
        break;
      case '--rollback-version':
      case '-r':
        args.rollbackVersion = process.argv[++i];
        break;
      case '--new-version':
      case '-n':
        args.newVersion = process.argv[++i];
        break;
    }
  }
  
  return args;
}

// Main execution
const args = parseArgs();

if (!args.targetVersion || !args.rollbackVersion || !args.newVersion) {
  console.error('Usage: rollback_changelog.ts --target-version <version> --rollback-version <version> --new-version <version>');
  process.exit(1);
}

updateChangelog(args.targetVersion, args.rollbackVersion, args.newVersion);