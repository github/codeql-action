import { access } from 'node:fs/promises';
import { normalize, sep } from 'node:path';

declare class InvalidPathError extends Error {
    name: string;
    constructor(message?: string);
}

declare class NoMatchError extends Error {
    name: string;
    constructor(message?: string);
}

type Dependencies = {
    platform: NodeJS.Platform;
    release: string;
    fsAccess: typeof access;
    pathNormalize: typeof normalize;
    pathSep: typeof sep;
    cpExecFile: (file: string, args: ReadonlyArray<string> | undefined | null, options: {
        windowsHide: true;
    }) => Promise<{
        stdout: string;
        stderr: string;
    }>;
};

/**
 * Get the first existing parent path
 *
 * @param directoryPath - The file/folder path from where we want to know disk space
 * @param dependencies - Dependencies container
 */
declare function getFirstExistingParentPath(directoryPath: string, dependencies: Dependencies): Promise<string>;

/**
 * `free` and `size` are in bytes
 */
type DiskSpace = {
    diskPath: string;
    free: number;
    size: number;
};

/**
 * Check disk space
 *
 * @param directoryPath - The file/folder path from where we want to know disk space
 * @param dependencies - Dependencies container
 */
declare function checkDiskSpace(directoryPath: string, dependencies?: Dependencies): Promise<DiskSpace>;

export { Dependencies, DiskSpace, InvalidPathError, NoMatchError, checkDiskSpace as default, getFirstExistingParentPath };
