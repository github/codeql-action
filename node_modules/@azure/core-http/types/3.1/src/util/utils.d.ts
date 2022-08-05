import { HttpOperationResponse } from "../httpOperationResponse";
import { RestError } from "../restError";
import { WebResourceLike } from "../webResource";
/**
 * A constant that indicates whether the environment is node.js or browser based.
 */
export declare const isNode: boolean;
/**
 * Checks if a parsed URL is HTTPS
 *
 * @param urlToCheck - The url to check
 * @returns True if the URL is HTTPS; false otherwise.
 */
export declare function urlIsHTTPS(urlToCheck: {
    protocol: string;
}): boolean;
/**
 * Encodes an URI.
 *
 * @param uri - The URI to be encoded.
 * @returns The encoded URI.
 */
export declare function encodeUri(uri: string): string;
/**
 * Returns a stripped version of the Http Response which only contains body,
 * headers and the status.
 *
 * @param response - The Http Response
 * @returns The stripped version of Http Response.
 */
export declare function stripResponse(response: HttpOperationResponse): any;
/**
 * Returns a stripped version of the Http Request that does not contain the
 * Authorization header.
 *
 * @param request - The Http Request object
 * @returns The stripped version of Http Request.
 */
export declare function stripRequest(request: WebResourceLike): WebResourceLike;
/**
 * Validates the given uuid as a string
 *
 * @param uuid - The uuid as a string that needs to be validated
 * @returns True if the uuid is valid; false otherwise.
 */
export declare function isValidUuid(uuid: string): boolean;
/**
 * Generated UUID
 *
 * @returns RFC4122 v4 UUID.
 */
export declare function generateUuid(): string;
/**
 * Executes an array of promises sequentially. Inspiration of this method is here:
 * https://pouchdb.com/2015/05/18/we-have-a-problem-with-promises.html. An awesome blog on promises!
 *
 * @param promiseFactories - An array of promise factories(A function that return a promise)
 * @param kickstart - Input to the first promise that is used to kickstart the promise chain.
 * If not provided then the promise chain starts with undefined.
 * @returns A chain of resolved or rejected promises
 */
export declare function executePromisesSequentially(promiseFactories: Array<any>, kickstart: unknown): Promise<any>;
/**
 * Service callback that is returned for REST requests initiated by the service client.
 */
export interface ServiceCallback<TResult> {
    /**
     * A method that will be invoked as a callback to a service function.
     * @param err - The error occurred if any, while executing the request; otherwise null.
     * @param result - The deserialized response body if an error did not occur.
     * @param request - The raw/actual request sent to the server if an error did not occur.
     * @param response - The raw/actual response from the server if an error did not occur.
     */
    (err: Error | RestError | null, result?: TResult, request?: WebResourceLike, response?: HttpOperationResponse): void;
}
/**
 * Converts a Promise to a callback.
 * @param promise - The Promise to be converted to a callback
 * @returns A function that takes the callback `(cb: Function) => void`
 * @deprecated generated code should instead depend on responseToBody
 */
export declare function promiseToCallback(promise: Promise<any>): (cb: Function) => void;
/**
 * Converts a Promise to a service callback.
 * @param promise - The Promise of HttpOperationResponse to be converted to a service callback
 * @returns A function that takes the service callback (cb: ServiceCallback<T>): void
 */
export declare function promiseToServiceCallback<T>(promise: Promise<HttpOperationResponse>): (cb: ServiceCallback<T>) => void;
export declare function prepareXMLRootList(obj: unknown, elementName: string, xmlNamespaceKey?: string, xmlNamespace?: string): {
    [s: string]: any;
};
/**
 * Applies the properties on the prototype of sourceCtors to the prototype of targetCtor
 * @param targetCtor - The target object on which the properties need to be applied.
 * @param sourceCtors - An array of source objects from which the properties need to be taken.
 */
export declare function applyMixins(targetCtorParam: unknown, sourceCtors: any[]): void;
/**
 * Indicates whether the given string is in ISO 8601 format.
 * @param value - The value to be validated for ISO 8601 duration format.
 * @returns `true` if valid, `false` otherwise.
 */
export declare function isDuration(value: string): boolean;
/**
 * Replace all of the instances of searchValue in value with the provided replaceValue.
 * @param value - The value to search and replace in.
 * @param searchValue - The value to search for in the value argument.
 * @param replaceValue - The value to replace searchValue with in the value argument.
 * @returns The value where each instance of searchValue was replaced with replacedValue.
 */
export declare function replaceAll(value: string | undefined, searchValue: string, replaceValue: string): string | undefined;
/**
 * Determines whether the given entity is a basic/primitive type
 * (string, number, boolean, null, undefined).
 * @param value - Any entity
 * @returns true is it is primitive type, false otherwise.
 */
export declare function isPrimitiveType(value: unknown): boolean;
export declare function getEnvironmentValue(name: string): string | undefined;
/**
 * @internal
 */
export declare type UnknownObject = {
    [s: string]: unknown;
};
/**
 * @internal
 * @returns true when input is an object type that is not null, Array, RegExp, or Date.
 */
export declare function isObject(input: unknown): input is UnknownObject;
//# sourceMappingURL=utils.d.ts.map
