/**
 * Represents a twirp error
 */
export declare class TwirpError extends Error {
    readonly msg: string;
    readonly code: TwirpErrorCode;
    readonly meta: Record<string, string>;
    private _originalCause?;
    constructor(code: TwirpErrorCode, msg: string);
    /**
     * Adds a metadata kv to the error
     * @param key
     * @param value
     */
    withMeta(key: string, value: string): this;
    /**
     * Returns a single metadata value
     * return "" if not found
     * @param key
     */
    getMeta(key: string): string;
    /**
     * Add the original error cause
     * @param err
     * @param addMeta
     */
    withCause(err: Error, addMeta?: boolean): this;
    cause(): Error | undefined;
    /**
     * Returns the error representation to JSON
     */
    toJSON(): string;
    /**
     * Create a twirp error from an object
     * @param obj
     */
    static fromObject(obj: Record<string, any>): TwirpError;
}
/**
 * NotFoundError constructor for the common NotFound error.
 */
export declare class NotFoundError extends TwirpError {
    constructor(msg: string);
}
/**
 * InvalidArgumentError constructor for the common InvalidArgument error. Can be
 * used when an argument has invalid format, is a number out of range, is a bad
 * option, etc).
 */
export declare class InvalidArgumentError extends TwirpError {
    constructor(argument: string, validationMsg: string);
}
/**
 * RequiredArgumentError is a more specific constructor for InvalidArgument
 * error. Should be used when the argument is required (expected to have a
 * non-zero value).
 */
export declare class RequiredArgumentError extends InvalidArgumentError {
    constructor(argument: string);
}
/**
 * InternalError constructor for the common Internal error. Should be used to
 * specify that something bad or unexpected happened.
 */
export declare class InternalServerError extends TwirpError {
    constructor(msg: string);
}
/**
 * InternalErrorWith makes an internal error, wrapping the original error and using it
 * for the error message, and with metadata "cause" with the original error type.
 * This function is used by Twirp services to wrap non-Twirp errors as internal errors.
 * The wrapped error can be extracted later with err.cause()
 */
export declare class InternalServerErrorWith extends InternalServerError {
    constructor(err: Error);
}
/**
 * A standard BadRoute Error
 */
export declare class BadRouteError extends TwirpError {
    constructor(msg: string, method: string, url: string);
}
export declare enum TwirpErrorCode {
    Canceled = "canceled",
    Unknown = "unknown",
    InvalidArgument = "invalid_argument",
    Malformed = "malformed",
    DeadlineExceeded = "deadline_exceeded",
    NotFound = "not_found",
    BadRoute = "bad_route",
    AlreadyExists = "already_exists",
    PermissionDenied = "permission_denied",
    Unauthenticated = "unauthenticated",
    ResourceExhausted = "resource_exhausted",
    FailedPrecondition = "failed_precondition",
    Aborted = "aborted",
    OutOfRange = "out_of_range",
    Unimplemented = "unimplemented",
    Internal = "internal",
    Unavailable = "unavailable",
    DataLoss = "data_loss"
}
export declare function httpStatusFromErrorCode(code: TwirpErrorCode): number;
export declare function isValidErrorCode(code: TwirpErrorCode): boolean;
