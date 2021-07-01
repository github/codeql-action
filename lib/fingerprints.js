"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const long_1 = __importDefault(require("long"));
const tab = "\t".charCodeAt(0);
const space = " ".charCodeAt(0);
const lf = "\n".charCodeAt(0);
const cr = "\r".charCodeAt(0);
const EOF = 65535;
const BLOCK_SIZE = 100;
const MOD = long_1.default.fromInt(37); // L
// Compute the starting point for the hash mod
function computeFirstMod() {
    let firstMod = long_1.default.ONE; // L
    for (let i = 0; i < BLOCK_SIZE; i++) {
        firstMod = firstMod.multiply(MOD);
    }
    return firstMod;
}
/**
 * Hash the contents of a file
 *
 * The hash method computes a rolling hash for every line in the input. The hash is computed using the first
 * BLOCK_SIZE non-space/tab characters counted from the start of the line. For the computation of the hash all
 * line endings (i.e. \r, \n, and \r\n) are normalized to '\n'. A special value (-1) is added at the end of the
 * file followed by enough '\0' characters to ensure that there are BLOCK_SIZE characters available for computing
 * the hashes of the lines near the end of the file.
 *
 * @param callback function that is called with the line number (1-based) and hash for every line
 * @param filepath The path to the file to hash
 */
