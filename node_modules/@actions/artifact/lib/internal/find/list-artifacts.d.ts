import { ListArtifactsResponse } from '../shared/interfaces';
export declare function listArtifactsPublic(workflowRunId: number, repositoryOwner: string, repositoryName: string, token: string, latest?: boolean): Promise<ListArtifactsResponse>;
export declare function listArtifactsInternal(latest?: boolean): Promise<ListArtifactsResponse>;
