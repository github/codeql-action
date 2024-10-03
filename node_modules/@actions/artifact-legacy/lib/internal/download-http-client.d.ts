/// <reference types="node" />
import * as fs from 'fs';
import { ListArtifactsResponse, QueryArtifactResponse } from './contracts';
import { HttpClientResponse } from '@actions/http-client';
import { DownloadItem } from './download-specification';
export declare class DownloadHttpClient {
    private downloadHttpManager;
    private statusReporter;
    constructor();
    /**
     * Gets a list of all artifacts that are in a specific container
     */
    listArtifacts(): Promise<ListArtifactsResponse>;
    /**
     * Fetches a set of container items that describe the contents of an artifact
     * @param artifactName the name of the artifact
     * @param containerUrl the artifact container URL for the run
     */
    getContainerItems(artifactName: string, containerUrl: string): Promise<QueryArtifactResponse>;
    /**
     * Concurrently downloads all the files that are part of an artifact
     * @param downloadItems information about what items to download and where to save them
     */
    downloadSingleArtifact(downloadItems: DownloadItem[]): Promise<void>;
    /**
     * Downloads an individual file
     * @param httpClientIndex the index of the http client that is used to make all of the calls
     * @param artifactLocation origin location where a file will be downloaded from
     * @param downloadPath destination location for the file being downloaded
     */
    private downloadIndividualFile;
    /**
     * Pipes the response from downloading an individual file to the appropriate destination stream while decoding gzip content if necessary
     * @param response the http response received when downloading a file
     * @param destinationStream the stream where the file should be written to
     * @param isGzip a boolean denoting if the content is compressed using gzip and if we need to decode it
     */
    pipeResponseToFile(response: HttpClientResponse, destinationStream: fs.WriteStream, isGzip: boolean): Promise<void>;
}
