type SemVerBaseStringified = `${bigint}.${bigint}.${bigint}`;
type SemVerStringifiedWithReleaseName = `${SemVerBaseStringified}-${string}`;
type SemVerStringified = SemVerBaseStringified | SemVerStringifiedWithReleaseName;
type Version = SemVerStringified | "latest";
declare const MINIMUM_BUN_VERSION = "1.0.0";
declare function isBunModule(moduleName: string, bunVersion?: Version): boolean;
declare function isSupportedNodeModule(moduleName: string, bunVersion?: Version): boolean;

export { MINIMUM_BUN_VERSION, type Version, isBunModule, isSupportedNodeModule };
