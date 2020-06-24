import * as fs from 'fs';

const env = {};
for (let entry of Object.entries(process.env)) {
  const key = entry[0];
  const value = entry[1];
  if (typeof value !== 'undefined' && key !== '_' && !key.startsWith('JAVA_MAIN_CLASS_')) {
    env[key] = value;
  }
}
process.stdout.write(process.argv[2]);
fs.writeFileSync(process.argv[2], JSON.stringify(env), 'utf-8');
