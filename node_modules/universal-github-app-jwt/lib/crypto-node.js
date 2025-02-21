// this can be removed once we only support Node 20+
export * from "node:crypto";
import { createPrivateKey } from "node:crypto";

import { isPkcs1 } from "./utils.js";

// no-op, unfortunately there is no way to transform from PKCS8 or OpenSSH to PKCS1 with WebCrypto
export function convertPrivateKey(privateKey) {
  if (!isPkcs1(privateKey)) return privateKey;

  return createPrivateKey(privateKey).export({
    type: "pkcs8",
    format: "pem",
  });
}
