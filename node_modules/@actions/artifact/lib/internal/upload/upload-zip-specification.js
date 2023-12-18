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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUploadZipSpecification = exports.validateRootDirectory = void 0;
const fs = __importStar(require("fs"));
const core_1 = require("@actions/core");
const path_1 = require("path");
const path_and_artifact_name_validation_1 = require("./path-and-artifact-name-validation");
/**
 * Checks if a root directory exists and is valid
 * @param rootDirectory an absolute root directory path common to all input files that that will be trimmed from the final zip structure
 */
function validateRootDirectory(rootDirectory) {
    if (!fs.existsSync(rootDirectory)) {
        throw new Error(`The provided rootDirectory ${rootDirectory} does not exist`);
    }
    if (!fs.statSync(rootDirectory).isDirectory()) {
        throw new Error(`The provided rootDirectory ${rootDirectory} is not a valid directory`);
    }
    (0, core_1.info)(`Root directory input is valid!`);
}
exports.validateRootDirectory = validateRootDirectory;
/**
 * Creates a specification that describes how a zip file will be created for a set of input files
 * @param filesToZip a list of file that should be included in the zip
 * @param rootDirectory an absolute root directory path common to all input files that that will be trimmed from the final zip structure
 */
function getUploadZipSpecification(filesToZip, rootDirectory) {
    const specification = [];
    // Normalize and resolve, this allows for either absolute or relative paths to be used
    rootDirectory = (0, path_1.normalize)(rootDirectory);
    rootDirectory = (0, path_1.resolve)(rootDirectory);
    /*
       Example
       
       Input:
         rootDirectory: '/home/user/files/plz-upload'
         artifactFiles: [
           '/home/user/files/plz-upload/file1.txt',
           '/home/user/files/plz-upload/file2.txt',
           '/home/user/files/plz-upload/dir/file3.txt'
         ]
       
       Output:
         specifications: [
           ['/home/user/files/plz-upload/file1.txt', '/file1.txt'],
           ['/home/user/files/plz-upload/file1.txt', '/file2.txt'],
           ['/home/user/files/plz-upload/file1.txt', '/dir/file3.txt']
         ]
  
        The final zip that is later uploaded will look like this:
  
        my-artifact.zip
          - file.txt
          - file2.txt
          - dir/
            - file3.txt
    */
    for (let file of filesToZip) {
        if (!fs.existsSync(file)) {
            throw new Error(`File ${file} does not exist`);
        }
        if (!fs.statSync(file).isDirectory()) {
            // Normalize and resolve, this allows for either absolute or relative paths to be used
            file = (0, path_1.normalize)(file);
            file = (0, path_1.resolve)(file);
            if (!file.startsWith(rootDirectory)) {
                throw new Error(`The rootDirectory: ${rootDirectory} is not a parent directory of the file: ${file}`);
            }
            // Check for forbidden characters in file paths that may cause ambiguous behavior if downloaded on different file systems
            const uploadPath = file.replace(rootDirectory, '');
            (0, path_and_artifact_name_validation_1.validateFilePath)(uploadPath);
            specification.push({
                sourcePath: file,
                destinationPath: uploadPath
            });
        }
        else {
            // Empty directory
            const directoryPath = file.replace(rootDirectory, '');
            (0, path_and_artifact_name_validation_1.validateFilePath)(directoryPath);
            specification.push({
                sourcePath: null,
                destinationPath: directoryPath
            });
        }
    }
    return specification;
}
exports.getUploadZipSpecification = getUploadZipSpecification;
//# sourceMappingURL=upload-zip-specification.js.map