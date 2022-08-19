// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { BaseRequestPolicy, deserializationPolicy, disableResponseDecompressionPolicy, HttpHeaders, RequestPolicyOptions, WebResource, proxyPolicy, isNode, isTokenCredential, tracingPolicy, logPolicy, keepAlivePolicy, generateClientRequestIdPolicy, } from "@azure/core-http";
import { logger } from "./log";
import { StorageBrowserPolicyFactory } from "./StorageBrowserPolicyFactory";
import { StorageRetryPolicyFactory } from "./StorageRetryPolicyFactory";
import { AnonymousCredential } from "./credentials/AnonymousCredential";
import { StorageOAuthScopes, StorageBlobLoggingAllowedHeaderNames, StorageBlobLoggingAllowedQueryParameters, } from "./utils/constants";
import { TelemetryPolicyFactory } from "./TelemetryPolicyFactory";
import { getCachedDefaultHttpClient } from "./utils/cache";
import { attachCredential } from "./utils/utils.common";
import { storageBearerTokenChallengeAuthenticationPolicy } from "./policies/StorageBearerTokenChallengeAuthenticationPolicy";
// Export following interfaces and types for customers who want to implement their
// own RequestPolicy or HTTPClient
export { BaseRequestPolicy, StorageOAuthScopes, deserializationPolicy, HttpHeaders, WebResource, RequestPolicyOptions, };
/**
 * A helper to decide if a given argument satisfies the Pipeline contract
 * @param pipeline - An argument that may be a Pipeline
 * @returns true when the argument satisfies the Pipeline contract
 */
export function isPipelineLike(pipeline) {
    if (!pipeline || typeof pipeline !== "object") {
        return false;
    }
    const castPipeline = pipeline;
    return (Array.isArray(castPipeline.factories) &&
        typeof castPipeline.options === "object" &&
        typeof castPipeline.toServiceClientOptions === "function");
}
/**
 * A Pipeline class containing HTTP request policies.
 * You can create a default Pipeline by calling {@link newPipeline}.
 * Or you can create a Pipeline with your own policies by the constructor of Pipeline.
 *
 * Refer to {@link newPipeline} and provided policies before implementing your
 * customized Pipeline.
 */
export class Pipeline {
    /**
     * Creates an instance of Pipeline. Customize HTTPClient by implementing IHttpClient interface.
     *
     * @param factories -
     * @param options -
     */
    constructor(factories, options = {}) {
        this.factories = factories;
        // when options.httpClient is not specified, passing in a DefaultHttpClient instance to
        // avoid each client creating its own http client.
        this.options = Object.assign(Object.assign({}, options), { httpClient: options.httpClient || getCachedDefaultHttpClient() });
    }
    /**
     * Transfer Pipeline object to ServiceClientOptions object which is required by
     * ServiceClient constructor.
     *
     * @returns The ServiceClientOptions object from this Pipeline.
     */
    toServiceClientOptions() {
        return {
            httpClient: this.options.httpClient,
            requestPolicyFactories: this.factories,
        };
    }
}
/**
 * Creates a new Pipeline object with Credential provided.
 *
 * @param credential -  Such as AnonymousCredential, StorageSharedKeyCredential or any credential from the `@azure/identity` package to authenticate requests to the service. You can also provide an object that implements the TokenCredential interface. If not specified, AnonymousCredential is used.
 * @param pipelineOptions - Optional. Options.
 * @returns A new Pipeline object.
 */
export function newPipeline(credential, pipelineOptions = {}) {
    var _a;
    if (credential === undefined) {
        credential = new AnonymousCredential();
    }
    // Order is important. Closer to the API at the top & closer to the network at the bottom.
    // The credential's policy factory must appear close to the wire so it can sign any
    // changes made by other factories (like UniqueRequestIDPolicyFactory)
    const telemetryPolicy = new TelemetryPolicyFactory(pipelineOptions.userAgentOptions);
    const factories = [
        tracingPolicy({ userAgent: telemetryPolicy.telemetryString }),
        keepAlivePolicy(pipelineOptions.keepAliveOptions),
        telemetryPolicy,
        generateClientRequestIdPolicy(),
        new StorageBrowserPolicyFactory(),
        new StorageRetryPolicyFactory(pipelineOptions.retryOptions),
        // Default deserializationPolicy is provided by protocol layer
        // Use customized XML char key of "#" so we could deserialize metadata
        // with "_" key
        deserializationPolicy(undefined, { xmlCharKey: "#" }),
        logPolicy({
            logger: logger.info,
            allowedHeaderNames: StorageBlobLoggingAllowedHeaderNames,
            allowedQueryParameters: StorageBlobLoggingAllowedQueryParameters,
        }),
    ];
    if (isNode) {
        // policies only available in Node.js runtime, not in browsers
        factories.push(proxyPolicy(pipelineOptions.proxyOptions));
        factories.push(disableResponseDecompressionPolicy());
    }
    factories.push(isTokenCredential(credential)
        ? attachCredential(storageBearerTokenChallengeAuthenticationPolicy(credential, (_a = pipelineOptions.audience) !== null && _a !== void 0 ? _a : StorageOAuthScopes), credential)
        : credential);
    return new Pipeline(factories, pipelineOptions);
}
//# sourceMappingURL=Pipeline.js.map