"use strict";
/* eslint-disable @typescript-eslint/no-namespace */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESLint = void 0;
const eslint_1 = require("eslint");
/**
 * The ESLint class is the primary class to use in Node.js applications.
 * This class depends on the Node.js fs module and the file system, so you cannot use it in browsers.
 *
 * If you want to lint code on browsers, use the Linter class instead.
 */
class ESLint extends eslint_1.ESLint {
}
exports.ESLint = ESLint;
//# sourceMappingURL=ESLint.js.map