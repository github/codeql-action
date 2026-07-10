import test from "ava";

import { setupTests } from "../testing-utils";

import * as json from ".";

setupTests(test);

const testSchema = {
  requiredKey: json.string,
};

const optionalOrNullSchema = {
  optionalKey: json.optionalOrNull(json.string),
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

test("validateSchema - optionalOrNullSchema properties are optional or null", async (t) => {
  // Optional fields may be absent
  t.true(json.validateSchema(optionalOrNullSchema, {}));
  t.true(json.validateSchema(optionalOrNullSchema, { optionalKey: undefined }));
  t.true(json.validateSchema(optionalOrNullSchema, { optionalKey: null }));

  // But, if present, should have the expected type
  t.false(json.validateSchema(optionalOrNullSchema, { optionalKey: 0 }));
  t.false(json.validateSchema(optionalOrNullSchema, { optionalKey: 123 }));
  t.false(json.validateSchema(optionalOrNullSchema, { optionalKey: false }));
  t.false(json.validateSchema(optionalOrNullSchema, { optionalKey: true }));
  t.false(json.validateSchema(optionalOrNullSchema, { optionalKey: [] }));
  t.false(json.validateSchema(optionalOrNullSchema, { optionalKey: {} }));
  t.true(json.validateSchema(optionalOrNullSchema, { optionalKey: "" }));
  t.true(json.validateSchema(optionalOrNullSchema, { optionalKey: "foo" }));
});

const optionalSchema = {
  optionalKey: json.optional(json.string),
};

test("validateSchema - optional properties are optional", async (t) => {
  // Optional fields may be absent or explicitly undefined
  t.true(json.validateSchema(optionalSchema, {}));
  t.true(json.validateSchema(optionalSchema, { optionalKey: undefined }));

  // But should reject null
  t.false(json.validateSchema(optionalSchema, { optionalKey: null }));

  // And, if present, should have the expected type
  t.false(json.validateSchema(optionalSchema, { optionalKey: 0 }));
  t.false(json.validateSchema(optionalSchema, { optionalKey: 123 }));
  t.false(json.validateSchema(optionalSchema, { optionalKey: false }));
  t.false(json.validateSchema(optionalSchema, { optionalKey: true }));
  t.false(json.validateSchema(optionalSchema, { optionalKey: [] }));
  t.false(json.validateSchema(optionalSchema, { optionalKey: {} }));
  t.true(json.validateSchema(optionalSchema, { optionalKey: "" }));
  t.true(json.validateSchema(optionalSchema, { optionalKey: "foo" }));
});

const arraySchema = {
  arrayKey: json.array(json.number),
};

test("validateSchema - validates arrays", async (t) => {
  // Arrays of numeric elements are accepted.
  t.true(json.validateSchema(arraySchema, { arrayKey: [] }));
  t.true(json.validateSchema(arraySchema, { arrayKey: [4] }));
  t.true(json.validateSchema(arraySchema, { arrayKey: [4, 8] }));
  t.true(json.validateSchema(arraySchema, { arrayKey: [4, 8, 15] }));

  // Other array elements are not accepted.
  t.false(json.validateSchema(arraySchema, { arrayKey: [4, 8, 15, "bar"] }));
  t.false(json.validateSchema(arraySchema, { arrayKey: [4, 8, undefined] }));
  t.false(json.validateSchema(arraySchema, { arrayKey: [4, 8, 15, null] }));
});

const objectSchema = {
  objectKey: json.object(arraySchema),
};

test("validateSchema - validates objects", async (t) => {
  // Objects of the given schema are accepted.
  t.true(json.validateSchema(objectSchema, { objectKey: { arrayKey: [] } }));
  t.true(json.validateSchema(objectSchema, { objectKey: { arrayKey: [4] } }));

  // Other values are not accepted.
  t.false(json.validateSchema(objectSchema, {}));
  t.false(json.validateSchema(objectSchema, { objectKey: [] }));
  t.false(json.validateSchema(objectSchema, { objectKey: undefined }));
  t.false(json.validateSchema(objectSchema, { objectKey: null }));
  t.false(json.validateSchema(objectSchema, { objectKey: "foo" }));
  t.false(json.validateSchema(objectSchema, { objectKey: 123 }));
});

const checkSchemaTestSchema = {
  rootKey: json.object(objectSchema),
};

test("validateSchema - checkSchema reports unknown keys", async (t) => {
  const result = json.checkSchema(checkSchemaTestSchema, {
    rootKey: {
      objectKey: {
        arrayKey: [],
      },
      nestedExtraKey: "foo",
    },
    extraKey: "bar",
  });

  t.true(result.valid);
  t.deepEqual(
    result.unknownKeys.sort(),
    [".extraKey", ".rootKey.nestedExtraKey"].sort(),
  );
});

test("validateSchema - checkSchema reports invalid keys", async (t) => {
  const result = json.checkSchema(checkSchemaTestSchema, {
    rootKey: {
      objectKey: {
        arrayKey: ["foo"],
      },
    },
  });

  t.false(result.valid);
  t.deepEqual(
    result.invalidKeys.sort(),
    [".rootKey.objectKey.arrayKey[0]"].sort(),
  );
});
