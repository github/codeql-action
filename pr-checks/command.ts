import { execFileSync, ExecFileSyncOptions } from "node:child_process";

import { DryRunOption, REPO_ROOT } from "./config";

/** Options for {@link runCommand}. */
export interface RunCommandOptions extends DryRunOption {
  /** Options for `execFileSync`. */
  execOptions?: ExecFileSyncOptions;
}

/**
 * Runs a command, streaming output to the console by default.
 *
 * @param command The name of the command to run.
 * @param args The arguments for the command.
 * @throws When the process exits with a non-zero exit code.
 * @param options How to run the command.
 */
export function runCommand(
  command: string,
  args: string[],
  options?: RunCommandOptions,
) {
  if (!options?.dryRun) {
    console.log(`Running \`${command} ${args.join(" ")}\`.`);
    return execFileSync(command, args, {
      stdio: "inherit",
      cwd: REPO_ROOT,
      ...options?.execOptions,
    });
  } else {
    console.info(
      `[DRY RUN] Would have executed '${command} ${args.join(" ")}'`,
    );
    return "";
  }
}

/** Options for {@link runGit}. */
export interface RunGitOptions extends DryRunOption {
  /** When true, non-zero exit codes will not throw. */
  allowNonZeroExitCode?: boolean;
}

/**
 * Runs `git` with the given `args` and returns the stdout.
 *
 * @param args - Arguments to pass to `git`.
 * @param options - Optional settings.
 * @throws If `git` does not exit successfully, unless
 *         `options.allowNonZeroExitCode` is `true`.
 * @returns The trimmed stdout output.
 */
export function runGit(args: string[], options?: RunGitOptions): string {
  const execOptions: ExecFileSyncOptions = {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  };

  try {
    const result = runCommand("git", args, {
      dryRun: options?.dryRun,
      execOptions,
    }) as string;
    return result.trimEnd();
  } catch (error: unknown) {
    if (options?.allowNonZeroExitCode) {
      // execFileSync throws an object with `stdout` when the process exits
      // with a non-zero code.
      const execError = error as { stdout?: Buffer | string };
      if (typeof execError.stdout === "string") {
        return execError.stdout.trimEnd();
      }
      if (Buffer.isBuffer(execError.stdout)) {
        return execError.stdout.toString("utf8").trimEnd();
      }
      return "";
    }
    throw error;
  }
}
