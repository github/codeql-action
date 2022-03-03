/**
 * Status Reporter that displays information about the progress/status of an artifact that is being uploaded or downloaded
 *
 * Variable display time that can be adjusted using the displayFrequencyInMilliseconds variable
 * The total status of the upload/download gets displayed according to this value
 * If there is a large file that is being uploaded, extra information about the individual status can also be displayed using the updateLargeFileStatus function
 */
export declare class StatusReporter {
    private totalNumberOfFilesToProcess;
    private processedCount;
    private displayFrequencyInMilliseconds;
    private largeFiles;
    private totalFileStatus;
    constructor(displayFrequencyInMilliseconds: number);
    setTotalNumberOfFilesToProcess(fileTotal: number): void;
    start(): void;
    updateLargeFileStatus(fileName: string, chunkStartIndex: number, chunkEndIndex: number, totalUploadFileSize: number): void;
    stop(): void;
    incrementProcessedCount(): void;
    private formatPercentage;
}
