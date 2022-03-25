"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.create = void 0;
const artifact_client_1 = require("./internal/artifact-client");
/**
 * Constructs an ArtifactClient
 */
function create() {
    return artifact_client_1.DefaultArtifactClient.create();
}
exports.create = create;
//# sourceMappingURL=artifact-client.js.map