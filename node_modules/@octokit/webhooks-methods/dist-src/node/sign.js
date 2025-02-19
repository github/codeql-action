import { createHmac } from "node:crypto";
import { VERSION } from "../version.js";
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
  return `${algorithm}=${createHmac(algorithm, secret).update(payload).digest("hex")}`;
}
sign.VERSION = VERSION;
export {
  sign
};
