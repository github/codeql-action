import { UploadResponse } from './upload-response';
import { UploadOptions } from './upload-options';
import { DownloadOptions } from './download-options';
import { DownloadResponse } from './download-response';
export interface ArtifactClient {
    /**
     * Uploads an artifact
     *
     * @param name the name of the artifact, required
     * @param files a list of absolute or relative paths that denote what files should be uploaded
     * @param rootDirectory an absolute or relative file path that denotes the root parent directory of the files being uploaded
     * @param options extra options for customizing the upload behavior
     * @returns single UploadInfo object
     */
    uploadArtifact(name: string, files: string[], rootDirectory: string, options?: UploadOptions): Promise<UploadResponse>;
    /**
     * Downloads a single artifact associated with a run
     *
     * @param name the name of the artifact being downloaded
     * @param path optional path that denotes where the artifact will be downloaded to
     * @param options extra options that allow for the customization of the download behavior
     */
    downloadArtifact(name: string, path?: string, options?: DownloadOptions): Promise<DownloadResponse>;
    /**
     * Downloads all artifacts associated with a run. Because there are multiple artifacts being downloaded, a folder will be created for each one in the specified or default directory
     * @param path optional path that denotes where the artifacts will be downloaded to
     */
    downloadAllArtifacts(path?: string): Promise<DownloadResponse[]>;
}
export declare class DefaultArtifactClient implements ArtifactClient {
    /**
     * Constructs a DefaultArtifactClient
     */
    static create(): DefaultArtifactClient;
    /**
     * Uploads an artifact
     */
    uploadArtifact(name: string, files: string[], rootDirectory: string, options?: UploadOptions | undefined): Promise<UploadResponse>;
    downloadArtifact(name: string, path?: string | undefined, options?: DownloadOptions | undefined): Promise<DownloadResponse>;
    downloadAllArtifacts(path?: string | undefined): Promise<DownloadResponse[]>;
}
