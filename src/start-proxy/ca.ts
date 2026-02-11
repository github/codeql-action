import { md, pki } from "node-forge";

import { CertificateAuthority } from "./types";

const KEY_SIZE = 2048;
const KEY_EXPIRY_YEARS = 2;

const CERT_SUBJECT = [
  {
    name: "commonName",
    value: "Dependabot Internal CA",
  },
  {
    name: "organizationName",
    value: "GitHub inc.",
  },
  {
    shortName: "OU",
    value: "Dependabot",
  },
  {
    name: "countryName",
    value: "US",
  },
  {
    shortName: "ST",
    value: "California",
  },
  {
    name: "localityName",
    value: "San Francisco",
  },
];

type Extension = {
  name: string;
  [key: string]: unknown;
};

const extraExtensions: Extension[] = [
  {
    name: "keyUsage",
    critical: true,
    keyCertSign: true,
    cRLSign: true,
    digitalSignature: true,
  },
  { name: "subjectKeyIdentifier" },
  { name: "authorityKeyIdentifier", keyIdentifier: true },
];

/**
 * Generates a CA certificate for the proxy.
 *
 * @param newCertGenFF Whether to use the updated certificate generation.
 * @returns The private and public keys.
 */
export function generateCertificateAuthority(
  newCertGenFF: boolean,
): CertificateAuthority {
  const keys = pki.rsa.generateKeyPair(KEY_SIZE);
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(
    cert.validity.notBefore.getFullYear() + KEY_EXPIRY_YEARS,
  );

  cert.setSubject(CERT_SUBJECT);
  cert.setIssuer(CERT_SUBJECT);

  const extensions: Extension[] = [{ name: "basicConstraints", cA: true }];

  // Add the extra CA extensions if the FF is enabled.
  if (newCertGenFF) {
    extensions.push(...extraExtensions);
  }

  cert.setExtensions(extensions);

  // Specifically use SHA256 when the FF is enabled.
  if (newCertGenFF) {
    cert.sign(keys.privateKey, md.sha256.create());
  } else {
    cert.sign(keys.privateKey);
  }

  const pem = pki.certificateToPem(cert);
  const key = pki.privateKeyToPem(keys.privateKey);
  return { cert: pem, key };
}
