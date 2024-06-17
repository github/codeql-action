"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManifestFilename = exports.TarFilename = exports.SystemTarPathOnWindows = exports.GnuTarPathOnWindows = exports.SocketTimeout = exports.DefaultRetryDelay = exports.DefaultRetryAttempts = exports.ArchiveToolType = exports.CompressionMethod = exports.CacheFilename = void 0;
var CacheFilename;
(function (CacheFilename) {
    CacheFilename["Gzip"] = "cache.tgz";
    CacheFilename["Zstd"] = "cache.tzst";
})(CacheFilename || (exports.CacheFilename = CacheFilename = {}));
var CompressionMethod;
(function (CompressionMethod) {
    CompressionMethod["Gzip"] = "gzip";
    // Long range mode was added to zstd in v1.3.2.
    // This enum is for earlier version of zstd that does not have --long support
    CompressionMethod["ZstdWithoutLong"] = "zstd-without-long";
    CompressionMethod["Zstd"] = "zstd";
})(CompressionMethod || (exports.CompressionMethod = CompressionMethod = {}));
var ArchiveToolType;
(function (ArchiveToolType) {
    ArchiveToolType["GNU"] = "gnu";
    ArchiveToolType["BSD"] = "bsd";
})(ArchiveToolType || (exports.ArchiveToolType = ArchiveToolType = {}));
// The default number of retry attempts.
exports.DefaultRetryAttempts = 2;
// The default delay in milliseconds between retry attempts.
exports.DefaultRetryDelay = 5000;
// Socket timeout in milliseconds during download.  If no traffic is received
// over the socket during this period, the socket is destroyed and the download
// is aborted.
exports.SocketTimeout = 5000;
// The default path of GNUtar on hosted Windows runners
exports.GnuTarPathOnWindows = `${process.env['PROGRAMFILES']}\\Git\\usr\\bin\\tar.exe`;
// The default path of BSDtar on hosted Windows runners
exports.SystemTarPathOnWindows = `${process.env['SYSTEMDRIVE']}\\Windows\\System32\\tar.exe`;
exports.TarFilename = 'cache.tar';
exports.ManifestFilename = 'manifest.txt';
//# sourceMappingURL=constants.js.map