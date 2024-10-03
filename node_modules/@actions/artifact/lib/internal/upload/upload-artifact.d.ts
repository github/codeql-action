import { UploadArtifactOptions, UploadArtifactResponse } from '../shared/interfaces';
export declare function uploadArtifact(name: string, files: string[], rootDirectory: string, options?: UploadArtifactOptions | undefined): Promise<UploadArtifactResponse>;
