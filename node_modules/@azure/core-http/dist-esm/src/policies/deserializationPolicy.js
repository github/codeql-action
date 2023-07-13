// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { BaseRequestPolicy, } from "./requestPolicy";
import { XML_CHARKEY } from "../util/serializer.common";
import { MapperType } from "../serializer";
import { RestError } from "../restError";
import { parseXML } from "../util/xml";
/**
 * Create a new serialization RequestPolicyCreator that will serialized HTTP request bodies as they
 * pass through the HTTP pipeline.
 */
export function deserializationPolicy(deserializationContentTypes, parsingOptions) {
    return {
        create: (nextPolicy, options) => {
            return new DeserializationPolicy(nextPolicy, options, deserializationContentTypes, parsingOptions);
        },
    };
}
export const defaultJsonContentTypes = ["application/json", "text/json"];
export const defaultXmlContentTypes = ["application/xml", "application/atom+xml"];
export const DefaultDeserializationOptions = {
    expectedContentTypes: {
        json: defaultJsonContentTypes,
        xml: defaultXmlContentTypes,
    },
};
/**
 * A RequestPolicy that will deserialize HTTP response bodies and headers as they pass through the
 * HTTP pipeline.
 */
export class DeserializationPolicy extends BaseRequestPolicy {
    constructor(nextPolicy, requestPolicyOptions, deserializationContentTypes, parsingOptions = {}) {
        var _a;
        super(nextPolicy, requestPolicyOptions);
        this.jsonContentTypes =
            (deserializationContentTypes && deserializationContentTypes.json) || defaultJsonContentTypes;
        this.xmlContentTypes =
            (deserializationContentTypes && deserializationContentTypes.xml) || defaultXmlContentTypes;
        this.xmlCharKey = (_a = parsingOptions.xmlCharKey) !== null && _a !== void 0 ? _a : XML_CHARKEY;
    }
    async sendRequest(request) {
        return this._nextPolicy.sendRequest(request).then((response) => deserializeResponseBody(this.jsonContentTypes, this.xmlContentTypes, response, {
            xmlCharKey: this.xmlCharKey,
        }));
    }
}
function getOperationResponse(parsedResponse) {
    let result;
    const request = parsedResponse.request;
    const operationSpec = request.operationSpec;
    if (operationSpec) {
        const operationResponseGetter = request.operationResponseGetter;
        if (!operationResponseGetter) {
            result = operationSpec.responses[parsedResponse.status];
        }
        else {
            result = operationResponseGetter(operationSpec, parsedResponse);
        }
    }
    return result;
}
function shouldDeserializeResponse(parsedResponse) {
    const shouldDeserialize = parsedResponse.request.shouldDeserialize;
    let result;
    if (shouldDeserialize === undefined) {
        result = true;
    }
    else if (typeof shouldDeserialize === "boolean") {
        result = shouldDeserialize;
    }
    else {
        result = shouldDeserialize(parsedResponse);
    }
    return result;
}
/**
 * Given a particular set of content types to parse as either JSON or XML, consumes the HTTP response to produce the result object defined by the request's {@link OperationSpec}.
 * @param jsonContentTypes - Response content types to parse the body as JSON.
 * @param xmlContentTypes  - Response content types to parse the body as XML.
 * @param response - HTTP Response from the pipeline.
 * @param options  - Options to the serializer, mostly for configuring the XML parser if needed.
 * @returns A parsed {@link HttpOperationResponse} object that can be returned by the {@link ServiceClient}.
 */
