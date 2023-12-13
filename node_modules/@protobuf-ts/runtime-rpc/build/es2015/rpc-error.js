/**
 * An error that occurred while calling a RPC method.
 */
export class RpcError extends Error {
    constructor(message, code = 'UNKNOWN', meta) {
        super(message);
        this.name = 'RpcError';
        // see https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#example
        Object.setPrototypeOf(this, new.target.prototype);
        this.code = code;
        this.meta = meta !== null && meta !== void 0 ? meta : {};
    }
    toString() {
        const l = [this.name + ': ' + this.message];
        if (this.code) {
            l.push('');
            l.push('Code: ' + this.code);
        }
        if (this.serviceName && this.methodName) {
            l.push('Method: ' + this.serviceName + '/' + this.methodName);
        }
        let m = Object.entries(this.meta);
        if (m.length) {
            l.push('');
            l.push('Meta:');
            for (let [k, v] of m) {
                l.push(`  ${k}: ${v}`);
            }
        }
        return l.join('\n');
    }
}
