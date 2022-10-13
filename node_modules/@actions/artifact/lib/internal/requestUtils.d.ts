import { HttpClientResponse } from '@actions/http-client';
export declare function retry(name: string, operation: () => Promise<HttpClientResponse>, customErrorMessages: Map<number, string>, maxAttempts: number): Promise<HttpClientResponse>;
export declare function retryHttpClientRequest(name: string, method: () => Promise<HttpClientResponse>, customErrorMessages?: Map<number, string>, maxAttempts?: number): Promise<HttpClientResponse>;
