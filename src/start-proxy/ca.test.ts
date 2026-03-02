import test, { ExecutionContext } from "ava";
import { pki } from "node-forge";

import { setupTests } from "../testing-utils";

import * as ca from "./ca";

setupTests(test);

const toMap = <T>(array: T[], func: (e: T) => string) =>
  new Map<string, T>(array.map((val) => [func(val), val]));

function checkCertAttributes(
  t: ExecutionContext<unknown>,
  cert: pki.Certificate,
) {
  const subjectMap = toMap(
    cert.subject.attributes,
    (attr) => attr.name as string,
  );
  const issuerMap = toMap(
    cert.issuer.attributes,
    (attr) => attr.name as string,
  );

  t.is(subjectMap.get("commonName")?.value, "Dependabot Internal CA");
  t.is(issuerMap.get("commonName")?.value, "Dependabot Internal CA");

  for (const attrName of subjectMap.keys()) {
    t.deepEqual(subjectMap.get(attrName), issuerMap.get(attrName));
  }
}

test("generateCertificateAuthority - generates certificates", (t) => {
  const result = ca.generateCertificateAuthority();
  const cert = pki.certificateFromPem(result.cert);
  const key = pki.privateKeyFromPem(result.key);

  t.truthy(cert);
  t.truthy(key);

  checkCertAttributes(t, cert);

  // Check the validity.
  t.true(
    cert.validity.notBefore <= new Date(),
    "notBefore date is in the future",
  );
  t.true(cert.validity.notAfter > new Date(), "notAfter date is in the past");

  // Check that the extensions are set as we'd expect.
  const exts = toMap(cert.extensions as ca.Extension[], (ext) => ext.name);
  t.is(exts.size, 4);
  t.true(exts.get("basicConstraints")?.cA);
  t.truthy(exts.get("subjectKeyIdentifier"));
  t.truthy(exts.get("authorityKeyIdentifier"));

  const keyUsage = exts.get("keyUsage");
  if (t.truthy(keyUsage)) {
    t.true(keyUsage.critical);
    t.true(keyUsage.keyCertSign);
    t.true(keyUsage.cRLSign);
    t.true(keyUsage.digitalSignature);
  }

  t.truthy(cert.siginfo);
});
