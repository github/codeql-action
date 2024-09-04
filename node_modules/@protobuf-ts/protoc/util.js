const path = require("path");
const fs = require("fs");
const os = require("os");
const assert = require("assert");

const standardInstallDirectory = path.join(__dirname, "installed");
module.exports.standardInstallDirectory = standardInstallDirectory;


/**
 * Make directory, creating missing parent directories as well.
 * Equivalent to fs.mkdirSync(p, {recursive: true});
 * @param {string} dirname
 */
module.exports.mkDirRecursive = function mkDirRecursive(dirname) {
    if (!path.isAbsolute(dirname)) {
        dirname = path.join(process.cwd(), dirname);
    }
    dirname = path.normalize(dirname);
    let parts = dirname.split(path.sep);
    for (let i = 2; i <= parts.length; i++) {
        let p = parts.slice(0, i).join(path.sep);
        if (fs.existsSync(p)) {
            let i = fs.lstatSync(p);
            if (!i.isDirectory()) {
                throw new Error("cannot mkdir '" + dirname + "'. '" + p + "' is not a directory.");
            }
        } else {
            fs.mkdirSync(p);
        }
    }
};


/**
 * @typedef {Object} DistEntry
 * @property {string} name
 * @property {string} version
 * @property {string} protocPath
 * @property {string} includePath
 */

/**
 * @param {string} installDir
 * @return {DistEntry[]}
 */
module.exports.listInstalled = function listInstalled(installDir = standardInstallDirectory) {
    let entries = [];
    for (let name of fs.readdirSync(installDir)) {
        let abs = path.join(installDir, name);
        if (!fs.lstatSync(abs).isDirectory()) {
            continue;
        }
        // looking for directory names "protoc-3.13.0-win32"
        if (!name.startsWith("protoc-")) {
            continue;
        }
        let version = name.split("-")[1];
        let protocPath = path.join(abs, "bin/protoc.exe");
        if (!fs.existsSync(protocPath)) {
            protocPath = path.join(abs, "bin/protoc");
        }
        let includePath = path.join(abs, "include/")
        entries.push({name, version, protocPath, includePath});
    }
    return entries;
};


/**
 * Download url into path. Returns path.
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
module.exports.httpDownload = function download(url) {
    assert(typeof url === "string" && url.length > 0);
    assert(url.startsWith("https://") || url.startsWith("http://"));
    const chunks = [];
    return new Promise((resolve, reject) => {
        httpGet(url, []).then(
            response => {
                response.setEncoding("binary");
                response.on("data", chunk => {
                    chunks.push(Buffer.from(chunk, "binary"))
                });
                response.on("end", () => {
                    resolve(Buffer.concat(chunks));
                })
            },
            reason => reject(reason)
        );
    });
};

/**
 * @param {string} url
 * @return {Promise<string>}
 */
module.exports.httpGetRedirect = function httpGetRedirect(url) {
    assert(typeof url === "string" && url.length > 0);
    assert(url.startsWith("https://") || url.startsWith("http://"));
    const client = url.startsWith("https") ? require("https") : require("http");
    return new Promise((resolve, reject) => {
        const request = client.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400) {
                let location = response.headers.location;
                assert(location && location.length > 0);
                resolve(location);
            } else if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode} for ${url}`));
            } else {
                reject(new Error(`Did not get expected redirect for ${url}`));
            }
        });
        request.on("error", reject);
    });
};


/**
 * HTTP GET, follows up to 3 redirects
 * @param {string} url
 * @param {string[]} redirects
 * @returns {Promise<IncomingMessage>}
 */
function httpGet(url, redirects) {
    assert(typeof url === "string" && url.length > 0);
    assert(url.startsWith("https://") || url.startsWith("http://"));
    assert(Array.isArray(redirects));
    assert(redirects.length <= 3);
    const client = url.startsWith("https") ? require("https") : require("http");
    return new Promise((resolve, reject) => {
        const request = client.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400) {
                let location = response.headers.location;
                assert(location && location.length > 0);
                let follow = httpGet(location, redirects.concat(location));
                resolve(follow);
            } else if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode} for ${url}`));
            } else {
                resolve(response);
            }
        });
        request.on("error", reject);
    });
}


/**
 * @typedef {Object} ReleaseParameters
 * @property {NodeJS.Platform} platform
 * @property {CPUArchitecture} arch
 * @property {string} version - without leading "v"
 */

