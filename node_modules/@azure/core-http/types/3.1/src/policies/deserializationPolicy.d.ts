import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptions } from "./requestPolicy";
import { SerializerOptions } from "../util/serializer.common";
import { HttpOperationResponse } from "../httpOperationResponse";
import { WebResourceLike } from "../webResource";
/**
 * Options to configure API response deserialization.
 */
export interface DeserializationOptions {
    /**
     * Configures the expected content types for the deserialization of
     * JSON and XML response bodies.
     */
    expectedContentTypes: DeserializationContentTypes;
}
/**
 * The content-types that will indicate that an operation response should be deserialized in a
 * particular way.
 */
export interface DeserializationContentTypes {
    /**
     * The content-types that indicate that an operation response should be deserialized as JSON.
     * Defaults to [ "application/json", "text/json" ].
     */
    json?: string[];
    /**
     * The content-types that indicate that an operation response should be deserialized as XML.
     * Defaults to [ "application/xml", "application/atom+xml" ].
     */
    xml?: string[];
}
/**
 * Create a new serialization RequestPolicyCreator that will serialized HTTP request bodies as they
 * pass through the HTTP pipeline.
 */
export declare function deserializationPolicy(deserializationContentTypes?: DeserializationContentTypes, parsingOptions?: SerializerOptions): RequestPolicyFactory;
export declare const defaultJsonContentTypes: string[];
export declare const defaultXmlContentTypes: string[];
export declare const DefaultDeserializationOptions: DeserializationOptions;
/**
 * A RequestPolicy that will deserialize HTTP response bodies and headers as they pass through the
 * HTTP pipeline.
 */
export declare class DeserializationPolicy extends BaseRequestPolicy {
    readonly jsonContentTypes: string[];
    readonly xmlContentTypes: string[];
    readonly xmlCharKey: string;
    constructor(nextPolicy: RequestPolicy, requestPolicyOptions: RequestPolicyOptions, deserializationContentTypes?: DeserializationContentTypes, parsingOptions?: SerializerOptions);
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
}
/**
 * Given a particular set of content types to parse as either JSON or XML, consumes the HTTP response to produce the result object defined by the request's {@link OperationSpec}.
 * @param jsonContentTypes - Response content types to parse the body as JSON.
 * @param xmlContentTypes  - Response content types to parse the body as XML.
 * @param response - HTTP Response from the pipeline.
 * @param options  - Options to the serializer, mostly for configuring the XML parser if needed.
 * @returns A parsed {@link HttpOperationResponse} object that can be returned by the {@link ServiceClient}.
 */
export declare function deserializeResponseBody(jsonContentTypes: string[], xmlContentTypes: string[], response: HttpOperationResponse, options?: SerializerOptions): Promise<HttpOperationResponse>;
//# sourceMappingURL=deserializationPolicy.d.ts.map
