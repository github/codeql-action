import test from "ava";

import { setupTests } from "../testing-utils";

import * as types from "./types";

setupTests(test);

const validAzureCredential: types.AzureConfig = {
  "tenant-id": "12345678-1234-1234-1234-123456789012",
  "client-id": "abcdef01-2345-6789-abcd-ef0123456789",
};

const validAwsCredential: types.AWSConfig = {
  "aws-region": "us-east-1",
  "account-id": "123456789012",
  "role-name": "MY_ROLE",
  domain: "MY_DOMAIN",
  "domain-owner": "987654321098",
  audience: "custom-audience",
};

const validJFrogCredential: types.JFrogConfig = {
  "jfrog-oidc-provider-name": "MY_PROVIDER",
  audience: "jfrog-audience",
  "identity-mapping-name": "my-mapping",
};

test("credentialToStr - pretty-prints valid username+password configurations", (t) => {
  const secret = "password123";
  const credential: types.Credential = {
    type: "maven_credential",
    username: "user",
    password: secret,
    url: "https://localhost",
  };

  const str = types.credentialToStr(credential);

  t.false(str.includes(secret));
  t.is(
    "Type: maven_credential; Url: https://localhost; Username: user; Password: ***;",
    str,
  );
});

test("credentialToStr - pretty-prints valid username+token configurations", (t) => {
  const secret = "password123";
  const credential: types.Credential = {
    type: "maven_credential",
    username: "user",
    token: secret,
    url: "https://localhost",
  };

  const str = types.credentialToStr(credential);

  t.false(str.includes(secret));
  t.is(
    "Type: maven_credential; Url: https://localhost; Username: user; Token: ***;",
    str,
  );
});

test("credentialToStr - pretty-prints valid Azure OIDC configurations", (t) => {
  const credential: types.Credential = {
    type: "maven_credential",
    url: "https://localhost",
    ...validAzureCredential,
  };

  const str = types.credentialToStr(credential);

  t.is(
    "Type: maven_credential; Url: https://localhost; Tenant: 12345678-1234-1234-1234-123456789012; Client: abcdef01-2345-6789-abcd-ef0123456789;",
    str,
  );
});

test("credentialToStr - pretty-prints valid AWS OIDC configurations", (t) => {
  const credential: types.Credential = {
    type: "maven_credential",
    url: "https://localhost",
    ...validAwsCredential,
  };

  const str = types.credentialToStr(credential);

  t.is(
    "Type: maven_credential; Url: https://localhost; AWS Region: us-east-1; AWS Account: 123456789012; AWS Role: MY_ROLE; AWS Domain: MY_DOMAIN; AWS Domain Owner: 987654321098; AWS Audience: custom-audience;",
    str,
  );
});

test("credentialToStr - pretty-prints valid JFrog OIDC configurations", (t) => {
  const credential: types.Credential = {
    type: "maven_credential",
    url: "https://localhost",
    ...validJFrogCredential,
  };

  const str = types.credentialToStr(credential);

  t.is(
    "Type: maven_credential; Url: https://localhost; JFrog Provider: MY_PROVIDER; JFrog Identity Mapping: my-mapping; JFrog Audience: jfrog-audience;",
    str,
  );
});

test("credentialToStr - hides passwords", (t) => {
  const secret = "password123";
  const credential = {
    type: "maven_credential",
    username: null,
    password: secret,
    url: "https://localhost",
  } satisfies types.Credential;

  const str = types.credentialToStr(credential);

  t.false(str.includes(secret));
  t.is("Type: maven_credential; Url: https://localhost; Password: ***;", str);
});

test("credentialToStr - hides tokens", (t) => {
  const secret = "password123";
  const credential = {
    type: "maven_credential",
    username: null,
    token: secret,
    url: "https://localhost",
  } satisfies types.Credential;

  const str = types.credentialToStr(credential);

  t.false(str.includes(secret));
  t.is("Type: maven_credential; Url: https://localhost; Token: ***;", str);
});
