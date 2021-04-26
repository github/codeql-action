import fs from 'fs';
import path from 'path';
// @ts-ignore
import slash from 'slash2';

const packagePath = slash(path.join(__dirname, '../', 'package.json'));

/**
 * Get package version.
 *
 * @export getVersion
 * @returns {string}
 */
export function getVersion(): string {
  const packageInfo = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  return (packageInfo && packageInfo.version) || 'invalid version!';
}

export const ExtensionJustify = {
  '.ts': 'typescript',
  '.jsx': 'javascript',
  '.js': 'javascript',
  '.tsx': 'typescript',
};
