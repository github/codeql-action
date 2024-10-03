import { ZipUploadStream } from './zip';
export interface BlobUploadResponse {
    /**
     * The total reported upload size in bytes. Empty if the upload failed
     */
    uploadSize?: number;
    /**
     * The SHA256 hash of the uploaded file. Empty if the upload failed
     */
    sha256Hash?: string;
}
export declare function uploadZipToBlobStorage(authenticatedUploadURL: string, zipUploadStream: ZipUploadStream): Promise<BlobUploadResponse>;
