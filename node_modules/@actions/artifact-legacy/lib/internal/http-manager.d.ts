import { HttpClient } from '@actions/http-client';
/**
 * Used for managing http clients during either upload or download
 */
export declare class HttpManager {
    private clients;
    private userAgent;
    constructor(clientCount: number, userAgent: string);
    getClient(index: number): HttpClient;
    disposeAndReplaceClient(index: number): void;
    disposeAndReplaceAllClients(): void;
}
