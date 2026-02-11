export interface UploadPayload {
  commit_oid: string;
  ref: string;
  analysis_key?: string;
  analysis_name?: string;
  sarif: string;
  workflow_run_id: number;
  workflow_run_attempt: number;
  checkout_uri: string;
  environment?: string;
  started_at?: string;
  tool_names: string[];
  base_ref?: string;
  base_sha?: string;
}

export interface AssessmentPayload extends UploadPayload {
  assessment_id: string;
}
