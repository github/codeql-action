import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as exec from "@actions/exec";

import { Logger } from "./logging";
import { getErrorMessage } from "./util";

/**
 * Enumerates known types of GitHub token formats.
 */
export enum TokenType {
  PersonalAccessClassic = "Personal Access Token (Classic)",
  PersonalAccessFineGrained = "Personal Access Token (Fine-grained)",
  OAuth = "OAuth Access Token",
  UserToServer = "User-to-Server Token",
  ServerToServer = "Server-to-Server Token",
  Refresh = "Refresh Token",
  AppInstallationAccess = "App Installation Access Token",
}

/** A value of this type associates a token type with its pattern. */
export interface TokenPattern {
  type: TokenType;
  pattern: RegExp;
}

/** The pattern for PATs (Classic) */
export const GITHUB_PAT_CLASSIC_PATTERN: TokenPattern = {
  type: TokenType.PersonalAccessClassic,
  pattern: /\bghp_[a-zA-Z0-9]{36}\b/g,
};

/** The pattern for PATs (Fine-grained) */
export const GITHUB_PAT_FINE_GRAINED_PATTERN: TokenPattern = {
  type: TokenType.PersonalAccessFineGrained,
  pattern: /\bgithub_pat_[a-zA-Z0-9_]+\b/g,
};

/**
 * GitHub token patterns to scan for.
 * These patterns match various GitHub token formats.
 */
const GITHUB_TOKEN_PATTERNS: TokenPattern[] = [
  GITHUB_PAT_CLASSIC_PATTERN,
  GITHUB_PAT_FINE_GRAINED_PATTERN,
  {
    type: TokenType.OAuth,
    pattern: /\bgho_[a-zA-Z0-9]{36}\b/g,
  },
  {
    type: TokenType.UserToServer,
    pattern: /\bghu_[a-zA-Z0-9]{36}\b/g,
  },
  {
    type: TokenType.ServerToServer,
    pattern: /\bghs_[a-zA-Z0-9]{36}\b/g,
  },
  {
    type: TokenType.Refresh,
    pattern: /\bghr_[a-zA-Z0-9]{36}\b/g,
  },
  {
    type: TokenType.AppInstallationAccess,
    pattern: /\bghs_[a-zA-Z0-9]{255}\b/g,
  },
];

interface TokenFinding {
  tokenType: string;
  filePath: string;
}

interface ScanResult {
  scannedFiles: number;
  findings: TokenFinding[];
}

/**
 * Checks whether `value` matches any token `patterns`.
 * @param value The value to match against.
 * @param patterns The patterns to check.
 * @returns The type of the first matching pattern, or `undefined` if none match.
 */
export function isAuthToken(
  value: string,
  patterns: TokenPattern[] = GITHUB_TOKEN_PATTERNS,
) {
  for (const { type, pattern } of patterns) {
    if (value.match(pattern)) {
      return type;
    }
  }
  return undefined;
}

/**
 * Scans a file for GitHub tokens.
 *
 * @param filePath Path to the file to scan
 * @param relativePath Relative path for display purposes
 * @param logger Logger instance
 * @returns Array of token findings in the file
 */
function scanFileForTokens(
  filePath: string,
  relativePath: string,
  logger: Logger,
): TokenFinding[] {
  const findings: TokenFinding[] = [];
  try {
    const content = fs.readFileSync(filePath, "utf8");

    for (const { type, pattern } of GITHUB_TOKEN_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        for (let i = 0; i < matches.length; i++) {
          findings.push({ tokenType: type, filePath: relativePath });
        }
        logger.debug(`Found ${matches.length} ${type}(s) in ${relativePath}`);
      }
    }

    return findings;
  } catch (e) {
    // If we can't read the file as text, it's likely binary or inaccessible
    logger.debug(
      `Could not scan file ${filePath} for tokens: ${getErrorMessage(e)}`,
    );
    return [];
  }
}

/**
 * Recursively extracts and scans archive files (.zip, .gz, .tar.gz).
 *
 * @param archivePath Path to the archive file
 * @param relativeArchivePath Relative path of the archive for display
 * @param extractDir Directory to extract to
 * @param logger Logger instance
 * @param depth Current recursion depth (to prevent infinite loops)
 * @returns Scan results
 */
