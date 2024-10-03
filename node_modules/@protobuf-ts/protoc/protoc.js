#!/usr/bin/env node

// Automatically installs protoc if not found on $PATH, then
// runs it transiently.

const {spawnSync} = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {findProtocVersionConfig, listInstalled, findProtocPlugins, findProtobufTs, unzip, makeReleaseName, httpGetRedirect, httpDownload, mkDirRecursive, findProtocInPath, standardInstallDirectory} = require('./util');


main().catch(err => {
    console.error((err instanceof Error) ? err.message : err);
    process.exit(1);
});


async function main() {

    // the full path to the protoc executable
    let command;
    // the full path to the include files of a protoc release (well-known-types)
    let includePath;

    // does the nearest package.json have a config.protocVersion?
    const configuredVersion = findProtocVersionConfig(process.cwd());

    if (configuredVersion) {
        // we prefer the configured protoc version and install it
        let release = await ensureInstalled(configuredVersion);
        command = release.protocPath;
        includePath = release.includePath;
    } else {
        // there is no configured protoc version. do we have protoc in the $PATH?
        command = findProtocInPath(process.env.PATH)
        if (!command) {
            // no protoc in $PATH, install the latest version
            let release = await ensureInstalled(configuredVersion);
            command = release.protocPath;
            includePath = release.includePath;
        }
    }

    let args = [
        // pass all arguments to the process
        ...process.argv.slice(2),
    ];

    if (includePath) {
        // add the "include" directory of the installed protoc to the proto path
        // do this last, otherwise it can shadow a user input
        args.push("--proto_path", includePath);
    }

    // search for @protobuf-ts/plugin in node_modules and add --proto_path argument
    let protobufTs = findProtobufTs(process.cwd());
    if (protobufTs) {
        args.push("--proto_path", protobufTs);
    }

    // search for any protoc-gen-xxx plugins in .bin and add --plugin arguments for them
    for (let plugin of findProtocPlugins(process.cwd())) {
        args.unshift("--plugin", plugin);
    }

    let child = spawnSync(command, args, {
        // protoc accepts stdin for some commands, pipe all IO
        stdio: [process.stdin, process.stdout, process.stderr],
        shell: false
    });

    if (child.error) {
        throw new Error("@protobuf-ts/protoc was unable to spawn protoc. " + child.error);
    }
    process.exit(child.status);
}


async function ensureInstalled(version) {
    // resolve the latest release version number if necessary
    if (version === "latest" || version === undefined) {
        let latestLocation;
        try {
            latestLocation = await httpGetRedirect("https://github.com/protocolbuffers/protobuf/releases/latest");
        } catch (e) {
            throw new Error(`@protobuf-ts/protoc failed to retrieve latest protoc version number: ${e}`);
        }
        version = latestLocation.split("/v").pop();
    }

    // make the release name for the current platform and the requested version number
    let releaseName = makeReleaseName({
        platform: os.platform(),
        arch: os.arch(),
        version: version
    });

    // if this release is already installed, we are done here
    let alreadyInstalled = listInstalled().find(i => i.name === releaseName);
    if (alreadyInstalled) {
        return alreadyInstalled;
    }

    // download the release
    let archive;
    try {
        archive = await httpDownload(`https://github.com/protocolbuffers/protobuf/releases/download/v${version}/${releaseName}.zip`);
    } catch (e) {
        throw new Error(`@protobuf-ts/protoc failed to download protoc v${version}. \nDid you misspell the version number? The version number must look like "3.0.12", without a leading "v".\n${e}`);
    }

    // unzip the archive
    let archivePath = path.join(standardInstallDirectory, releaseName);
    try {
        unzip(archive, (data, header) => {
            let filename = path.join(archivePath, header.filename);
            mkDirRecursive(path.dirname(filename));
            fs.writeFileSync(filename, data, {
                mode: header.filename.includes("bin/") ? 0o755 : 0o666
            });
        });
    } catch (e) {
        throw new Error(`@protobuf-ts/protoc failed unzip the downloaded protoc release v${version}: ${e}`);
    }

    // sanity check
    let installed = listInstalled().find(i => i.name === releaseName);
    if (!installed) {
        throw new Error(`@protobuf-ts/protoc failed to install protoc v${version}.`);
    }

    // finished
    console.info(`@protobuf-ts/protoc installed protoc v${installed.version}.`);
    return installed;
}

