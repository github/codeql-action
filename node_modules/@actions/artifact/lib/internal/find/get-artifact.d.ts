import { GetArtifactResponse } from '../shared/interfaces';
export declare function getArtifactPublic(artifactName: string, workflowRunId: number, repositoryOwner: string, repositoryName: string, token: string): Promise<GetArtifactResponse>;
export declare function getArtifactInternal(artifactName: string): Promise<GetArtifactResponse>;
