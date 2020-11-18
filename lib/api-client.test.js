"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const api_client_1 = require("./api-client");
ava_1.default("allowed API versions", async (t) => {
    t.is(api_client_1.apiVersionInRange("1.33.0", "1.33", "2.0"), undefined);
    t.is(api_client_1.apiVersionInRange("1.33.1", "1.33", "2.0"), undefined);
    t.is(api_client_1.apiVersionInRange("1.34.0", "1.33", "2.0"), undefined);
    t.is(api_client_1.apiVersionInRange("2.0.0", "1.33", "2.0"), undefined);
    t.is(api_client_1.apiVersionInRange("2.0.1", "1.33", "2.0"), undefined);
    t.is(api_client_1.apiVersionInRange("1.32.0", "1.33", "2.0"), api_client_1.DisallowedAPIVersionReason.ACTION_TOO_NEW);
    t.is(api_client_1.apiVersionInRange("2.1.0", "1.33", "2.0"), api_client_1.DisallowedAPIVersionReason.ACTION_TOO_OLD);
});
//# sourceMappingURL=api-client.test.js.map