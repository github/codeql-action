import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as toolcache from '@actions/tool-cache';
import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';

import * as util from './util';

export interface CodeQL {
  /**
   * Get the directory where the CodeQL executable is located.
   */
  getDir(): string;
  /**
   * Print version information about CodeQL.
   */
  printVersion(): Promise<void>;
  /**
   * Run 'codeql database trace-command' on 'tracer-env.js' and parse
   * the result to get environment variables set by CodeQL.
   */
  getTracerEnv(databasePath: string, compilerSpec: string | undefined): Promise<{ [key: string]: string }>;
  /**
   * Run 'codeql database init'.
   */
  databaseInit(databasePath: string, language: string, sourceRoot: string): Promise<void>;
  /**
   * Runs the autobuilder for the given language.
   */
  runAutobuild(language: string): Promise<void>;
  /**
   * Extract code for a scanned language using 'codeql database trace-command'
   * and running the language extracter.
   */
  extractScannedLanguage(database: string, language: string): Promise<void>;
  /**
   * Finalize a database using 'codeql database finalize'.
   */
  finalizeDatabase(databasePath: string): Promise<void>;
  /**
   * Run 'codeql resolve queries'.
   */
  resolveQueries(queries: string[]): Promise<ResolveQueriesOutput>;
  /**
   * Run 'codeql database analyze'.
   */
  databaseAnalyze(databasePath: string, sarifFile: string, querySuite: string): Promise<void>;
}

export interface ResolveQueriesOutput {
  byLanguage: {
    [language: string]: {
      [queryPath: string]: {}
    }
  };
  noDeclaredLanguage: {
    [queryPath: string]: {}
  };
  multipleDeclaredLanguages: {
    [queryPath: string]: {}
  };
}

/**
 * Environment variable used to store the location of the CodeQL CLI executable.
 * Value is set by setupCodeQL and read by getCodeQL.
 */
const CODEQL_ACTION_CMD = "CODEQL_ACTION_CMD";

export async function setupCodeQL(): Promise<CodeQL> {
  try {
    const codeqlURL = core.getInput('tools', { required: true });
    const codeqlURLVersion = getCodeQLURLVersion(codeqlURL);

    let codeqlFolder = toolcache.find('CodeQL', codeqlURLVersion);
    if (codeqlFolder) {
      core.debug(`CodeQL found in cache ${codeqlFolder}`);
    } else {
      const codeqlPath = await toolcache.downloadTool(codeqlURL);
      const codeqlExtracted = await toolcache.extractTar(codeqlPath);
      codeqlFolder = await toolcache.cacheDir(codeqlExtracted, 'CodeQL', codeqlURLVersion);
    }

    let codeqlCmd = path.join(codeqlFolder, 'codeql', 'codeql');
    if (process.platform === 'win32') {
      codeqlCmd += ".exe";
    } else if (process.platform !== 'linux' && process.platform !== 'darwin') {
      throw new Error("Unsupported plaform: " + process.platform);
    }

    core.exportVariable(CODEQL_ACTION_CMD, codeqlCmd);
    return getCodeQLForCmd(codeqlCmd);

  } catch (e) {
    core.error(e);
    throw new Error("Unable to download and extract CodeQL CLI");
  }
}

