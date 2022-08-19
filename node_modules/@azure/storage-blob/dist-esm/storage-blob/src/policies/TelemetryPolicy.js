// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { BaseRequestPolicy, HttpHeaders, isNode, } from "@azure/core-http";
import { HeaderConstants } from "../utils/constants";
/**
 * TelemetryPolicy is a policy used to tag user-agent header for every requests.
 */
export class TelemetryPolicy extends BaseRequestPolicy {
    /**
     * Creates an instance of TelemetryPolicy.
     * @param nextPolicy -
     * @param options -
     * @param telemetry -
     */
    constructor(nextPolicy, options, telemetry) {
        super(nextPolicy, options);
        this.telemetry = telemetry;
    }
    /**
     * Sends out request.
     *
     * @param request -
     */
    async sendRequest(request) {
        if (isNode) {
            if (!request.headers) {
                request.headers = new HttpHeaders();
            }
            if (!request.headers.get(HeaderConstants.USER_AGENT)) {
                request.headers.set(HeaderConstants.USER_AGENT, this.telemetry);
            }
        }
        return this._nextPolicy.sendRequest(request);
    }
}
//# sourceMappingURL=TelemetryPolicy.js.map