/**
 * @typedef {("arm" | "arm64" | "ia32" | "mips" | "mipsel" | "ppc" | "ppc64" | "s390" | "s390x" | "x32" | "x64")} CPUArchitecture
 */

/**
 * protoc-22.3-linux-aarch_64.zip
 * protoc-22.3-linux-ppcle_64.zip
 * protoc-22.3-linux-s390_64.zip
 * protoc-22.3-linux-x86_32.zip
 * protoc-22.3-linux-x86_64.zip
 * protoc-22.3-osx-aarch_64.zip
 * protoc-22.3-osx-universal_binary.zip
 * protoc-22.3-osx-x86_64.zip
 * protoc-22.3-win32.zip
 + protoc-22.3-win64.zip
 *
 * @param {ReleaseParameters} params
 * @return {string}
 */
module.exports.makeReleaseName = function makeReleaseName(params) {
    let build = `${params.platform}-${params.arch}`;
    switch (params.platform) {
        case "darwin":
            if (params.arch === "arm64") {
                build = 'osx-aarch_64'
            } else if (params.arch === "x64") {
                build = 'osx-x86_64'
            } else {
                build = 'osx-universal_binary'
            }
            break;
        case "linux":
            if (params.arch === "x64") {
                build = 'linux-x86_64'
            } else if (params.arch === "x32") {
                build = 'linux-x86_32'
            } else if (params.arch === "arm64") {
                build = 'linux-aarch_64'
            }
            break;
        case "win32":
            if (params.arch === "x64") {
                build = 'win64'
            } else if (params.arch === "x32" || params.arch === "ia32") {
                build = 'win32'
            }
            break;
    }
    return `protoc-${params.version}-${build}`;
}


/**
 * Reads the package json from the given path if it exists and
 * looks for config.protocVersion.
 *
 * If the package.json does not exist or does not specify a
 * config.protocVersion value, walk the file system up until
 * a package.json with a config.protocVersion is found.
 *
 * If nothing was found, return undefined.
 *
 * @param {string} cwd
 * @returns {string | undefined}
 */
module.exports.findProtocVersionConfig = function findProtocVersionConfig(cwd) {
    let version = undefined;
    let dirname = cwd;
    while (true) {
        version = tryReadProtocVersion(path.join(dirname, "package.json"));
        if (version !== undefined) {
            break;
        }
        let parent = path.dirname(dirname);
        if (parent === dirname) {
            break;
        }
        dirname = parent;
    }
    return version;
};

function tryReadProtocVersion(pkgPath) {
    if (!fs.existsSync(pkgPath)) {
        return undefined;
    }
    let json = fs.readFileSync(pkgPath, "utf8");
    let pkg;
    try {
        pkg = JSON.parse(json);
    } catch (e) {
        return undefined;
    }
    if (typeof pkg === "object" && typeof pkg.config === "object" && pkg.config !== null) {
        if (pkg.config.hasOwnProperty("protocVersion") && typeof pkg.config.protocVersion == "string") {
            let version = pkg.config.protocVersion;
            if (typeof version === "string") {
                return version;
            }
        }
    }
    return undefined;
}


/**
 * @param {string} cwd
 * @returns {string|undefined}
 */
module.exports.findProtobufTs = function (cwd) {
    let plugin = path.join(cwd, "node_modules", "@protobuf-ts", "plugin");
    return fs.existsSync(plugin) ? plugin : undefined;
}


/**
 * @param {string} cwd
 * @returns {string[]}
 */
module.exports.findProtocPlugins = function (cwd) {
    let plugins = [];
    let binDir = path.join(cwd, "node_modules", ".bin");
    if (!fs.existsSync(binDir)) {
        return plugins;
    }
    if (!fs.lstatSync(binDir).isDirectory()) {
        return plugins;
    }
    for (let name of fs.readdirSync(binDir)) {
        if (!name.startsWith("protoc-gen-")) {
            continue;
        }
        let plugin = path.join("node_modules", ".bin", name);
        plugins.push(plugin);
    }
    return plugins;
};


/**
 * @param {string|undefined} envPath from process.env.PATH
 * @returns {string|undefined}
 */
