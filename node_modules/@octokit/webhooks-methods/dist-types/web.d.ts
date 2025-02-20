export declare function sign(secret: string, payload: string): Promise<string>;
export declare function verify(secret: string, eventPayload: string, signature: string): Promise<boolean>;
export declare function verifyWithFallback(secret: string, payload: string, signature: string, additionalSecrets: undefined | string[]): Promise<any>;
