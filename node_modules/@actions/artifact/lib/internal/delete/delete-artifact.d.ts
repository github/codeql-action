import { DeleteArtifactResponse } from '../shared/interfaces';
export declare function deleteArtifactPublic(artifactName: string, workflowRunId: number, repositoryOwner: string, repositoryName: string, token: string): Promise<DeleteArtifactResponse>;
export declare function deleteArtifactInternal(artifactName: any): Promise<DeleteArtifactResponse>;
