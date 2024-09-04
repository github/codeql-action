import { UploadOptions } from './internal/upload-options';
import { UploadResponse } from './internal/upload-response';
import { DownloadOptions } from './internal/download-options';
import { DownloadResponse } from './internal/download-response';
import { ArtifactClient } from './internal/artifact-client';
export { ArtifactClient, UploadResponse, UploadOptions, DownloadResponse, DownloadOptions };
/**
 * Constructs an ArtifactClient
 */
export declare function create(): ArtifactClient;
