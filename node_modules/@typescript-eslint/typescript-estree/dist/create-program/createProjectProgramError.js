"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProjectProgramError = createProjectProgramError;
const node_path_1 = __importDefault(require("node:path"));
const ts = __importStar(require("typescript"));
const describeFilePath_1 = require("./describeFilePath");
const DEFAULT_EXTRA_FILE_EXTENSIONS = new Set([
    ts.Extension.Ts,
    ts.Extension.Tsx,
    ts.Extension.Js,
    ts.Extension.Jsx,
    ts.Extension.Mjs,
    ts.Extension.Mts,
    ts.Extension.Cjs,
    ts.Extension.Cts,
]);
function createProjectProgramError(parseSettings, programsForProjects) {
    const describedFilePath = (0, describeFilePath_1.describeFilePath)(parseSettings.filePath, parseSettings.tsconfigRootDir);
    return [
        getErrorStart(describedFilePath, parseSettings),
        ...getErrorDetails(describedFilePath, parseSettings, programsForProjects),
    ];
}
function getErrorStart(describedFilePath, parseSettings) {
    const relativeProjects = [...parseSettings.projects.values()].map(projectFile => (0, describeFilePath_1.describeFilePath)(projectFile, parseSettings.tsconfigRootDir));
    const describedPrograms = relativeProjects.length === 1
        ? ` ${relativeProjects[0]}`
        : `\n${relativeProjects.map(project => `- ${project}`).join('\n')}`;
    return `ESLint was configured to run on \`${describedFilePath}\` using \`parserOptions.project\`:${describedPrograms}`;
}
function getErrorDetails(describedFilePath, parseSettings, programsForProjects) {
    if (programsForProjects.length === 1 &&
        programsForProjects[0].getProjectReferences()?.length) {
        return [
            `That TSConfig uses project "references" and doesn't include \`${describedFilePath}\` directly, which is not supported by \`parserOptions.project\`.`,
            `Either:`,
            `- Switch to \`parserOptions.projectService\``,
            `- Use an ESLint-specific TSConfig`,
            `See the typescript-eslint docs for more info: https://typescript-eslint.io/troubleshooting/typed-linting#are-typescript-project-references-supported`,
        ];
    }
    const { extraFileExtensions } = parseSettings;
    const details = [];
    for (const extraExtension of extraFileExtensions) {
        if (!extraExtension.startsWith('.')) {
            details.push(`Found unexpected extension \`${extraExtension}\` specified with the \`parserOptions.extraFileExtensions\` option. Did you mean \`.${extraExtension}\`?`);
        }
        if (DEFAULT_EXTRA_FILE_EXTENSIONS.has(extraExtension)) {
            details.push(`You unnecessarily included the extension \`${extraExtension}\` with the \`parserOptions.extraFileExtensions\` option. This extension is already handled by the parser by default.`);
        }
    }
    const fileExtension = node_path_1.default.extname(parseSettings.filePath);
    if (!DEFAULT_EXTRA_FILE_EXTENSIONS.has(fileExtension)) {
        const nonStandardExt = `The extension for the file (\`${fileExtension}\`) is non-standard`;
        if (extraFileExtensions.length > 0) {
            if (!extraFileExtensions.includes(fileExtension)) {
                return [
                    ...details,
                    `${nonStandardExt}. It should be added to your existing \`parserOptions.extraFileExtensions\`.`,
                ];
            }
        }
        else {
            return [
                ...details,
                `${nonStandardExt}. You should add \`parserOptions.extraFileExtensions\` to your config.`,
            ];
        }
    }
    const [describedInclusions, describedSpecifiers] = parseSettings.projects.size === 1
        ? ['that TSConfig does not', 'that TSConfig']
        : ['none of those TSConfigs', 'one of those TSConfigs'];
    return [
        ...details,
        `However, ${describedInclusions} include this file. Either:`,
        `- Change ESLint's list of included files to not include this file`,
        `- Change ${describedSpecifiers} to include this file`,
        `- Create a new TSConfig that includes this file and include it in your parserOptions.project`,
        `See the typescript-eslint docs for more info: https://typescript-eslint.io/troubleshooting/typed-linting#i-get-errors-telling-me-eslint-was-configured-to-run--however-that-tsconfig-does-not--none-of-those-tsconfigs-include-this-file`,
    ];
}
//# sourceMappingURL=createProjectProgramError.js.map