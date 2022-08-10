// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { BaseRequestPolicy, } from "./requestPolicy";
import { getDefaultUserAgentKey, getPlatformSpecificData } from "./msRestUserAgentPolicy";
import { Constants } from "../util/constants";
import { HttpHeaders } from "../httpHeaders";
function getRuntimeInfo() {
    const msRestRuntime = {
        key: "core-http",
        value: Constants.coreHttpVersion,
    };
    return [msRestRuntime];
}
function getUserAgentString(telemetryInfo, keySeparator = " ", valueSeparator = "/") {
    return telemetryInfo
        .map((info) => {
        const value = info.value ? `${valueSeparator}${info.value}` : "";
        return `${info.key}${value}`;
    })
        .join(keySeparator);
}
export const getDefaultUserAgentHeaderName = getDefaultUserAgentKey;
/**
 * The default approach to generate user agents.
 * Uses static information from this package, plus system information available from the runtime.
 */
export function getDefaultUserAgentValue() {
    const runtimeInfo = getRuntimeInfo();
    const platformSpecificData = getPlatformSpecificData();
    const userAgent = getUserAgentString(runtimeInfo.concat(platformSpecificData));
    return userAgent;
}
/**
 * Returns a policy that adds the user agent header to outgoing requests based on the given {@link TelemetryInfo}.
 * @param userAgentData - Telemetry information.
 * @returns A new {@link UserAgentPolicy}.
 */
export function userAgentPolicy(userAgentData) {
    const key = !userAgentData || userAgentData.key === undefined || userAgentData.key === null
        ? getDefaultUserAgentKey()
        : userAgentData.key;
    const value = !userAgentData || userAgentData.value === undefined || userAgentData.value === null
        ? getDefaultUserAgentValue()
        : userAgentData.value;
    return {
        create: (nextPolicy, options) => {
            return new UserAgentPolicy(nextPolicy, options, key, value);
        },
    };
}
/**
 * A policy that adds the user agent header to outgoing requests based on the given {@link TelemetryInfo}.
 */
export class UserAgentPolicy extends BaseRequestPolicy {
    constructor(_nextPolicy, _options, headerKey, headerValue) {
        super(_nextPolicy, _options);
        this._nextPolicy = _nextPolicy;
        this._options = _options;
        this.headerKey = headerKey;
        this.headerValue = headerValue;
    }
    sendRequest(request) {
        this.addUserAgentHeader(request);
        return this._nextPolicy.sendRequest(request);
    }
    /**
     * Adds the user agent header to the outgoing request.
     */
    addUserAgentHeader(request) {
        if (!request.headers) {
            request.headers = new HttpHeaders();
        }
        if (!request.headers.get(this.headerKey) && this.headerValue) {
            request.headers.set(this.headerKey, this.headerValue);
        }
    }
}
//# sourceMappingURL=userAgentPolicy.js.map