import test from "ava";

import { setupTests } from "../testing-utils";

import * as json from ".";

setupTests(test);

const testSchema = {
  requiredKey: json.string,
};

const optionalSchema = {
  optionalKey: json.optional(json.string),
};

test("validateSchema - required properties are required", async (t) => {
  t.false(json.validateSchema(testSchema, {}));
  t.false(json.validateSchema(testSchema, { requiredKey: undefined }));
  t.false(json.validateSchema(testSchema, { requiredKey: null }));
  t.false(json.validateSchema(testSchema, { requiredKey: 0 }));
  t.false(json.validateSchema(testSchema, { requiredKey: 123 }));
  t.false(json.validateSchema(testSchema, { requiredKey: false }));
  t.false(json.validateSchema(testSchema, { requiredKey: true }));
  t.false(json.validateSchema(testSchema, { requiredKey: [] }));
  t.false(json.validateSchema(testSchema, { requiredKey: {} }));
  t.true(json.validateSchema(testSchema, { requiredKey: "" }));
  t.true(json.validateSchema(testSchema, { requiredKey: "foo" }));
});

test("validateSchema - optional properties are optional", async (t) => {
  // Optional fields may be absent
  t.true(json.validateSchema(optionalSchema, {}));
  t.true(json.validateSchema(optionalSchema, { optionalKey: undefined }));
  t.true(json.validateSchema(optionalSchema, { optionalKey: null }));

  // But, if present, should have the expected type
  t.false(json.validateSchema(optionalSchema, { optionalKey: 0 }));
  t.false(json.validateSchema(optionalSchema, { optionalKey: 123 }));
  t.false(json.validateSchema(optionalSchema, { optionalKey: false }));
  t.false(json.validateSchema(optionalSchema, { optionalKey: true }));
  t.false(json.validateSchema(optionalSchema, { optionalKey: [] }));
  t.false(json.validateSchema(optionalSchema, { optionalKey: {} }));
  t.true(json.validateSchema(optionalSchema, { optionalKey: "" }));
  t.true(json.validateSchema(optionalSchema, { optionalKey: "foo" }));
});

const undefinableSchema = {
  optionalKey: json.undefinable(json.string),
};

test("validateSchema - undefinable properties are optional but reject null", async (t) => {
  // Optional fields may be absent or explicitly undefined
  t.true(json.validateSchema(undefinableSchema, {}));
  t.true(json.validateSchema(undefinableSchema, { optionalKey: undefined }));

  // But, unlike `optional`, `null` is rejected
  t.false(json.validateSchema(undefinableSchema, { optionalKey: null }));

  // And, if present, should have the expected type
  t.false(json.validateSchema(undefinableSchema, { optionalKey: 0 }));
  t.false(json.validateSchema(undefinableSchema, { optionalKey: 123 }));
  t.false(json.validateSchema(undefinableSchema, { optionalKey: false }));
  t.false(json.validateSchema(undefinableSchema, { optionalKey: true }));
  t.false(json.validateSchema(undefinableSchema, { optionalKey: [] }));
  t.false(json.validateSchema(undefinableSchema, { optionalKey: {} }));
  t.true(json.validateSchema(undefinableSchema, { optionalKey: "" }));
  t.true(json.validateSchema(undefinableSchema, { optionalKey: "foo" }));
});
