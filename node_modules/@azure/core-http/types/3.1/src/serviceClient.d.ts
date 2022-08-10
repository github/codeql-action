import { Mapper, Serializer } from "./serializer";
import { DeserializationContentTypes } from "./policies/deserializationPolicy";
import { HttpOperationResponse, RestResponse } from "./httpOperationResponse";
import { ParameterPath } from "./operationParameter";
import { OperationSpec } from "./operationSpec";
import { RequestPrepareOptions, WebResourceLike } from "./webResource";
import { RequestPolicyFactory } from "./policies/requestPolicy";
import { ServiceCallback } from "./util/utils";
import { TokenCredential } from "@azure/core-auth";
import { HttpClient } from "./httpClient";
import { HttpPipelineLogger } from "./httpPipelineLogger";
import { InternalPipelineOptions } from "./pipelineOptions";
import { OperationArguments } from "./operationArguments";
import { OperationResponse } from "./operationResponse";
import { ServiceClientCredentials } from "./credentials/serviceClientCredentials";
/**
 * Options to configure a proxy for outgoing requests (Node.js only).
 */
export interface ProxySettings {
    /**
     * The proxy's host address.
     */
    host: string;
    /**
     * The proxy host's port.
     */
    port: number;
    /**
     * The user name to authenticate with the proxy, if required.
     */
    username?: string;
    /**
     * The password to authenticate with the proxy, if required.
     */
    password?: string;
}
/**
 * An alias of {@link ProxySettings} for future use.
 */
export declare type ProxyOptions = ProxySettings;
/**
 * Options to be provided while creating the client.
 */
export interface ServiceClientOptions {
    /**
     * An array of factories which get called to create the RequestPolicy pipeline used to send a HTTP
     * request on the wire, or a function that takes in the defaultRequestPolicyFactories and returns
     * the requestPolicyFactories that will be used.
     */
    requestPolicyFactories?: RequestPolicyFactory[] | ((defaultRequestPolicyFactories: RequestPolicyFactory[]) => void | RequestPolicyFactory[]);
    /**
     * The HttpClient that will be used to send HTTP requests.
     */
    httpClient?: HttpClient;
    /**
     * The HttpPipelineLogger that can be used to debug RequestPolicies within the HTTP pipeline.
     */
    httpPipelineLogger?: HttpPipelineLogger;
    /**
     * If set to true, turn off the default retry policy.
     */
    noRetryPolicy?: boolean;
    /**
     * Gets or sets the retry timeout in seconds for AutomaticRPRegistration. Default value is 30.
     */
    rpRegistrationRetryTimeout?: number;
    /**
     * Whether or not to generate a client request ID header for each HTTP request.
     */
    generateClientRequestIdHeader?: boolean;
    /**
     * Whether to include credentials in CORS requests in the browser.
     * See https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/withCredentials for more information.
     */
    withCredentials?: boolean;
    /**
     * If specified, a GenerateRequestIdPolicy will be added to the HTTP pipeline that will add a
     * header to all outgoing requests with this header name and a random UUID as the request ID.
     */
    clientRequestIdHeaderName?: string;
    /**
     * The content-types that will be associated with JSON or XML serialization.
     */
    deserializationContentTypes?: DeserializationContentTypes;
    /**
     * The header name to use for the telemetry header while sending the request. If this is not
     * specified, then "User-Agent" will be used when running on Node.js and "x-ms-useragent" will
     * be used when running in a browser.
     */
    userAgentHeaderName?: string | ((defaultUserAgentHeaderName: string) => string);
    /**
     * The string to be set to the telemetry header while sending the request, or a function that
     * takes in the default user-agent string and returns the user-agent string that will be used.
     */
    userAgent?: string | ((defaultUserAgent: string) => string);
    /**
     * Proxy settings which will be used for every HTTP request (Node.js only).
     */
    proxySettings?: ProxySettings;
    /**
     * If specified, will be used to build the BearerTokenAuthenticationPolicy.
     */
    credentialScopes?: string | string[];
}
/**
 * ServiceClient sends service requests and receives responses.
 */
export declare class ServiceClient {
    /**
     * If specified, this is the base URI that requests will be made against for this ServiceClient.
     * If it is not specified, then all OperationSpecs must contain a baseUrl property.
     */
    protected baseUri?: string;
    /**
     * The default request content type for the service.
     * Used if no requestContentType is present on an OperationSpec.
     */
    protected requestContentType?: string;
    /**
     * The HTTP client that will be used to send requests.
     */
    private readonly _httpClient;
    private readonly _requestPolicyOptions;
    private readonly _requestPolicyFactories;
    private readonly _withCredentials;
    /**
     * The ServiceClient constructor
     * @param credentials - The credentials used for authentication with the service.
     * @param options - The service client options that govern the behavior of the client.
     */
    constructor(credentials?: TokenCredential | ServiceClientCredentials, options?: ServiceClientOptions);
    /**
     * Send the provided httpRequest.
     */
    sendRequest(options: RequestPrepareOptions | WebResourceLike): Promise<HttpOperationResponse>;
    /**
     * Send an HTTP request that is populated using the provided OperationSpec.
     * @param operationArguments - The arguments that the HTTP request's templated values will be populated from.
     * @param operationSpec - The OperationSpec to use to populate the httpRequest.
     * @param callback - The callback to call when the response is received.
     */
    sendOperationRequest(operationArguments: OperationArguments, operationSpec: OperationSpec, callback?: ServiceCallback<any>): Promise<RestResponse>;
}
export declare function serializeRequestBody(serviceClient: ServiceClient, httpRequest: WebResourceLike, operationArguments: OperationArguments, operationSpec: OperationSpec): void;
/**
 * Creates an HTTP pipeline based on the given options.
 * @param pipelineOptions - Defines options that are used to configure policies in the HTTP pipeline for an SDK client.
 * @param authPolicyFactory - An optional authentication policy factory to use for signing requests.
 * @returns A set of options that can be passed to create a new {@link ServiceClient}.
 */
export declare function createPipelineFromOptions(pipelineOptions: InternalPipelineOptions, authPolicyFactory?: RequestPolicyFactory): ServiceClientOptions;
export declare type PropertyParent = {
    [propertyName: string]: any;
};
/**
 * Get the property parent for the property at the provided path when starting with the provided
 * parent object.
 */
export declare function getPropertyParent(parent: PropertyParent, propertyPath: string[]): PropertyParent;
export declare function getOperationArgumentValueFromParameterPath(serviceClient: ServiceClient, operationArguments: OperationArguments, parameterPath: ParameterPath, parameterMapper: Mapper, serializer: Serializer): any;
/**
 * Parses an {@link HttpOperationResponse} into a normalized HTTP response object ({@link RestResponse}).
 * @param _response - Wrapper object for http response.
 * @param responseSpec - Mappers for how to parse the response properties.
 * @returns - A normalized response object.
 */
export declare function flattenResponse(_response: HttpOperationResponse, responseSpec: OperationResponse | undefined): RestResponse;
//# sourceMappingURL=serviceClient.d.ts.map
