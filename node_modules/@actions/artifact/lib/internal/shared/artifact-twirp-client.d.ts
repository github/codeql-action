import { ArtifactServiceClientJSON } from '../../generated';
export declare function internalArtifactTwirpClient(options?: {
    maxAttempts?: number;
    retryIntervalMs?: number;
    retryMultiplier?: number;
}): ArtifactServiceClientJSON;