async function hash(callback, filepath) {
    // A rolling view in to the input
    const window = Array(BLOCK_SIZE).fill(0);
    // If the character in the window is the start of a new line
    // then records the line number, otherwise will be -1.
    // Indexes match up with those from the window variable.
    const lineNumbers = Array(BLOCK_SIZE).fill(-1);
    // The current hash value, updated as we read each character
    let hashRaw = long_1.default.ZERO;
    const firstMod = computeFirstMod();
    // The current index in the window, will wrap around to zero when we reach BLOCK_SIZE
    let index = 0;
    // The line number of the character we are currently processing from the input
    let lineNumber = 0;
    // Is the next character to be read the start of a new line
    let lineStart = true;
    // Was the previous character a CR (carriage return)
    let prevCR = false;
    // A map of hashes we've seen before and how many times,
    // so we can disambiguate identical hashes
    const hashCounts = {};
    // Output the current hash and line number to the callback function
    const outputHash = function () {
        const hashValue = hashRaw.toUnsigned().toString(16);
        if (!hashCounts[hashValue]) {
            hashCounts[hashValue] = 0;
        }
        hashCounts[hashValue]++;
        callback(lineNumbers[index], `${hashValue}:${hashCounts[hashValue]}`);
        lineNumbers[index] = -1;
    };
    // Update the current hash value and increment the index in the window
    const updateHash = function (current) {
        const begin = window[index];
        window[index] = current;
        hashRaw = MOD.multiply(hashRaw)
            .add(long_1.default.fromInt(current))
            .subtract(firstMod.multiply(long_1.default.fromInt(begin)));
        index = (index + 1) % BLOCK_SIZE;
    };
    // First process every character in the input, updating the hash and lineNumbers
    // as we go. Once we reach a point in the window again then we've processed
    // BLOCK_SIZE characters and if the last character at this point in the window
    // was the start of a line then we should output the hash for that line.
    const processCharacter = function (current) {
        // skip tabs, spaces, and line feeds that come directly after a carriage return
        if (current === space || current === tab || (prevCR && current === lf)) {
            prevCR = false;
            return;
        }
        // replace CR with LF
        if (current === cr) {
            current = lf;
            prevCR = true;
        }
        else {
            prevCR = false;
        }
        if (lineNumbers[index] !== -1) {
            outputHash();
        }
        if (lineStart) {
            lineStart = false;
            lineNumber++;
            lineNumbers[index] = lineNumber;
        }
        if (current === lf) {
            lineStart = true;
        }
        updateHash(current);
    };
    const readStream = fs.createReadStream(filepath, "utf8");
    for await (const data of readStream) {
        for (let i = 0; i < data.length; ++i) {
            processCharacter(data.charCodeAt(i));
        }
    }
    processCharacter(EOF);
    // Flush the remaining lines
    for (let i = 0; i < BLOCK_SIZE; i++) {
        if (lineNumbers[index] !== -1) {
            outputHash();
        }
        updateHash(0);
    }
}
exports.hash = hash;
// Generate a hash callback function that updates the given result in-place
// when it receives a hash for the correct line number. Ignores hashes for other lines.
function locationUpdateCallback(result, location, logger) {
    var _a, _b;
    let locationStartLine = (_b = (_a = location.physicalLocation) === null || _a === void 0 ? void 0 : _a.region) === null || _b === void 0 ? void 0 : _b.startLine;
    if (locationStartLine === undefined) {
        // We expect the region section to be present, but it can be absent if the
        // alert pertains to the entire file. In this case, we compute the fingerprint
        // using the hash of the first line of the file.
        locationStartLine = 1;
    }
    return function (lineNumber, hashValue) {
        // Ignore hashes for lines that don't concern us
        if (locationStartLine !== lineNumber) {
            return;
        }
        if (!result.partialFingerprints) {
            result.partialFingerprints = {};
        }
        const existingFingerprint = result.partialFingerprints.primaryLocationLineHash;
        // If the hash doesn't match the existing fingerprint then
        // output a warning and don't overwrite it.
        if (!existingFingerprint) {
            result.partialFingerprints.primaryLocationLineHash = hashValue;
        }
        else if (existingFingerprint !== hashValue) {
            logger.warning(`Calculated fingerprint of ${hashValue} for file ${location.physicalLocation.artifactLocation.uri} line ${lineNumber}, but found existing inconsistent fingerprint value ${existingFingerprint}`);
        }
    };
}
// Can we fingerprint the given location. This requires access to
// the source file so we can hash it.
// If possible returns a absolute file path for the source file,
// or if not possible then returns undefined.
function resolveUriToFile(location, artifacts, sourceRoot, logger) {
    // This may be referencing an artifact
    if (!location.uri && location.index !== undefined) {
        if (typeof location.index !== "number" ||
            location.index < 0 ||
            location.index >= artifacts.length ||
            typeof artifacts[location.index].location !== "object") {
            logger.debug(`Ignoring location as index "${location.index}" is invalid`);
            return undefined;
        }
        location = artifacts[location.index].location;
    }
    // Get the URI and decode
    if (typeof location.uri !== "string") {
        logger.debug(`Ignoring location as URI "${location.uri}" is invalid`);
        return undefined;
    }
    let uri = decodeURIComponent(location.uri);
    // Remove a file scheme, and abort if the scheme is anything else
    const fileUriPrefix = "file://";
    if (uri.startsWith(fileUriPrefix)) {
        uri = uri.substring(fileUriPrefix.length);
    }
    if (uri.indexOf("://") !== -1) {
        logger.debug(`Ignoring location URI "${uri}" as the scheme is not recognised`);
        return undefined;
    }
    // Discard any absolute paths that aren't in the src root
    const srcRootPrefix = `${sourceRoot}/`;
    if (uri.startsWith("/") && !uri.startsWith(srcRootPrefix)) {
        logger.debug(`Ignoring location URI "${uri}" as it is outside of the src root`);
        return undefined;
    }
    // Just assume a relative path is relative to the src root.
    // This is not necessarily true but should be a good approximation
    // and here we likely want to err on the side of handling more cases.
    if (!uri.startsWith("/")) {
        uri = srcRootPrefix + uri;
    }
    // Check the file exists
    if (!fs.existsSync(uri)) {
        logger.debug(`Unable to compute fingerprint for non-existent file: ${uri}`);
        return undefined;
    }
    if (fs.statSync(uri).isDirectory()) {
        logger.debug(`Unable to compute fingerprint for directory: ${uri}`);
        return undefined;
    }
    return uri;
}
exports.resolveUriToFile = resolveUriToFile;
// Compute fingerprints for results in the given sarif file
// and return an updated sarif file contents.
async function addFingerprints(sarifContents, sourceRoot, logger) {
    var _a, _b, _c, _d, _e;
    const sarif = JSON.parse(sarifContents);
    // Gather together results for the same file and construct
    // callbacks to accept hashes for that file and update the location
    const callbacksByFile = {};
    for (const run of sarif.runs || []) {
        // We may need the list of artifacts to resolve against
        const artifacts = run.artifacts || [];
        for (const result of run.results || []) {
            // Check the primary location is defined correctly and is in the src root
            const primaryLocation = (result.locations || [])[0];
            if (!((_b = (_a = primaryLocation) === null || _a === void 0 ? void 0 : _a.physicalLocation) === null || _b === void 0 ? void 0 : _b.artifactLocation)) {
                logger.debug(`Unable to compute fingerprint for invalid location: ${JSON.stringify(primaryLocation)}`);
                continue;
            }
            if (((_e = (_d = (_c = primaryLocation) === null || _c === void 0 ? void 0 : _c.physicalLocation) === null || _d === void 0 ? void 0 : _d.region) === null || _e === void 0 ? void 0 : _e.startLine) === undefined) {
                // Locations without a line number are unlikely to be source files
                continue;
            }
            const filepath = resolveUriToFile(primaryLocation.physicalLocation.artifactLocation, artifacts, sourceRoot, logger);
            if (!filepath) {
                continue;
            }
            if (!callbacksByFile[filepath]) {
                callbacksByFile[filepath] = [];
            }
            callbacksByFile[filepath].push(locationUpdateCallback(result, primaryLocation, logger));
        }
    }
    // Now hash each file that was found
    for (const [filepath, callbacks] of Object.entries(callbacksByFile)) {
        // A callback that forwards the hash to all other callbacks for that file
        const teeCallback = function (lineNumber, hashValue) {
            for (const c of Object.values(callbacks)) {
                c(lineNumber, hashValue);
            }
        };
        await hash(teeCallback, filepath);
    }
    return JSON.stringify(sarif);
}
exports.addFingerprints = addFingerprints;
//# sourceMappingURL=fingerprints.js.map