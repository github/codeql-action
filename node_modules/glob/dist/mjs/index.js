import { escape, unescape } from 'minimatch';
import { Glob } from './glob.js';
import { hasMagic } from './has-magic.js';
export function globStreamSync(pattern, options = {}) {
    return new Glob(pattern, options).streamSync();
}
export function globStream(pattern, options = {}) {
    return new Glob(pattern, options).stream();
}
export function globSync(pattern, options = {}) {
    return new Glob(pattern, options).walkSync();
}
export async function glob(pattern, options = {}) {
    return new Glob(pattern, options).walk();
}
export function globIterate(pattern, options = {}) {
    return new Glob(pattern, options).iterate();
}
export function globIterateSync(pattern, options = {}) {
    return new Glob(pattern, options).iterateSync();
}
/* c8 ignore start */
export { escape, unescape } from 'minimatch';
export { Glob } from './glob.js';
export { hasMagic } from './has-magic.js';
/* c8 ignore stop */
export default Object.assign(glob, {
    glob,
    globSync,
    globStream,
    globStreamSync,
    globIterate,
    globIterateSync,
    Glob,
    hasMagic,
    escape,
    unescape,
});
//# sourceMappingURL=index.js.map