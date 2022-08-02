// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { RestError } from "@azure/core-http";
export * from "./BlobServiceClient";
export * from "./Clients";
export * from "./ContainerClient";
export * from "./BlobLeaseClient";
export * from "./BlobBatch";
export * from "./BlobBatchClient";
export * from "./BatchResponse";
export * from "./StorageBrowserPolicyFactory";
export * from "./credentials/AnonymousCredential";
export * from "./credentials/Credential";
export { BlockBlobTier, PremiumPageBlobTier, } from "./models";
export * from "./Pipeline";
export * from "./policies/AnonymousCredentialPolicy";
export * from "./policies/CredentialPolicy";
export * from "./StorageRetryPolicyFactory";
export * from "./generatedModels";
export { RestError };
export { logger } from "./log";
//# sourceMappingURL=index.browser.js.map