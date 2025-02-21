// we don't @ts-check here because it chokes on atob and btoa which are available in all modern JS runtime environments

/**
 * @param {string} privateKey
 * @returns {boolean}
 */
export function isPkcs1(privateKey) {
  return privateKey.includes("-----BEGIN RSA PRIVATE KEY-----");
}

/**
 * @param {string} privateKey
 * @returns {boolean}
 */
export function isOpenSsh(privateKey) {
  return privateKey.includes("-----BEGIN OPENSSH PRIVATE KEY-----");
}

/**
 * @param {string} str
 * @returns {ArrayBuffer}
 */
export function string2ArrayBuffer(str) {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

/**
 * @param {string} pem
 * @returns {ArrayBuffer}
 */
export function getDERfromPEM(pem) {
  const pemB64 = pem
    .trim()
    .split("\n")
    .slice(1, -1) // Remove the --- BEGIN / END PRIVATE KEY ---
    .join("");

  const decoded = atob(pemB64);
  return string2ArrayBuffer(decoded);
}

/**
 * @param {import('../internals').Header} header
 * @param {import('../internals').Payload} payload
 * @returns {string}
 */
export function getEncodedMessage(header, payload) {
  return `${base64encodeJSON(header)}.${base64encodeJSON(payload)}`;
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function base64encode(buffer) {
  var binary = "";
  var bytes = new Uint8Array(buffer);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return fromBase64(btoa(binary));
}

/**
 * @param {string} base64
 * @returns {string}
 */
function fromBase64(base64) {
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * @param {Record<string,unknown>} obj
 * @returns {string}
 */
function base64encodeJSON(obj) {
  return fromBase64(btoa(JSON.stringify(obj)));
}
