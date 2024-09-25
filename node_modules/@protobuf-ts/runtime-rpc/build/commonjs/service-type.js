"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceType = void 0;
const reflection_info_1 = require("./reflection-info");
class ServiceType {
    constructor(typeName, methods, options) {
        this.typeName = typeName;
        this.methods = methods.map(i => reflection_info_1.normalizeMethodInfo(i, this));
        this.options = options !== null && options !== void 0 ? options : {};
    }
}
exports.ServiceType = ServiceType;
