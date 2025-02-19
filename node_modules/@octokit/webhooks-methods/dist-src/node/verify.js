import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { sign } from "./sign.js";
import { VERSION } from "../version.js";
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
  const signatureBuffer = Buffer.from(signature);
  const verificationBuffer = Buffer.from(await sign(secret, eventPayload));
  if (signatureBuffer.length !== verificationBuffer.length) {
    return false;
  }
  return timingSafeEqual(signatureBuffer, verificationBuffer);
}
verify.VERSION = VERSION;
export {
  verify
};
