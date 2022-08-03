// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { MapperType } from "./serializer";
/**
 * Gets the list of status codes for streaming responses.
 * @internal
 */
export function getStreamResponseStatusCodes(operationSpec) {
    const result = new Set();
    for (const statusCode in operationSpec.responses) {
        const operationResponse = operationSpec.responses[statusCode];
        if (operationResponse.bodyMapper &&
            operationResponse.bodyMapper.type.name === MapperType.Stream) {
            result.add(Number(statusCode));
        }
    }
    return result;
}
//# sourceMappingURL=operationSpec.js.map