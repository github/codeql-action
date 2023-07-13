// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/* eslint-disable-next-line @typescript-eslint/triple-slash-reference */
/// <reference path="../dom-shim.d.ts" />
export { WebResource, } from "./webResource";
export { DefaultHttpClient } from "./defaultHttpClient";
export { HttpHeaders } from "./httpHeaders";
export { HttpPipelineLogLevel } from "./httpPipelineLogLevel";
export { RestError } from "./restError";
export { operationOptionsToRequestOptionsBase, } from "./operationOptions";
export { ServiceClient, flattenResponse, createPipelineFromOptions, } from "./serviceClient";
export { QueryCollectionFormat } from "./queryCollectionFormat";
export { Constants } from "./util/constants";
export { bearerTokenAuthenticationPolicy } from "./policies/bearerTokenAuthenticationPolicy";
export { logPolicy } from "./policies/logPolicy";
export { BaseRequestPolicy, RequestPolicyOptions, } from "./policies/requestPolicy";
export { generateClientRequestIdPolicy } from "./policies/generateClientRequestIdPolicy";
export { exponentialRetryPolicy, RetryMode } from "./policies/exponentialRetryPolicy";
export { systemErrorRetryPolicy } from "./policies/systemErrorRetryPolicy";
export { throttlingRetryPolicy } from "./policies/throttlingRetryPolicy";
export { getDefaultProxySettings, proxyPolicy } from "./policies/proxyPolicy";
export { redirectPolicy } from "./policies/redirectPolicy";
export { keepAlivePolicy } from "./policies/keepAlivePolicy";
export { disableResponseDecompressionPolicy } from "./policies/disableResponseDecompressionPolicy";
export { signingPolicy } from "./policies/signingPolicy";
export { userAgentPolicy, getDefaultUserAgentValue, } from "./policies/userAgentPolicy";
export { deserializationPolicy, deserializeResponseBody, } from "./policies/deserializationPolicy";
export { tracingPolicy } from "./policies/tracingPolicy";
export { MapperType, Serializer, serializeObject, } from "./serializer";
export { stripRequest, stripResponse, executePromisesSequentially, generateUuid, encodeUri, promiseToCallback, promiseToServiceCallback, isValidUuid, applyMixins, isDuration, } from "./util/utils";
export { isNode } from "@azure/core-util";
export { URLBuilder, URLQuery } from "./url";
export { delay } from "@azure/core-util";
// legacy exports. Use core-tracing instead (and remove on next major version update of core-http).
export { createSpanFunction } from "./createSpanLegacy";
// Credentials
export { isTokenCredential } from "@azure/core-auth";
export { ExpiringAccessTokenCache } from "./credentials/accessTokenCache";
export { AccessTokenRefresher } from "./credentials/accessTokenRefresher";
export { BasicAuthenticationCredentials } from "./credentials/basicAuthenticationCredentials";
export { ApiKeyCredentials } from "./credentials/apiKeyCredentials";
export { TopicCredentials } from "./credentials/topicCredentials";
export { parseXML, stringifyXML } from "./util/xml";
export { XML_ATTRKEY, XML_CHARKEY } from "./util/serializer.common";
//# sourceMappingURL=index.js.map