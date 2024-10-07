import * as fs from "fs";
import path from "path";

import { ToolRunner } from "@actions/exec/lib/toolrunner";
import * as toolcache from "@actions/tool-cache";
import { safeWhich } from "@chrisgavin/safe-which";
import { v4 as uuidV4 } from "uuid";

import { getTemporaryDirectory, runTool } from "./actions-util";
import { Logger } from "./logging";
import { assertNever, cleanUpGlob } from "./util";

const MIN_REQUIRED_BSD_TAR_VERSION = "3.4.3";
const MIN_REQUIRED_GNU_TAR_VERSION = "1.31";

export type TarVersion = {
  type: "gnu" | "bsd";
  version: string;
};

async function isBinaryAccessible(
  binary: string,
  logger: Logger,
): Promise<boolean> {
  try {
    await safeWhich(binary);
    logger.debug(`Found ${binary}.`);
    return true;
  } catch (e) {
    logger.debug(`Could not find ${binary}: ${e}`);
    return false;
  }
}

async function getTarVersion(): Promise<TarVersion> {
  const tar = await safeWhich("tar");
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
          available: foundZstdBinary && version >= MIN_REQUIRED_GNU_TAR_VERSION,
          foundZstdBinary,
          version: tarVersion,
        };
      case "bsd":
        return {
          available: foundZstdBinary && version >= MIN_REQUIRED_BSD_TAR_VERSION,
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
  compressionMethod: CompressionMethod,
  tarVersion: TarVersion | undefined,
  logger: Logger,
): Promise<string> {
  switch (compressionMethod) {
    case "gzip":
      // Defensively continue to call the toolcache API as requesting a gzipped
      // bundle may be a fallback option.
      return await toolcache.extractTar(tarPath);
    case "zstd":
      if (!tarVersion) {
        throw new Error(
          "Could not determine tar version, which is required to extract a Zstandard archive.",
        );
      }
      return await extractTarZst(tarPath, tarVersion, logger);
  }
}

/**
 * Extract a compressed tar archive
 *
 * @param file     path to the tar
 * @param dest     destination directory. Optional.
 * @returns        path to the destination directory
 */
export async function extractTarZst(
  file: string,
  tarVersion: TarVersion,
  logger: Logger,
): Promise<string> {
  if (!file) {
    throw new Error("parameter 'file' is required");
  }

  // Create dest
  const dest = await createExtractFolder();

  try {
    // Initialize args
    const args = ["-x", "-v"];

    let destArg = dest;
    let fileArg = file;
    if (process.platform === "win32" && tarVersion.type === "gnu") {
      args.push("--force-local");
      destArg = dest.replace(/\\/g, "/");

      // Technically only the dest needs to have `/` but for aesthetic consistency
      // convert slashes in the file arg too.
      fileArg = file.replace(/\\/g, "/");
    }

    if (tarVersion.type === "gnu") {
      // Suppress warnings when using GNU tar to extract archives created by BSD tar
      args.push("--warning=no-unknown-keyword");
      args.push("--overwrite");
    }

    args.push("-C", destArg, "-f", fileArg);
    await runTool(`tar`, args);
  } catch (e) {
    await cleanUpGlob(dest, "extraction destination directory", logger);
    throw e;
  }

  return dest;
}

async function createExtractFolder(): Promise<string> {
  const dest = path.join(getTemporaryDirectory(), uuidV4());
  fs.mkdirSync(dest, { recursive: true });
  return dest;
}

export function inferCompressionMethod(tarPath: string): CompressionMethod {
  if (tarPath.endsWith(".tar.gz")) {
    return "gzip";
  }
  return "zstd";
}
