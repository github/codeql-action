export interface UploadSpecification {
    absoluteFilePath: string;
    uploadFilePath: string;
}
/**
 * Creates a specification that describes how each file that is part of the artifact will be uploaded
 * @param artifactName the name of the artifact being uploaded. Used during upload to denote where the artifact is stored on the server
 * @param rootDirectory an absolute file path that denotes the path that should be removed from the beginning of each artifact file
 * @param artifactFiles a list of absolute file paths that denote what should be uploaded as part of the artifact
 */
export declare function getUploadSpecification(artifactName: string, rootDirectory: string, artifactFiles: string[]): UploadSpecification[];
