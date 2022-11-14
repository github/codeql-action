import { ComponentLoggerOptions, DiagLogFunction, DiagLogger, DiagLogLevel } from '../diag/types';
/**
 * Singleton object which represents the entry point to the OpenTelemetry internal
 * diagnostic API
 */
export declare class DiagAPI implements DiagLogger {
    private static _instance?;
    /** Get the singleton instance of the DiagAPI API */
    static instance(): DiagAPI;
    /**
     * Private internal constructor
     * @private
     */
    private constructor();
    /**
     * Set the global DiagLogger and DiagLogLevel.
     * If a global diag logger is already set, this will override it.
     *
     * @param logger - [Optional] The DiagLogger instance to set as the default logger.
     * @param logLevel - [Optional] The DiagLogLevel used to filter logs sent to the logger. If not provided it will default to INFO.
     * @returns true if the logger was successfully registered, else false
     */
    setLogger: (logger: DiagLogger, logLevel?: DiagLogLevel) => boolean;
    /**
     *
     */
    createComponentLogger: (options: ComponentLoggerOptions) => DiagLogger;
    verbose: DiagLogFunction;
    debug: DiagLogFunction;
    info: DiagLogFunction;
    warn: DiagLogFunction;
    error: DiagLogFunction;
    /**
     * Unregister the global logger and return to Noop
     */
    disable: () => void;
}
//# sourceMappingURL=diag.d.ts.map