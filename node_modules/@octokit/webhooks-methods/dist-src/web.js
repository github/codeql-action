const enc = new TextEncoder();
function hexToUInt8Array(string) {
  const pairs = string.match(/[\dA-F]{2}/gi);
  const integers = pairs.map(function(s) {
    return parseInt(s, 16);
  });
  return new Uint8Array(integers);
}
function UInt8ArrayToHex(signature) {
  return Array.prototype.map.call(new Uint8Array(signature), (x) => x.toString(16).padStart(2, "0")).join("");
}
async function importKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    // raw format of the key - should be Uint8Array
    enc.encode(secret),
    {
      // algorithm details
      name: "HMAC",
      hash: { name: "SHA-256" }
    },
    false,
    // export = false
    ["sign", "verify"]
    // what this key can do
  );
}
async function sign(secret, payload) {
  if (!secret || !payload) {
    throw new TypeError(
      "[@octokit/webhooks-methods] secret & payload required for sign()"
    );
  }
  if (typeof payload !== "string") {
    throw new TypeError("[@octokit/webhooks-methods] payload must be a string");
  }
  const algorithm = "sha256";
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importKey(secret),
    enc.encode(payload)
  );
  return `${algorithm}=${UInt8ArrayToHex(signature)}`;
}
async function verify(secret, eventPayload, signature) {
  if (!secret || !eventPayload || !signature) {
    throw new TypeError(
      "[@octokit/webhooks-methods] secret, eventPayload & signature required"
    );
  }
  if (typeof eventPayload !== "string") {
    throw new TypeError(
      "[@octokit/webhooks-methods] eventPayload must be a string"
    );
  }
  const algorithm = "sha256";
  return await crypto.subtle.verify(
    "HMAC",
    await importKey(secret),
    hexToUInt8Array(signature.replace(`${algorithm}=`, "")),
    enc.encode(eventPayload)
  );
}
async function verifyWithFallback(secret, payload, signature, additionalSecrets) {
  const firstPass = await verify(secret, payload, signature);
  if (firstPass) {
    return true;
  }
  if (additionalSecrets !== void 0) {
    for (const s of additionalSecrets) {
      const v = await verify(s, payload, signature);
      if (v) {
        return v;
      }
    }
  }
  return false;
}
export {
  sign,
  verify,
  verifyWithFallback
};