module.exports.findProtocInPath = function (envPath) {
    if (typeof envPath !== "string") {
        return undefined;
    }
    const candidates = envPath.split(path.delimiter)
        .filter(p => !p.endsWith(`node_modules${path.sep}.bin`)) // make sure to exlude ...
        .filter(p => !p.endsWith(`.npm-global${path.sep}bin`)) // ...
        .map(p => path.join(p, os.platform() === "win32" ? "protoc.exe" : "protoc")) // we are looking for "protoc"
        .map(p => p[0] === "~" ? path.join(os.homedir(), p.slice(1)) : p) // try expand "~"
    ;
    for (let c of candidates) {
        if (fs.existsSync(c)) {
            return c;
        }
    }
    return undefined;
};


/**
 * @callback fileCallback
 * @param {Buffer} data
 * @param {LocalHeader} header
 */
/**
 * @param {Buffer} buffer
 * @param {fileCallback} onFile
 */
module.exports.unzip = function unzip(buffer, onFile) {
    const
        zlib = require("zlib"),
        localHeaderSig = 0x04034b50, // Local file header signature
        centralHeaderSig = 0x02014b50, // Central directory file header signature
        eocdRecordSig = 0x06054b50, // End of central directory record (EOCD)
        optDataDescSig = 0x08074b50, // Optional data descriptor signature
        methodStored = 0,
        methodDeflated = 8;
    let pos = 0;
    let cenFound = false;
    while (pos < buffer.byteLength && !cenFound) {
        if (buffer.byteLength - pos < 2) {
            throw new Error("Signature too short at " + pos);
        }
        let sig = buffer.readUInt32LE(pos);
        switch (sig) {

            case localHeaderSig:
                let header = readLocalHeader();
                let compressedData = buffer.subarray(pos, pos + header.compressedSize);
                let uncompressedData;
                switch (header.compressionMethod) {
                    case methodDeflated:
                        uncompressedData = zlib.inflateRawSync(compressedData);
                        break;
                    case methodStored:
                        uncompressedData = compressedData;
                        break;
                    default:
                        throw new Error("Unsupported compression method " + header.compressionMethod);
                }
                if (header.filename[header.filename.length - 1] !== "/") {
                    onFile(uncompressedData, header);
                }
                pos += header.compressedSize;
                break;

            case centralHeaderSig:
                cenFound = true;
                break;

            default:
                throw new Error("Unexpected signature " + sig);
        }
    }


    /**
     * @typedef {Object} LocalHeader
     * @property {number} version
     * @property {number} generalPurposeFlags
     * @property {number} compressionMethod
     * @property {number} lastModificationTime
     * @property {number} lastModificationDate
     * @property {number} crc32
     * @property {number} compressedSize
     * @property {number} uncompressedSize
     * @property {string} filename
     * @property {Buffer} extraField
     *
     * @returns {undefined|LocalHeader}
     */
    function readLocalHeader() {
        let sig = buffer.readUInt32LE(pos);
        if (sig !== localHeaderSig) {
            throw new Error("Unexpected local header signature " + sig.toString(16) + " at " + pos);
        }
        if (buffer.byteLength - pos < 30) {
            throw new Error("Local header too short at " + pos);
        }
        let version = buffer.readUInt32LE(pos + 4);
        let generalPurposeFlags = buffer.readUInt16LE(pos + 6);
        let compressionMethod = buffer.readUInt16LE(pos + 8);
        let lastModificationTime = buffer.readUInt16LE(pos + 10);
        let lastModificationDate = buffer.readUInt16LE(pos + 12);
        let crc32 = buffer.readUInt32LE(pos + 14);
        let compressedSize = buffer.readUInt32LE(pos + 18);
        let uncompressedSize = buffer.readUInt32LE(pos + 22);
        let filenameLength = buffer.readUInt16LE(pos + 26);
        let extraFieldLength = buffer.readUInt16LE(pos + 28);
        let filename = buffer.subarray(pos + 30, pos + 30 + filenameLength).toString();
        let extraField = buffer.subarray(pos + 30 + filenameLength, pos + 30 + filenameLength + extraFieldLength);
        pos += 30 + filenameLength + extraFieldLength;
        return {
            version,
            generalPurposeFlags,
            compressionMethod,
            lastModificationTime,
            lastModificationDate,
            crc32,
            compressedSize,
            uncompressedSize,
            filename,
            extraField
        };
    }

}
