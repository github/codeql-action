"use strict";
// Enforce system requirements for the CodeQL CLI.
// https://codeql.github.com/docs/codeql-overview/system-requirements/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.passesSystemRequirements = passesSystemRequirements;
const macos_version_1 = require("macos-version");
const util_1 = require("./util");
const fs_1 = require("fs");
const os_1 = __importDefault(require("os"));
const platformMap = {
    'darwin': 'macOS',
    'linux': 'Linux',
    'win32': 'Windows',
};
const platformRequirements = {
    'macOS': {
        'version': ['13.0.1', '14.0.1'],
        'arch': ['arm64', 'x64'],
    },
    'Linux': {
        // We only accept Ubuntu 20.04, 21.04, and 22.04
        'version': ['20.04', '21.04', '22.04'],
        'arch': ['x64'],
    },
    'Windows': {
        'version': ['10', 'Server 2019', '11', 'Server 2022'],
        'arch': ['x64'],
    },
};
function passesSystemRequirements() {
    // CodeQL System requirements are two-level: the CLI must run on a specific platform,
    // and that platform must have certain capabilities.
    const platform = getPlatform();
    switch (platform) {
        case 'macOS':
            return checkMacOSPlatform();
        case 'Linux':
            return checkLinuxPlatform();
        case 'Windows':
            return checkWindowsPlatform();
        default:
            (0, util_1.assertNever)(platform);
    }
}
// MacOS checks
function checkMacOSPlatform() {
    const macOSPlatformRequirements = platformRequirements['macOS'];
    const passesSystemRequirements = checkMacOSVersion(macOSPlatformRequirements['version']) && checkMacOSArch(macOSPlatformRequirements['arch']);
    return passesSystemRequirements;
}
function checkMacOSVersion(supportedVersions) {
    return supportedVersions.some((version) => {
        (0, macos_version_1.isMacOSVersionGreaterThanOrEqualTo)(version);
    });
}
function checkMacOSArch(supportedArchs) {
    const arch = getArch();
    return supportedArchs.includes(arch);
}
// Linux checks
function checkLinuxPlatform() {
    const linuxPlatformRequirements = platformRequirements['Linux'];
    return checkLinuxVersion(linuxPlatformRequirements['version']) && checkLinuxArch(linuxPlatformRequirements['arch']);
}
function checkLinuxVersion(supportedVersions) {
    const data = (0, fs_1.readFileSync)('/etc/os-release', 'utf8');
    const lines = data.split('\n');
    const releaseDetails = {};
    lines.forEach((line) => {
        // Split the line into a key and value delimited by '='
        const words = line.split('=');
        if (words.length === 2) {
            releaseDetails[words[0].trim().toLowerCase()] = words[1].trim();
        }
    });
    return releaseDetails.name == 'Ubuntu' && supportedVersions.includes(releaseDetails.version_id);
}
function checkLinuxArch(supportedArchs) {
    const arch = getArch();
    return supportedArchs.includes(arch);
}
// Windows checks
function checkWindowsPlatform() {
    const windowsPlatformRequirements = platformRequirements['Windows'];
    return checkWindowsVersion(windowsPlatformRequirements['version']) && checkWindowsArch(windowsPlatformRequirements['arch']);
}
function checkWindowsVersion(supportedVersions) {
    // os.release() on windows returns a string like "Windows 11 Home"
    const windowsVersion = os_1.default.release();
    return supportedVersions.some(version => new RegExp(version, 'i').test(windowsVersion));
}
function checkWindowsArch(supportedArchs) {
    const arch = getArch();
    return supportedArchs.includes(arch);
}
;
// Auxiliary functions
function getPlatform() {
    const platform = process.platform;
    const mappedPlatform = platformMap[platform];
    if (mappedPlatform === undefined) {
        throw new util_1.ConfigurationError(`Unsupported platform: ${platform}`);
    }
    return mappedPlatform;
}
function getArch() {
    return process.arch;
}
//# sourceMappingURL=system-reqs.js.map