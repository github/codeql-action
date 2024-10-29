export declare const TESTS: ({
    value: string;
    expectedValidate: boolean;
    expectedVersion: number;
} | {
    value: string;
    expectedValidate: boolean;
    expectedVersion?: undefined;
} | {
    value: undefined;
    expectedValidate: boolean;
    expectedVersion?: undefined;
} | {
    value: null;
    expectedValidate: boolean;
    expectedVersion?: undefined;
} | {
    value: number;
    expectedValidate: boolean;
    expectedVersion?: undefined;
} | {
    value: RegExp;
    expectedValidate: boolean;
    expectedVersion?: undefined;
} | {
    value: Date;
    expectedValidate: boolean;
    expectedVersion?: undefined;
} | {
    value: boolean;
    expectedValidate: boolean;
    expectedVersion?: undefined;
})[];
