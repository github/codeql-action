import * as core from "@actions/core";

import type { Config } from "../config-utils";
import type { BuiltInLanguage } from "../languages";
import type { Logger } from "../logging";
import {
  ActionName,
  createStatusReportBase,
  getActionsStatus,
  sendStatusReport,
  type StatusReportBase,
} from "../status-report";
import * as util from "../util";

/**
 * Sends a status report for the `start-proxy` action indicating a successful outcome.
 *
 * @param startedAt When the action was started.
 * @param config The configuration used.
 * @param registry_types The types of registries that are configured.
 * @param logger The logger to use.
 */
export async function sendSuccessStatusReport(
  startedAt: Date,
  config: Partial<Config>,
  registry_types: string[],
  logger: Logger,
) {
  const statusReportBase = await createStatusReportBase(
    ActionName.StartProxy,
    "success",
    startedAt,
    config,
    await util.checkDiskUsage(logger),
    logger,
  );
  if (statusReportBase !== undefined) {
    const statusReport: StatusReportBase = {
      ...statusReportBase,
      registry_types: registry_types.join(","),
    };
    await sendStatusReport(statusReport);
  }
}

/**
 * Enumerates specific error types for which we have corresponding error messages that
 * are safe to include in status reports.
 */
export enum StartProxyErrorType {
  DownloadFailed,
  ExtractionFailed,
  CacheFailed,
}

/**
 * @returns The error message corresponding to the error type.
 */
export function getStartProxyErrorMessage(
  errorType: StartProxyErrorType,
): string {
  switch (errorType) {
    case StartProxyErrorType.DownloadFailed:
      return "Failed to download proxy archive.";
    case StartProxyErrorType.ExtractionFailed:
      return "Failed to extract proxy archive.";
    case StartProxyErrorType.CacheFailed:
      return "Failed to add proxy to toolcache";
  }
}

/**
 * We want to avoid accidentally leaking secrets that may be contained in exception
 * messages in the `start-proxy` action. Consequently, we don't report the messages
 * of arbitrary exceptions. This type of error ensures that the message is one from
 * `StartProxyErrorType` and therefore safe to include in a status report.
 */
export class StartProxyError extends Error {
  public readonly errorType: StartProxyErrorType;

  constructor(errorType: StartProxyErrorType) {
    super();
    this.errorType = errorType;
  }
}

/**
 * Returns an error message for `error` that can safely be reported in a status report,
 * i.e. that does not contain sensitive information.
 *
 * @param error The error for which to get an error message.
 */
export function getSafeErrorMessage(error: Error): string {
  // If the error is a `StartProxyError`, resolve the error type to the corresponding
  // error message.
  if (error instanceof StartProxyError) {
    return getStartProxyErrorMessage(error.errorType);
  }

  // Otherwise, omit the actual error message.
  return `Error from start-proxy Action omitted (${error.constructor.name}).`;
}

/**
 * Sends a status report for the `start-proxy` action indicating a failure.
 *
 * @param logger The logger to use.
 * @param startedAt When the action was started.
 * @param language The language provided as input, if any.
 * @param unwrappedError The exception that was thrown.
 */
export async function sendFailedStatusReport(
  logger: Logger,
  startedAt: Date,
  language: BuiltInLanguage | undefined,
  unwrappedError: unknown,
) {
  const error = util.wrapError(unwrappedError);
  core.setFailed(`start-proxy action failed: ${error.message}`);

  // To avoid the possibility of leaking sensitive information into the telemetry,
  // we don't include arbitrary error messages. Instead, `getSafeErrorMessage` will
  // return a generic message that includes the type of the error, unless it can decide
  // that the message is safe to include.
  const statusReportMessage = getSafeErrorMessage(error);
  const errorStatusReportBase = await createStatusReportBase(
    ActionName.StartProxy,
    getActionsStatus(error),
    startedAt,
    {
      languages: language === undefined ? undefined : [language],
    },
    await util.checkDiskUsage(logger),
    logger,
    statusReportMessage,
  );
  if (errorStatusReportBase !== undefined) {
    await sendStatusReport(errorStatusReportBase);
  }
}
