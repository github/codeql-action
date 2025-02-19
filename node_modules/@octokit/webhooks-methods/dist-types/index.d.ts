export { sign } from "./node/sign.js";
import { verify } from "./node/verify.js";
export { verify };
export declare function verifyWithFallback(secret: string, payload: string, signature: string, additionalSecrets: undefined | string[]): Promise<any>;
