import { normalizeMethodInfo } from "./reflection-info";
export class ServiceType {
    constructor(typeName, methods, options) {
        this.typeName = typeName;
        this.methods = methods.map(i => normalizeMethodInfo(i, this));
        this.options = options !== null && options !== void 0 ? options : {};
    }
}
