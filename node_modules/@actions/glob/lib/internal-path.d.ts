/**
 * Helper class for parsing paths into segments
 */
export declare class Path {
    segments: string[];
    /**
     * Constructs a Path
     * @param itemPath Path or array of segments
     */
    constructor(itemPath: string | string[]);
    /**
     * Converts the path to it's string representation
     */
    toString(): string;
}
