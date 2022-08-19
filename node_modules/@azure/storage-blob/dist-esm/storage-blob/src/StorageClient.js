// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { StorageClientContext } from "./generated/src/storageClientContext";
import { escapeURLPath, getURLScheme, iEqual, getAccountNameFromUrl } from "./utils/utils.common";
import { AnonymousCredential } from "./credentials/AnonymousCredential";
import { StorageSharedKeyCredential } from "./credentials/StorageSharedKeyCredential";
import { isTokenCredential, isNode } from "@azure/core-http";
/**
 * A StorageClient represents a based URL class for {@link BlobServiceClient}, {@link ContainerClient}
 * and etc.
 */
export class StorageClient {
    /**
     * Creates an instance of StorageClient.
     * @param url - url to resource
     * @param pipeline - request policy pipeline.
     */
    constructor(url, pipeline) {
        // URL should be encoded and only once, protocol layer shouldn't encode URL again
        this.url = escapeURLPath(url);
        this.accountName = getAccountNameFromUrl(url);
        this.pipeline = pipeline;
        this.storageClientContext = new StorageClientContext(this.url, pipeline.toServiceClientOptions());
        this.isHttps = iEqual(getURLScheme(this.url) || "", "https");
        this.credential = new AnonymousCredential();
        for (const factory of this.pipeline.factories) {
            if ((isNode && factory instanceof StorageSharedKeyCredential) ||
                factory instanceof AnonymousCredential) {
                this.credential = factory;
            }
            else if (isTokenCredential(factory.credential)) {
                // Only works if the factory has been attached a "credential" property.
                // We do that in newPipeline() when using TokenCredential.
                this.credential = factory.credential;
            }
        }
        // Override protocol layer's default content-type
        const storageClientContext = this.storageClientContext;
        storageClientContext.requestContentType = undefined;
    }
}
//# sourceMappingURL=StorageClient.js.map