async function scanArchiveFile(
  archivePath: string,
  relativeArchivePath: string,
  extractDir: string,
  logger: Logger,
  depth: number = 0,
): Promise<ScanResult> {
  const MAX_DEPTH = 10; // Prevent infinite recursion
  if (depth > MAX_DEPTH) {
    throw new Error(
      `Maximum archive extraction depth (${MAX_DEPTH}) reached for ${archivePath}`,
    );
  }

  const result: ScanResult = {
    scannedFiles: 0,
    findings: [],
  };

  try {
    const tempExtractDir = fs.mkdtempSync(
      path.join(extractDir, `extract-${depth}-`),
    );

    // Determine archive type and extract accordingly
    const fileName = path.basename(archivePath).toLowerCase();
    if (fileName.endsWith(".tar.gz") || fileName.endsWith(".tgz")) {
      // Extract tar.gz files
      logger.debug(`Extracting tar.gz file: ${archivePath}`);
      await exec.exec("tar", ["-xzf", archivePath, "-C", tempExtractDir], {
        silent: true,
      });
    } else if (fileName.endsWith(".tar.zst")) {
      // Extract tar.zst files
      logger.debug(`Extracting tar.zst file: ${archivePath}`);
      await exec.exec(
        "tar",
        ["--zstd", "-xf", archivePath, "-C", tempExtractDir],
        {
          silent: true,
        },
      );
    } else if (fileName.endsWith(".zst")) {
      // Extract .zst files (single file compression)
      logger.debug(`Extracting zst file: ${archivePath}`);
      const outputFile = path.join(
        tempExtractDir,
        path.basename(archivePath, ".zst"),
      );
      await exec.exec("zstd", ["-d", archivePath, "-o", outputFile], {
        silent: true,
      });
    } else if (fileName.endsWith(".gz")) {
      // Extract .gz files (single file compression)
      logger.debug(`Extracting gz file: ${archivePath}`);
      const outputFile = path.join(
        tempExtractDir,
        path.basename(archivePath, ".gz"),
      );
      await exec.exec("gunzip", ["-c", archivePath], {
        outStream: fs.createWriteStream(outputFile),
        silent: true,
      });
    } else if (fileName.endsWith(".zip")) {
      // Extract zip files
      logger.debug(`Extracting zip file: ${archivePath}`);
      await exec.exec(
        "unzip",
        ["-q", "-o", archivePath, "-d", tempExtractDir],
        {
          silent: true,
        },
      );
    }

    // Scan the extracted contents
    const scanResult = await scanDirectory(
      tempExtractDir,
      relativeArchivePath,
      logger,
      depth + 1,
    );
    result.scannedFiles += scanResult.scannedFiles;
    result.findings.push(...scanResult.findings);

    // Clean up extracted files
    fs.rmSync(tempExtractDir, { recursive: true, force: true });
  } catch (e) {
    logger.debug(
      `Could not extract or scan archive file ${archivePath}: ${getErrorMessage(e)}`,
    );
  }

  return result;
}

/**
 * Scans a single file, including recursive archive extraction if applicable.
 *
 * @param fullPath Full path to the file
 * @param relativePath Relative path for display
 * @param extractDir Directory to use for extraction (for archive files)
 * @param logger Logger instance
 * @param depth Current recursion depth
 * @returns Scan results
 */
async function scanFile(
  fullPath: string,
  relativePath: string,
  extractDir: string,
  logger: Logger,
  depth: number = 0,
): Promise<ScanResult> {
  const result: ScanResult = {
    scannedFiles: 1,
    findings: [],
  };

  // Check if it's an archive file and recursively scan it
  const fileName = path.basename(fullPath).toLowerCase();
  const isArchive =
    fileName.endsWith(".zip") ||
    fileName.endsWith(".tar.gz") ||
    fileName.endsWith(".tgz") ||
    fileName.endsWith(".tar.zst") ||
    fileName.endsWith(".zst") ||
    fileName.endsWith(".gz");

  if (isArchive) {
    const archiveResult = await scanArchiveFile(
      fullPath,
      relativePath,
      extractDir,
      logger,
      depth,
    );
    result.scannedFiles += archiveResult.scannedFiles;
    result.findings.push(...archiveResult.findings);
  }

  // Scan the file itself for tokens (unless it's a pure binary archive format)
  const fileFindings = scanFileForTokens(fullPath, relativePath, logger);
  result.findings.push(...fileFindings);

  return result;
}