export function deserializeResponseBody(jsonContentTypes, xmlContentTypes, response, options = {}) {
    var _a, _b, _c;
    const updatedOptions = {
        rootName: (_a = options.rootName) !== null && _a !== void 0 ? _a : "",
        includeRoot: (_b = options.includeRoot) !== null && _b !== void 0 ? _b : false,
        xmlCharKey: (_c = options.xmlCharKey) !== null && _c !== void 0 ? _c : XML_CHARKEY,
    };
    return parse(jsonContentTypes, xmlContentTypes, response, updatedOptions).then((parsedResponse) => {
        if (!shouldDeserializeResponse(parsedResponse)) {
            return parsedResponse;
        }
        const operationSpec = parsedResponse.request.operationSpec;
        if (!operationSpec || !operationSpec.responses) {
            return parsedResponse;
        }
        const responseSpec = getOperationResponse(parsedResponse);
        const { error, shouldReturnResponse } = handleErrorResponse(parsedResponse, operationSpec, responseSpec);
        if (error) {
            throw error;
        }
        else if (shouldReturnResponse) {
            return parsedResponse;
        }
        // An operation response spec does exist for current status code, so
        // use it to deserialize the response.
        if (responseSpec) {
            if (responseSpec.bodyMapper) {
                let valueToDeserialize = parsedResponse.parsedBody;
                if (operationSpec.isXML && responseSpec.bodyMapper.type.name === MapperType.Sequence) {
                    valueToDeserialize =
                        typeof valueToDeserialize === "object"
                            ? valueToDeserialize[responseSpec.bodyMapper.xmlElementName]
                            : [];
                }
                try {
                    parsedResponse.parsedBody = operationSpec.serializer.deserialize(responseSpec.bodyMapper, valueToDeserialize, "operationRes.parsedBody", options);
                }
                catch (innerError) {
                    const restError = new RestError(`Error ${innerError} occurred in deserializing the responseBody - ${parsedResponse.bodyAsText}`, undefined, parsedResponse.status, parsedResponse.request, parsedResponse);
                    throw restError;
                }
            }
            else if (operationSpec.httpMethod === "HEAD") {
                // head methods never have a body, but we return a boolean to indicate presence/absence of the resource
                parsedResponse.parsedBody = response.status >= 200 && response.status < 300;
            }
            if (responseSpec.headersMapper) {
                parsedResponse.parsedHeaders = operationSpec.serializer.deserialize(responseSpec.headersMapper, parsedResponse.headers.toJson(), "operationRes.parsedHeaders", options);
            }
        }
        return parsedResponse;
    });
}
function isOperationSpecEmpty(operationSpec) {
    const expectedStatusCodes = Object.keys(operationSpec.responses);
    return (expectedStatusCodes.length === 0 ||
        (expectedStatusCodes.length === 1 && expectedStatusCodes[0] === "default"));
}
function handleErrorResponse(parsedResponse, operationSpec, responseSpec) {
    var _a;
    const isSuccessByStatus = 200 <= parsedResponse.status && parsedResponse.status < 300;
    const isExpectedStatusCode = isOperationSpecEmpty(operationSpec)
        ? isSuccessByStatus
        : !!responseSpec;
    if (isExpectedStatusCode) {
        if (responseSpec) {
            if (!responseSpec.isError) {
                return { error: null, shouldReturnResponse: false };
            }
        }
        else {
            return { error: null, shouldReturnResponse: false };
        }
    }
    const errorResponseSpec = responseSpec !== null && responseSpec !== void 0 ? responseSpec : operationSpec.responses.default;
    const streaming = ((_a = parsedResponse.request.streamResponseStatusCodes) === null || _a === void 0 ? void 0 : _a.has(parsedResponse.status)) ||
        parsedResponse.request.streamResponseBody;
    const initialErrorMessage = streaming
        ? `Unexpected status code: ${parsedResponse.status}`
        : parsedResponse.bodyAsText;
    const error = new RestError(initialErrorMessage, undefined, parsedResponse.status, parsedResponse.request, parsedResponse);
    // If the item failed but there's no error spec or default spec to deserialize the error,
    // we should fail so we just throw the parsed response
    if (!errorResponseSpec) {
        throw error;
    }
    const defaultBodyMapper = errorResponseSpec.bodyMapper;
    const defaultHeadersMapper = errorResponseSpec.headersMapper;
    try {
        // If error response has a body, try to deserialize it using default body mapper.
        // Then try to extract error code & message from it
        if (parsedResponse.parsedBody) {
            const parsedBody = parsedResponse.parsedBody;
            let parsedError;
            if (defaultBodyMapper) {
                let valueToDeserialize = parsedBody;
                if (operationSpec.isXML && defaultBodyMapper.type.name === MapperType.Sequence) {
                    valueToDeserialize =
                        typeof parsedBody === "object" ? parsedBody[defaultBodyMapper.xmlElementName] : [];
                }
                parsedError = operationSpec.serializer.deserialize(defaultBodyMapper, valueToDeserialize, "error.response.parsedBody");
            }
            const internalError = parsedBody.error || parsedError || parsedBody;
            error.code = internalError.code;
            if (internalError.message) {
                error.message = internalError.message;
            }
            if (defaultBodyMapper) {
                error.response.parsedBody = parsedError;
            }
        }
        // If error response has headers, try to deserialize it using default header mapper
        if (parsedResponse.headers && defaultHeadersMapper) {
            error.response.parsedHeaders = operationSpec.serializer.deserialize(defaultHeadersMapper, parsedResponse.headers.toJson(), "operationRes.parsedHeaders");
        }
    }
    catch (defaultError) {
        error.message = `Error "${defaultError.message}" occurred in deserializing the responseBody - "${parsedResponse.bodyAsText}" for the default response.`;
    }
    return { error, shouldReturnResponse: false };
}
function parse(jsonContentTypes, xmlContentTypes, operationResponse, opts) {
    var _a;
    const errorHandler = (err) => {
        const msg = `Error "${err}" occurred while parsing the response body - ${operationResponse.bodyAsText}.`;
        const errCode = err.code || RestError.PARSE_ERROR;
        const e = new RestError(msg, errCode, operationResponse.status, operationResponse.request, operationResponse);
        return Promise.reject(e);
    };
    const streaming = ((_a = operationResponse.request.streamResponseStatusCodes) === null || _a === void 0 ? void 0 : _a.has(operationResponse.status)) ||
        operationResponse.request.streamResponseBody;
    if (!streaming && operationResponse.bodyAsText) {
        const text = operationResponse.bodyAsText;
        const contentType = operationResponse.headers.get("Content-Type") || "";
        const contentComponents = !contentType
            ? []
            : contentType.split(";").map((component) => component.toLowerCase());
        if (contentComponents.length === 0 ||
            contentComponents.some((component) => jsonContentTypes.indexOf(component) !== -1)) {
            return new Promise((resolve) => {
                operationResponse.parsedBody = JSON.parse(text);
                resolve(operationResponse);
            }).catch(errorHandler);
        }
        else if (contentComponents.some((component) => xmlContentTypes.indexOf(component) !== -1)) {
            return parseXML(text, opts)
                .then((body) => {
                operationResponse.parsedBody = body;
                return operationResponse;
            })
                .catch(errorHandler);
        }
    }
    return Promise.resolve(operationResponse);
}
//# sourceMappingURL=deserializationPolicy.js.map