// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { DefaultHttpClient } from "./defaultHttpClient";
let cachedHttpClient;
export function getCachedDefaultHttpClient() {
    if (!cachedHttpClient) {
        cachedHttpClient = new DefaultHttpClient();
    }
    return cachedHttpClient;
}
//# sourceMappingURL=httpClientCache.js.map