import { spawn } from "child_process";
import * as fs from "fs";
import * as stream from "stream";

import { ToolRunner } from "@actions/exec/lib/toolrunner";
import * as io from "@actions/io";
import * as toolcache from "@actions/tool-cache";
import * as semver from "semver";

import { CommandInvocationError } from "./actions-util";
import { Logger } from "./logging";
import { assertNever, cleanUpGlob, isBinaryAccessible } from "./util";

const MIN_REQUIRED_BSD_TAR_VERSION = "3.4.3";
const MIN_REQUIRED_GNU_TAR_VERSION = "1.31";

export type TarVersion = {
  type: "gnu" | "bsd";
  version: string;
};

async function getTarVersion(): Promise<TarVersion> {
  const tar = await io.which("tar", true);
  let stdout = "";
  const exitCode = await new ToolRunner(tar, ["--version"], {
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString();
      },
    },
  }).exec();
  if (exitCode !== 0) {
    throw new Error("Failed to call tar --version");
  }
  // Return whether this is GNU tar or BSD tar, and the version number
  if (stdout.includes("GNU tar")) {
    const match = stdout.match(/tar \(GNU tar\) ([0-9.]+)/);
    if (!match || !match[1]) {
      throw new Error("Failed to parse output of tar --version.");
    }

    return { type: "gnu", version: match[1] };
  } else if (stdout.includes("bsdtar")) {
    const match = stdout.match(/bsdtar ([0-9.]+)/);
    if (!match || !match[1]) {
      throw new Error("Failed to parse output of tar --version.");
    }

    return { type: "bsd", version: match[1] };
  } else {
    throw new Error("Unknown tar version");
  }
}

export interface ZstdAvailability {
  available: boolean;
  foundZstdBinary: boolean;
  version?: TarVersion;
}

export async function isZstdAvailable(
  logger: Logger,
): Promise<ZstdAvailability> {
  const foundZstdBinary = await isBinaryAccessible("zstd", logger);
  try {
    const tarVersion = await getTarVersion();
    const { type, version } = tarVersion;
    logger.info(`Found ${type} tar version ${version}.`);
    switch (type) {
      case "gnu":
        return {
          available:
            foundZstdBinary &&
            // GNU tar only uses major and minor version numbers
            semver.gte(
              semver.coerce(version)!,
              semver.coerce(MIN_REQUIRED_GNU_TAR_VERSION)!,
            ),
          foundZstdBinary,
          version: tarVersion,
        };
      case "bsd":
        return {
          available:
            foundZstdBinary &&
            // Do a loose comparison since these version numbers don't contain
            // a patch version number.
            semver.gte(version, MIN_REQUIRED_BSD_TAR_VERSION),
          foundZstdBinary,
          version: tarVersion,
        };
      default:
        assertNever(type);
    }
  } catch (e) {
    logger.warning(
      "Failed to determine tar version, therefore will assume zstd is not available. " +
        `The underlying error was: ${e}`,
    );
    return { available: false, foundZstdBinary };
  }
}

export type CompressionMethod = "gzip" | "zstd";

export async function extract(
  tarPath: string,
  dest: string,
  compressionMethod: CompressionMethod,
  tarVersion: TarVersion | undefined,
  logger: Logger,
): Promise<string> {
  // Ensure destination exists
  fs.mkdirSync(dest, { recursive: true });

  switch (compressionMethod) {
    case "gzip":
      // Defensively continue to call the toolcache API as requesting a gzipped
      // bundle may be a fallback option.
      return await toolcache.extractTar(tarPath, dest);
    case "zstd": {
      if (!tarVersion) {
        throw new Error(
          "Could not determine tar version, which is required to extract a Zstandard archive.",
        );
      }
      await extractTarZst(tarPath, dest, tarVersion, logger);
      return dest;
    }
  }
}

/**
 * Extract a compressed tar archive
 *
 * @param tar   tar stream, or path to the tar
 * @param dest     destination directory
 */
export async function extractTarZst(
  tar: stream.Readable | string,
  dest: string,
  tarVersion: TarVersion,
  logger: Logger,
): Promise<void> {
  logger.debug(
    `Extracting to ${dest}.${
      tar instanceof stream.Readable
        ? ` Input stream has high water mark ${tar.readableHighWaterMark}.`
        : ""
    }`,
  );

  try {
    // Initialize args
    //
    // `--ignore-zeros` means that trailing zero bytes at the end of an archive will be read
    // by `tar` in case a further concatenated archive follows. Otherwise when a tarball built
    // by GNU tar, which writes many trailing zeroes, is read by BSD tar, which expects less, then
    // BSD tar can hang up the pipe to its filter program early, and if that program is `zstd`
    // then it will try to write the remaining zeroes, get an EPIPE error because `tar` has closed
    // its end of the pipe, return 1, and `tar` will pass the error along.
    //
    // See also https://github.com/facebook/zstd/issues/4294
    const args = ["-x", "--zstd", "--ignore-zeros"];

    if (tarVersion.type === "gnu") {
      // Suppress warnings when using GNU tar to extract archives created by BSD tar
      args.push("--warning=no-unknown-keyword");
      args.push("--overwrite");
    }

    args.push("-f", tar instanceof stream.Readable ? "-" : tar, "-C", dest);

    process.stdout.write(`[command]tar ${args.join(" ")}\n`);

    await new Promise<void>((resolve, reject) => {
      const tarProcess = spawn("tar", args, { stdio: "pipe" });

      let stdout = "";
      tarProcess.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
        process.stdout.write(data);
      });

      let stderr = "";
      tarProcess.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
        // Mimic the standard behavior of the toolrunner by writing stderr to stdout
        process.stdout.write(data);
      });

      tarProcess.on("error", (err) => {
        reject(new Error(`Error while extracting tar: ${err}`));
      });

      if (tar instanceof stream.Readable) {
        tar.pipe(tarProcess.stdin).on("error", (err) => {
          reject(
            new Error(`Error while downloading and extracting tar: ${err}`),
          );
        });
      }

      tarProcess.on("exit", (code) => {
        if (code !== 0) {
          reject(
            new CommandInvocationError(
              "tar",
              args,
              code ?? undefined,
              stdout,
              stderr,
            ),
          );
        }
        resolve();
      });
    });
  } catch (e) {
    await cleanUpGlob(dest, "extraction destination directory", logger);
    throw e;
  }
}

const KNOWN_EXTENSIONS: Record<string, CompressionMethod> = {
  "tar.gz": "gzip",
  "tar.zst": "zstd",
};

export function inferCompressionMethod(
  tarPath: string,
): CompressionMethod | undefined {
  for (const [ext, method] of Object.entries(KNOWN_EXTENSIONS)) {
    if (tarPath.endsWith(`.${ext}`)) {
      return method;
    }
  }
  return undefined;
}
