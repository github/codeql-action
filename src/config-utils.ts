import * as core from '@actions/core';
import * as io from '@actions/io';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

export class ExternalQuery {
    public repository: string;
    public ref: string;
    public path = '';

    constructor(repository: string, ref: string) {
        this.repository = repository;
        this.ref = ref;
    }
}

export class Config {
    public name = "";
    public disableDefaultQueries = false;
    public additionalQueries: string[] = [];
    public externalQueries: ExternalQuery[] = [];
    public pathsIgnore: string[] = [];
    public paths: string[] = [];

    public addQuery(queryUses: string) {
        // The logic for parsing the string is based on what actions does for
        // parsing the 'uses' actions in the workflow file

        if (queryUses === "") {
            throw '"uses" value for queries cannot be blank';
        }

        if (queryUses.startsWith("./")) {
            this.additionalQueries.push(queryUses.slice(2));
            return;
        }

        let tok = queryUses.split('@');
        if (tok.length !== 2) {
            throw '"uses" value for queries must be a path, or owner/repo@ref \n Found: ' + queryUses;
        }

        const ref = tok[1];
        tok = tok[0].split('/');
        // The first token is the owner
        // The second token is the repo
        // The rest is a path, if there is more than one token combine them to form the full path
        if (tok.length > 3) {
            tok = [tok[0], tok[1], tok.slice(2).join('/')];
        }

        if (tok.length < 2) {
            throw '"uses" value for queries must be a path, or owner/repo@ref \n Found: ' + queryUses;
        }

        let external = new ExternalQuery(tok[0] + '/' + tok[1], ref);
        if (tok.length === 3) {
            external.path = tok[2];
        }
        this.externalQueries.push(external);
    }
}

const configFolder = process.env['RUNNER_WORKSPACE'] || '/tmp/codeql-action';

function initConfig(): Config {
    const configFile = core.getInput('config-file');

    const config = new Config();

    // If no config file was provided create an empty one
    if (configFile === '') {
        core.debug('No configuration file was provided');
        return config;
    }

    try {
        const parsedYAML = yaml.safeLoad(fs.readFileSync(configFile, 'utf8'));

        if (parsedYAML.name && typeof parsedYAML.name === "string") {
            config.name = parsedYAML.name;
        }

        if (parsedYAML['disable-default-queries'] && typeof parsedYAML['disable-default-queries'] === "boolean") {
            config.disableDefaultQueries = parsedYAML['disable-default-queries'];
        }

        const queries = parsedYAML.queries;
        if (queries && queries instanceof Array) {
            queries.forEach(query => {
                if (query.uses && typeof query.uses === "string") {
                    config.addQuery(query.uses);
                }
            });
        }

        const pathsIgnore = parsedYAML['paths-ignore'];
        if (pathsIgnore && pathsIgnore instanceof Array) {
            pathsIgnore.forEach(path => {
                if (typeof path === "string") {
                    config.pathsIgnore.push(path);
                }
            });
        }

        const paths = parsedYAML.paths;
        if (paths && paths instanceof Array) {
            paths.forEach(path => {
                if (typeof path === "string") {
                    config.paths.push(path);
                }
            });
        }
    } catch (err) {
        core.setFailed(err);
    }

    return config;
}

async function saveConfig(config: Config) {
    const configString = JSON.stringify(config);
    await io.mkdirP(configFolder);
    fs.writeFileSync(path.join(configFolder, 'config'), configString, 'utf8');
    core.debug('Saved config:');
    core.debug(configString);
}

export async function loadConfig(): Promise<Config> {
    const configFile = path.join(configFolder, 'config');
    if (fs.existsSync(configFile)) {
        const configString = fs.readFileSync(configFile, 'utf8');
        core.debug('Loaded config:');
        core.debug(configString);
        return JSON.parse(configString);

    } else {
        const config = initConfig();
        core.debug('Initialized config:');
        core.debug(JSON.stringify(config));
        await saveConfig(config);
        return config;
    }
}
