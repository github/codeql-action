import { ContainerEntry } from './contracts';
export interface DownloadSpecification {
    rootDownloadLocation: string;
    directoryStructure: string[];
    emptyFilesToCreate: string[];
    filesToDownload: DownloadItem[];
}
export interface DownloadItem {
    sourceLocation: string;
    targetPath: string;
}
/**
 * Creates a specification for a set of files that will be downloaded
 * @param artifactName the name of the artifact
 * @param artifactEntries a set of container entries that describe that files that make up an artifact
 * @param downloadPath the path where the artifact will be downloaded to
 * @param includeRootDirectory specifies if there should be an extra directory (denoted by the artifact name) where the artifact files should be downloaded to
 */
export declare function getDownloadSpecification(artifactName: string, artifactEntries: ContainerEntry[], downloadPath: string, includeRootDirectory: boolean): DownloadSpecification;