/**
 * Recursively scans a directory for GitHub tokens.
 *
 * @param dirPath Directory path to scan
 * @param baseRelativePath Base relative path for computing display paths
 * @param logger Logger instance
 * @param depth Current recursion depth
 * @returns Scan results
 */
async function scanDirectory(
  dirPath: string,
  baseRelativePath: string,
  logger: Logger,
  depth: number = 0,
): Promise<ScanResult> {
  const result: ScanResult = {
    scannedFiles: 0,
    findings: [],
  };

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.join(baseRelativePath, entry.name);

    if (entry.isDirectory()) {
      const subResult = await scanDirectory(
        fullPath,
        relativePath,
        logger,
        depth,
      );
      result.scannedFiles += subResult.scannedFiles;
      result.findings.push(...subResult.findings);
    } else if (entry.isFile()) {
      const fileResult = await scanFile(
        fullPath,
        relativePath,
        path.dirname(fullPath),
        logger,
        depth,
      );
      result.scannedFiles += fileResult.scannedFiles;
      result.findings.push(...fileResult.findings);
    }
  }

  return result;
}

/**
 * Scans a list of files and directories for GitHub tokens.
 * Recursively extracts and scans archive files (.zip, .gz, .tar.gz).
 *
 * @param filesToScan List of file paths to scan
 * @param logger Logger instance
 * @returns Scan results
 */
export async function scanArtifactsForTokens(
  filesToScan: string[],
  logger: Logger,
): Promise<void> {
  logger.info(
    "Starting best-effort check for potential GitHub tokens in debug artifacts (for testing purposes only)...",
  );

  const result: ScanResult = {
    scannedFiles: 0,
    findings: [],
  };

  // Create a temporary directory for extraction
  const tempScanDir = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-scan-"));

  try {
    for (const filePath of filesToScan) {
      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath);

      if (stats.isDirectory()) {
        const dirResult = await scanDirectory(filePath, fileName, logger);
        result.scannedFiles += dirResult.scannedFiles;
        result.findings.push(...dirResult.findings);
      } else if (stats.isFile()) {
        const fileResult = await scanFile(
          filePath,
          fileName,
          tempScanDir,
          logger,
        );
        result.scannedFiles += fileResult.scannedFiles;
        result.findings.push(...fileResult.findings);
      }
    }

    // Compute statistics from findings
    const tokenTypesCounts = new Map<string, number>();
    const filesWithTokens = new Set<string>();
    for (const finding of result.findings) {
      tokenTypesCounts.set(
        finding.tokenType,
        (tokenTypesCounts.get(finding.tokenType) || 0) + 1,
      );
      filesWithTokens.add(finding.filePath);
    }

    const tokenTypesSummary = Array.from(tokenTypesCounts.entries())
      .map(([type, count]) => `${count} ${type}${count > 1 ? "s" : ""}`)
      .join(", ");

    const baseSummary = `scanned ${result.scannedFiles} files, found ${result.findings.length} potential token(s) in ${filesWithTokens.size} file(s)`;
    const summaryWithTypes = tokenTypesSummary
      ? `${baseSummary} (${tokenTypesSummary})`
      : baseSummary;

    logger.info(`Artifact check complete: ${summaryWithTypes}`);

    if (result.findings.length > 0) {
      const fileList = Array.from(filesWithTokens).join(", ");
      throw new Error(
        `Found ${result.findings.length} potential GitHub token(s) (${tokenTypesSummary}) in debug artifacts at: ${fileList}. This is a best-effort check for testing purposes only.`,
      );
    }
  } finally {
    // Clean up temporary directory
    try {
      fs.rmSync(tempScanDir, { recursive: true, force: true });
    } catch (e) {
      logger.debug(
        `Could not clean up temporary scan directory: ${getErrorMessage(e)}`,
      );
    }
  }
}
