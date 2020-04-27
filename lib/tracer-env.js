"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const env = {};
for (let entry of Object.entries(process.env)) {
    const key = entry[0];
    const value = entry[1];
    if (typeof value !== 'undefined' && key !== '_' && !key.startsWith('JAVA_MAIN_CLASS_')) {
        env[key] = value;
    }
}
process.stdout.write(process.argv[2]);
fs.writeFileSync(process.argv[2], JSON.stringify(env), 'utf-8');
