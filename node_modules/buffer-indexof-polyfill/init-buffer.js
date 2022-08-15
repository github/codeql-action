module.exports = function initBuffer(val) {
  // assume old version
    var nodeVersion = process && process.version ? process.version : "v5.0.0";
    var major = nodeVersion.split(".")[0].replace("v", "");
    return major < 6
      ? new Buffer(val)
      : Buffer.from(val);
};