export function getCodeQLURLVersion(url: string): string {

  const match = url.match(/\/codeql-bundle-(.*)\//);
  if (match === null || match.length < 2) {
    throw new Error(`Malformed tools url: ${url}. Version could not be inferred`);
  }

  let version = match[1];

  if (!semver.valid(version)) {
    core.debug(`Bundle version ${version} is not in SemVer format. Will treat it as pre-release 0.0.0-${version}.`);
    version = '0.0.0-' + version;
  }

  const s = semver.clean(version);
  if (!s) {
    throw new Error(`Malformed tools url ${url}. Version should be in SemVer format but have ${version} instead`);
  }

  return s;
}

export function getCodeQL(): CodeQL {
  const codeqlCmd = util.getRequiredEnvParam(CODEQL_ACTION_CMD);
  return getCodeQLForCmd(codeqlCmd);
}

function getCodeQLForCmd(cmd: string): CodeQL {
  return {
    getDir: function() {
      return path.dirname(cmd);
    },
    printVersion: async function() {
      await exec.exec(cmd, [
        'version',
        '--format=json'
      ]);
    },
    getTracerEnv: async function(databasePath: string, compilerSpec: string | undefined) {
      let envFile = path.resolve(databasePath, 'working', 'env.tmp');
      const compilerSpecArg = compilerSpec ? ["--compiler-spec=" + compilerSpec] : [];
      await exec.exec(cmd, [
        'database',
        'trace-command',
        databasePath,
        ...compilerSpecArg,
        process.execPath,
        path.resolve(__dirname, 'tracer-env.js'),
        envFile
      ]);
      return JSON.parse(fs.readFileSync(envFile, 'utf-8'));
    },
    databaseInit: async function(databasePath: string, language: string, sourceRoot: string) {
      await exec.exec(cmd, [
        'database',
        'init',
        databasePath,
        '--language=' + language,
        '--source-root=' + sourceRoot,
      ]);
    },
    runAutobuild: async function(language: string) {
      const cmdName = process.platform === 'win32' ? 'autobuild.cmd' : 'autobuild.sh';
      const autobuildCmd = path.join(path.dirname(cmd), language, 'tools', cmdName);

      // Update JAVA_TOOL_OPTIONS to contain '-Dhttp.keepAlive=false'
      // This is because of an issue with Azure pipelines timing out connections after 4 minutes
      // and Maven not properly handling closed connections
      // Otherwise long build processes will timeout when pulling down Java packages
      // https://developercommunity.visualstudio.com/content/problem/292284/maven-hosted-agent-connection-timeout.html
      let javaToolOptions = process.env['JAVA_TOOL_OPTIONS'] || "";
      process.env['JAVA_TOOL_OPTIONS'] = [...javaToolOptions.split(/\s+/), '-Dhttp.keepAlive=false', '-Dmaven.wagon.http.pool=false'].join(' ');

      await exec.exec(autobuildCmd);
    },
    extractScannedLanguage: async function(databasePath: string, language: string) {
      // Get extractor location
      let extractorPath = '';
      await exec.exec(
        cmd,
        [
          'resolve',
          'extractor',
          '--format=json',
          '--language=' + language
        ],
        {
          silent: true,
          listeners: {
            stdout: (data) => { extractorPath += data.toString(); },
            stderr: (data) => { process.stderr.write(data); }
          }
        });

      // Set trace command
      const ext = process.platform === 'win32' ? '.cmd' : '.sh';
      const traceCommand = path.resolve(JSON.parse(extractorPath), 'tools', 'autobuild' + ext);

      // Run trace command
      await exec.exec(cmd, [
        'database',
        'trace-command',
        databasePath,
        '--',
        traceCommand
      ]);
    },
    finalizeDatabase: async function(databasePath: string) {
      await exec.exec(cmd, [
        'database',
        'finalize',
        databasePath
      ]);
    },
    resolveQueries: async function(queries: string[]) {
      let output = '';
      await exec.exec(
        cmd,
        [
          'resolve',
          'queries',
          ...queries,
          '--format=bylanguage'
        ],
        {
          listeners: {
            stdout: (data: Buffer) => {
              output += data.toString();
            }
          }
        });

      return JSON.parse(output);
    },
    databaseAnalyze: async function(databasePath: string, sarifFile: string, querySuite: string) {
      await exec.exec(cmd, [
        'database',
        'analyze',
        util.getMemoryFlag(),
        util.getThreadsFlag(),
        databasePath,
        '--format=sarif-latest',
        '--output=' + sarifFile,
        '--no-sarif-add-snippets',
        querySuite
      ]);
    }
  };
}
