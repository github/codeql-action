export interface UploadZipSpecification {
    /**
     * An absolute source path that points to a file that will be added to a zip. Null if creating a new directory
     */
    sourcePath: string | null;
    /**
     * The destination path in a zip for a file
     */
    destinationPath: string;
}
/**
 * Checks if a root directory exists and is valid
 * @param rootDirectory an absolute root directory path common to all input files that that will be trimmed from the final zip structure
 */
export declare function validateRootDirectory(rootDirectory: string): void;
/**
 * Creates a specification that describes how a zip file will be created for a set of input files
 * @param filesToZip a list of file that should be included in the zip
 * @param rootDirectory an absolute root directory path common to all input files that that will be trimmed from the final zip structure
 */
export declare function getUploadZipSpecification(filesToZip: string[], rootDirectory: string): UploadZipSpecification[];
