import * as fs from "fs";

import Long from "long";

import { Logger } from "./logging";

const tab = "\t".charCodeAt(0);
const space = " ".charCodeAt(0);
const lf = "\n".charCodeAt(0);
const cr = "\r".charCodeAt(0);
const BLOCK_SIZE = 100;
const MOD = Long.fromInt(37); // L

// Compute the starting point for the hash mod
function computeFirstMod(): Long {
  let firstMod = Long.ONE; // L
  for (let i = 0; i < BLOCK_SIZE; i++) {
    firstMod = firstMod.multiply(MOD);
  }
  return firstMod;
}

// Type signature of callback passed to hash function.
// Will be called with the line number (1-based) and hash for every line.
type hashCallback = (lineNumber: number, hash: string) => void;

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
 * @param input The file's contents
 */
export function hash(callback: hashCallback, input: string) {
  // A rolling view in to the input
  const window = Array(BLOCK_SIZE).fill(0);

  // If the character in the window is the start of a new line
  // then records the line number, otherwise will be -1.
  // Indexes match up with those from the window variable.
  const lineNumbers = Array(BLOCK_SIZE).fill(-1);

  // The current hash value, updated as we read each character
  let hash = Long.ZERO;
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
  const hashCounts: { [hashValue: string]: number } = {};

  // Output the current hash and line number to the callback function
  const outputHash = function () {
    const hashValue = hash.toUnsigned().toString(16);
    if (!hashCounts[hashValue]) {
      hashCounts[hashValue] = 0;
    }
    hashCounts[hashValue]++;
    callback(lineNumbers[index], `${hashValue}:${hashCounts[hashValue]}`);
    lineNumbers[index] = -1;
  };

  // Update the current hash value and increment the index in the window
  const updateHash = function (current: number) {
    const begin = window[index];
    window[index] = current;
    hash = MOD.multiply(hash)
      .add(Long.fromInt(current))
      .subtract(firstMod.multiply(Long.fromInt(begin)));

    index = (index + 1) % BLOCK_SIZE;
  };

  // First process every character in the input, updating the hash and lineNumbers
  // as we go. Once we reach a point in the window again then we've processed
  // BLOCK_SIZE characters and if the last character at this point in the window
  // was the start of a line then we should output the hash for that line.
  for (let i = 0, len = input.length; i <= len; i++) {
    let current = i === len ? 65535 : input.charCodeAt(i);
    // skip tabs, spaces, and line feeds that come directly after a carriage return
    if (current === space || current === tab || (prevCR && current === lf)) {
      prevCR = false;
      continue;
    }
    // replace CR with LF
    if (current === cr) {
      current = lf;
      prevCR = true;
    } else {
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
  }

  // Flush the remaining lines
  for (let i = 0; i < BLOCK_SIZE; i++) {
    if (lineNumbers[index] !== -1) {
      outputHash();
    }
    updateHash(0);
  }
}

// Generate a hash callback function that updates the given result in-place
// when it receives a hash for the correct line number. Ignores hashes for other lines.
function locationUpdateCallback(
  result: any,
  location: any,
  logger: Logger
): hashCallback {
  let locationStartLine = location.physicalLocation?.region?.startLine;
  if (locationStartLine === undefined) {
    // We expect the region section to be present, but it can be absent if the
    // alert pertains to the entire file. In this case, we compute the fingerprint
    // using the hash of the first line of the file.
    locationStartLine = 1;
  }
  return function (lineNumber: number, hash: string) {
    // Ignore hashes for lines that don't concern us
    if (locationStartLine !== lineNumber) {
      return;
    }

    if (!result.partialFingerprints) {
      result.partialFingerprints = {};
    }
    const existingFingerprint =
      result.partialFingerprints.primaryLocationLineHash;

    // If the hash doesn't match the existing fingerprint then
    // output a warning and don't overwrite it.
    if (!existingFingerprint) {
      result.partialFingerprints.primaryLocationLineHash = hash;
    } else if (existingFingerprint !== hash) {
      logger.warning(
        `Calculated fingerprint of ${hash} for file ${location.physicalLocation.artifactLocation.uri} line ${lineNumber}, but found existing inconsistent fingerprint value ${existingFingerprint}`
      );
    }
  };
}

// Can we fingerprint the given location. This requires access to
// the source file so we can hash it.
// If possible returns a absolute file path for the source file,
// or if not possible then returns undefined.
export function resolveUriToFile(
  location: any,
  artifacts: any[],
  checkoutPath: string,
  logger: Logger
): string | undefined {
  // This may be referencing an artifact
  if (!location.uri && location.index !== undefined) {
    if (
      typeof location.index !== "number" ||
      location.index < 0 ||
      location.index >= artifacts.length ||
      typeof artifacts[location.index].location !== "object"
    ) {
      logger.debug(`Ignoring location as URI "${location.index}" is invalid`);
      return undefined;
    }
    location = artifacts[location.index].location;
  }

  // Get the URI and decode
  if (typeof location.uri !== "string") {
    logger.debug(`Ignoring location as index "${location.uri}" is invalid`);
    return undefined;
  }
  let uri = decodeURIComponent(location.uri);

  // Remove a file scheme, and abort if the scheme is anything else
  const fileUriPrefix = "file://";
  if (uri.startsWith(fileUriPrefix)) {
    uri = uri.substring(fileUriPrefix.length);
  }
  if (uri.indexOf("://") !== -1) {
    logger.debug(
      `Ignoring location URI "${uri}" as the scheme is not recognised`
    );
    return undefined;
  }

  // Discard any absolute paths that aren't in the src root
  const srcRootPrefix = `${checkoutPath}/`;
  if (uri.startsWith("/") && !uri.startsWith(srcRootPrefix)) {
    logger.debug(
      `Ignoring location URI "${uri}" as it is outside of the src root`
    );
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

  return uri;
}

// Compute fingerprints for results in the given sarif file
// and return an updated sarif file contents.
export function addFingerprints(
  sarifContents: string,
  checkoutPath: string,
  logger: Logger
): string {
  const sarif = JSON.parse(sarifContents);

  // Gather together results for the same file and construct
  // callbacks to accept hashes for that file and update the location
  const callbacksByFile: { [filename: string]: hashCallback[] } = {};
  for (const run of sarif.runs || []) {
    // We may need the list of artifacts to resolve against
    const artifacts = run.artifacts || [];

    for (const result of run.results || []) {
      // Check the primary location is defined correctly and is in the src root
      const primaryLocation = (result.locations || [])[0];
      if (!primaryLocation?.physicalLocation?.artifactLocation) {
        logger.debug(
          `Unable to compute fingerprint for invalid location: ${JSON.stringify(
            primaryLocation
          )}`
        );
        continue;
      }

      const filepath = resolveUriToFile(
        primaryLocation.physicalLocation.artifactLocation,
        artifacts,
        checkoutPath,
        logger
      );
      if (!filepath) {
        continue;
      }
      if (!callbacksByFile[filepath]) {
        callbacksByFile[filepath] = [];
      }
      callbacksByFile[filepath].push(
        locationUpdateCallback(result, primaryLocation, logger)
      );
    }
  }

  // Now hash each file that was found
  for (const [filepath, callbacks] of Object.entries(callbacksByFile)) {
    // A callback that forwards the hash to all other callbacks for that file
    const teeCallback = function (lineNumber: number, hash: string) {
      for (const c of Object.values(callbacks)) {
        c(lineNumber, hash);
      }
    };
    const fileContents = fs.readFileSync(filepath).toString();
    hash(teeCallback, fileContents);
  }

  return JSON.stringify(sarif);
}
