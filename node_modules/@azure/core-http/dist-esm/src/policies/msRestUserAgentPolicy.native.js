// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
const { Platform } = require("react-native"); // eslint-disable-line import/no-extraneous-dependencies, @typescript-eslint/no-require-imports
export function getDefaultUserAgentKey() {
    return "x-ms-useragent";
}
export function getPlatformSpecificData() {
    const { major, minor, patch } = Platform.constants.reactNativeVersion;
    const runtimeInfo = {
        key: "react-native",
        value: `${major}.${minor}.${patch}`,
    };
    const osInfo = {
        key: "OS",
        value: `${Platform.OS}-${Platform.Version}`,
    };
    return [runtimeInfo, osInfo];
}
//# sourceMappingURL=msRestUserAgentPolicy.native.js.map