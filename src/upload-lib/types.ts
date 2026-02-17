/**
 * Represents the minimum, common payload for SARIF upload endpoints that we support.
 */
export interface BasePayload {
  /** The gzipped contents of a SARIF file. */
  sarif: string;
}

/**
 * Represents the payload expected for Code Scanning and Code Quality SARIF uploads.
 */
export interface UploadPayload extends BasePayload {
  /** The SHA of the commit that was analysed. */
  commit_oid: string;
  /** The ref that was analysed. */
  ref: string;
  /** The analysis key that identifies the analysis. */
  analysis_key?: string;
  /** The name of the analysis. */
  analysis_name?: string;
  /** The ID of the workflow run that performed the analysis. */
  workflow_run_id: number;
  /** The attempt number. */
  workflow_run_attempt: number;
  /** The URI where the repository was checked out. */
  checkout_uri: string;
  /** The matrix value. */
  environment?: string;
  /** A string representation of when the analysis was started. */
  started_at?: string;
  /** The names of the tools that performed the analysis. */
  tool_names: string[];
  /** For a pull request, the ref of the base the PR is targeting. */
  base_ref?: string;
  /** For a pull request, the commit SHA of the merge base. */
  base_sha?: string;
}

/**
 * Represents the payload expected for Code Scanning Risk Assessment SARIF uploads.
 */
export interface AssessmentPayload extends BasePayload {
  /** The ID of the assessment for which the SARIF is for. */
  assessment_id: number;
}
