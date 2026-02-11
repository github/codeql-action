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

export function generateCertificateAuthority(): CertificateAuthority {
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
  cert.setExtensions([
    { name: "basicConstraints", cA: true },
    {
      name: "keyUsage",
      critical: true,
      keyCertSign: true,
      cRLSign: true,
      digitalSignature: true,
    },
    { name: "subjectKeyIdentifier" },
    { name: "authorityKeyIdentifier", keyIdentifier: true },
  ]);
  cert.sign(keys.privateKey, md.sha256.create());

  const pem = pki.certificateToPem(cert);
  const key = pki.privateKeyToPem(keys.privateKey);
  return { cert: pem, key };
}
