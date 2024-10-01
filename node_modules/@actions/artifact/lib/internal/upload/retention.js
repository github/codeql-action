"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExpiration = void 0;
const generated_1 = require("../../generated");
const core = __importStar(require("@actions/core"));
function getExpiration(retentionDays) {
    if (!retentionDays) {
        return undefined;
    }
    const maxRetentionDays = getRetentionDays();
    if (maxRetentionDays && maxRetentionDays < retentionDays) {
        core.warning(`Retention days cannot be greater than the maximum allowed retention set within the repository. Using ${maxRetentionDays} instead.`);
        retentionDays = maxRetentionDays;
    }
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + retentionDays);
    return generated_1.Timestamp.fromDate(expirationDate);
}
exports.getExpiration = getExpiration;
function getRetentionDays() {
    const retentionDays = process.env['GITHUB_RETENTION_DAYS'];
    if (!retentionDays) {
        return undefined;
    }
    const days = parseInt(retentionDays);
    if (isNaN(days)) {
        return undefined;
    }
    return days;
}
//# sourceMappingURL=retention.js.map