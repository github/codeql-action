import { DownloadArtifactOptions, DownloadArtifactResponse, StreamExtractResponse } from '../shared/interfaces';
export declare function streamExtractExternal(url: string, directory: string): Promise<StreamExtractResponse>;
export declare function downloadArtifactPublic(artifactId: number, repositoryOwner: string, repositoryName: string, token: string, options?: DownloadArtifactOptions): Promise<DownloadArtifactResponse>;
export declare function downloadArtifactInternal(artifactId: number, options?: DownloadArtifactOptions): Promise<DownloadArtifactResponse>;
