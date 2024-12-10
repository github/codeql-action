import { BlobUploadCommonResponse } from '@azure/storage-blob';
import { TransferProgressEvent } from '@azure/ms-rest-js';
import { UploadOptions } from '../options';
/**
 * Class for tracking the upload state and displaying stats.
 */
export declare class UploadProgress {
    contentLength: number;
    sentBytes: number;
    startTime: number;
    displayedComplete: boolean;
    timeoutHandle?: ReturnType<typeof setTimeout>;
    constructor(contentLength: number);
    /**
     * Sets the number of bytes sent
     *
     * @param sentBytes the number of bytes sent
     */
    setSentBytes(sentBytes: number): void;
    /**
     * Returns the total number of bytes transferred.
     */
    getTransferredBytes(): number;
    /**
     * Returns true if the upload is complete.
     */
    isDone(): boolean;
    /**
     * Prints the current upload stats. Once the upload completes, this will print one
     * last line and then stop.
     */
    display(): void;
    /**
     * Returns a function used to handle TransferProgressEvents.
     */
    onProgress(): (progress: TransferProgressEvent) => void;
    /**
     * Starts the timer that displays the stats.
     *
     * @param delayInMs the delay between each write
     */
    startDisplayTimer(delayInMs?: number): void;
    /**
     * Stops the timer that displays the stats. As this typically indicates the upload
     * is complete, this will display one last line, unless the last line has already
     * been written.
     */
    stopDisplayTimer(): void;
}
/**
 * Uploads a cache archive directly to Azure Blob Storage using the Azure SDK.
 * This function will display progress information to the console. Concurrency of the
 * upload is determined by the calling functions.
 *
 * @param signedUploadURL
 * @param archivePath
 * @param options
 * @returns
 */
export declare function uploadCacheArchiveSDK(signedUploadURL: string, archivePath: string, options?: UploadOptions): Promise<BlobUploadCommonResponse>;
