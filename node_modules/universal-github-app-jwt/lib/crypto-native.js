const { subtle } = globalThis.crypto;

// no-op, unfortunately there is no way to transform from PKCS8 or OpenSSH to PKCS1 with WebCrypto
function convertPrivateKey(privateKey) {
  return privateKey;
}

export { subtle, convertPrivateKey };
