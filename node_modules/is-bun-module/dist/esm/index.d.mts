type SemVerStringified = `${number}.${number}.${number}`;
type Version = SemVerStringified | "latest";
declare const MINIMUM_BUN_VERSION = "1.0.0";
declare function isBunModule(moduleName: string, bunVersion?: Version): boolean;
declare function isSupportedNodeModule(moduleName: string, bunVersion?: Version): boolean;

export { MINIMUM_BUN_VERSION, type Version, isBunModule, isSupportedNodeModule };
