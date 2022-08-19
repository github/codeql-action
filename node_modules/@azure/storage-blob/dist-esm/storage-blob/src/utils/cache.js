// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { DefaultHttpClient } from "@azure/core-http";
const _defaultHttpClient = new DefaultHttpClient();
export function getCachedDefaultHttpClient() {
    return _defaultHttpClient;
}
//# sourceMappingURL=cache.js.map