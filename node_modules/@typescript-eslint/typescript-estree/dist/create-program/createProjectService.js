"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProjectService = void 0;
// eslint-disable-next-line @typescript-eslint/no-empty-function
const doNothing = () => { };
const createStubFileWatcher = () => ({
    close: doNothing,
});
function createProjectService(jsDocParsingMode) {
    // We import this lazily to avoid its cost for users who don't use the service
    // TODO: Once we drop support for TS<5.3 we can import from "typescript" directly
    const tsserver = require('typescript/lib/tsserverlibrary');
    // TODO: see getWatchProgramsForProjects
    // We don't watch the disk, we just refer to these when ESLint calls us
    // there's a whole separate update pass in maybeInvalidateProgram at the bottom of getWatchProgramsForProjects
    // (this "goes nuclear on TypeScript")
    const system = {
        ...tsserver.sys,
        clearImmediate,
        clearTimeout,
        setImmediate,
        setTimeout,
        watchDirectory: createStubFileWatcher,
        watchFile: createStubFileWatcher,
    };
    return new tsserver.server.ProjectService({
        host: system,
        cancellationToken: { isCancellationRequested: () => false },
        useSingleInferredProject: false,
        useInferredProjectPerProjectRoot: false,
        logger: {
            close: doNothing,
            endGroup: doNothing,
            getLogFileName: () => undefined,
            hasLevel: () => false,
            info: doNothing,
            loggingEnabled: () => false,
            msg: doNothing,
            perftrc: doNothing,
            startGroup: doNothing,
        },
        session: undefined,
        jsDocParsingMode,
    });
}
exports.createProjectService = createProjectService;
//# sourceMappingURL=createProjectService.js.map