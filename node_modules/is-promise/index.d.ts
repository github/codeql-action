declare function isPromise<T, S>(obj: Promise<T> | S): obj is Promise<T>;
export default isPromise;