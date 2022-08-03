// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
export function getDefaultUserAgentKey() {
    return "x-ms-useragent";
}
export function getPlatformSpecificData() {
    const navigator = self.navigator;
    const osInfo = {
        key: "OS",
        value: (navigator.oscpu || navigator.platform).replace(" ", ""),
    };
    return [osInfo];
}
//# sourceMappingURL=msRestUserAgentPolicy.browser.js.map