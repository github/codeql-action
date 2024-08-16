import { ToolRunner } from "@actions/exec/lib/toolrunner";
import * as toolcache from "@actions/tool-cache";
import { safeWhich } from "@chrisgavin/safe-which";

import { Logger } from "./logging";
import { assertNever } from "./util";

const MIN_REQUIRED_BSD_TAR_VERSION = "3.4.3";
const MIN_REQUIRED_GNU_TAR_VERSION = "1.31";

type TarVersion = {
  type: "gnu" | "bsd";
  version: string;
};

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

export async function isZstdAvailable(logger: Logger): Promise<boolean> {
  try {
    const { type, version } = await getTarVersion();
    logger.info(`Found ${type} tar version ${version}.`);
    switch (type) {
      case "gnu":
        return version >= MIN_REQUIRED_GNU_TAR_VERSION;
      case "bsd":
        return version >= MIN_REQUIRED_BSD_TAR_VERSION;
      default:
        assertNever(type);
    }
  } catch (e) {
    logger.error(
      "Failed to determine tar version, therefore will assume zstd may not be available. " +
        `The underlying error was: ${e}`,
    );
    return false;
  }
}

export type CompressionMethod = "gzip" | "zstd";

export async function extract(path: string): Promise<{
  compressionMethod: CompressionMethod;
  outputPath: string;
}> {
  if (path.endsWith(".tar.gz")) {
    return {
      compressionMethod: "gzip",
      // While we could also ask tar to autodetect the compression method,
      // we defensively keep the gzip call identical as requesting a gzipped
      // bundle will soon be a fallback option.
      outputPath: await toolcache.extractTar(path),
    };
  }
  return {
    compressionMethod: "zstd",
    // By specifying only the "x" flag, we ask tar to autodetect the compression
    // method.
    outputPath: await toolcache.extractTar(path, undefined, "x"),
  };
}
