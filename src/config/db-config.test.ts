import test, { ExecutionContext } from "ava";

import { RepositoryProperties } from "../feature-flags/properties";
import { KnownLanguage, Language } from "../languages";
import { prettyPrintPack } from "../util";

import * as dbConfig from "./db-config";

/**
 * Test macro for ensuring the packs block is valid
 */
const parsePacksMacro = test.macro({
  exec: (
    t: ExecutionContext<unknown>,
    packsInput: string,
    languages: Language[],
    expected: dbConfig.Packs | undefined,
  ) =>
    t.deepEqual(
      dbConfig.parsePacksFromInput(packsInput, languages, false),
      expected,
    ),

  title: (providedTitle = "") => `Parse Packs: ${providedTitle}`,
});

/**
 * Test macro for testing when the packs block is invalid
 */
const parsePacksErrorMacro = test.macro({
  exec: (
    t: ExecutionContext<unknown>,
    packsInput: string,
    languages: Language[],
    expected: RegExp,
  ) =>
    t.throws(() => dbConfig.parsePacksFromInput(packsInput, languages, false), {
      message: expected,
    }),
  title: (providedTitle = "") => `Parse Packs Error: ${providedTitle}`,
});

/**
 * Test macro for testing when the packs block is invalid
 */
const invalidPackNameMacro = test.macro({
  exec: (t: ExecutionContext, name: string) =>
    parsePacksErrorMacro.exec(
      t,
      name,
      [KnownLanguage.cpp],
      new RegExp(`^"${name}" is not a valid pack$`),
    ),
  title: (_providedTitle: string | undefined, arg: string | undefined) =>
    `Invalid pack string: ${arg}`,
});

test("no packs", parsePacksMacro, "", [], undefined);
test("two packs", parsePacksMacro, "a/b,c/d@1.2.3", [KnownLanguage.cpp], {
  [KnownLanguage.cpp]: ["a/b", "c/d@1.2.3"],
});
test(
  "two packs with spaces",
  parsePacksMacro,
  " a/b , c/d@1.2.3 ",
  [KnownLanguage.cpp],
  {
    [KnownLanguage.cpp]: ["a/b", "c/d@1.2.3"],
  },
);
test(
  "two packs with language",
  parsePacksErrorMacro,
  "a/b,c/d@1.2.3",
  [KnownLanguage.cpp, KnownLanguage.java],
  new RegExp(
    "Cannot specify a 'packs' input in a multi-language analysis. " +
      "Use a codeql-config.yml file instead and specify packs by language.",
  ),
);

test(
  "packs with other valid names",
  parsePacksMacro,
  [
    // ranges are ok
    "c/d@1.0",
    "c/d@~1.0.0",
    "c/d@~1.0.0:a/b",
    "c/d@~1.0.0+abc:a/b",
    "c/d@~1.0.0-abc:a/b",
    "c/d:a/b",
    // whitespace is removed
    " c/d      @     ~1.0.0    :    b.qls   ",
    // and it is retained within a path
    " c/d      @     ~1.0.0    :    b/a path with/spaces.qls   ",
    // this is valid. the path is '@'. It will probably fail when passed to the CLI
    "c/d@1.2.3:@",
    // this is valid, too. It will fail if it doesn't match a path
    // (globbing is not done)
    "c/d@1.2.3:+*)_(",
  ].join(","),
  [KnownLanguage.cpp],
  {
    [KnownLanguage.cpp]: [
      "c/d@1.0",
      "c/d@~1.0.0",
      "c/d@~1.0.0:a/b",
      "c/d@~1.0.0+abc:a/b",
      "c/d@~1.0.0-abc:a/b",
      "c/d:a/b",
      "c/d@~1.0.0:b.qls",
      "c/d@~1.0.0:b/a path with/spaces.qls",
      "c/d@1.2.3:@",
      "c/d@1.2.3:+*)_(",
    ],
  },
);

test(invalidPackNameMacro, "c"); // all packs require at least a scope and a name
test(invalidPackNameMacro, "c-/d");
test(invalidPackNameMacro, "-c/d");
test(invalidPackNameMacro, "c/d_d");
test(invalidPackNameMacro, "c/d@@");
test(invalidPackNameMacro, "c/d@1.0.0:");
test(invalidPackNameMacro, "c/d:");
test(invalidPackNameMacro, "c/d:/a");
test(invalidPackNameMacro, "@1.0.0:a");
test(invalidPackNameMacro, "c/d@../a");
test(invalidPackNameMacro, "c/d@b/../a");
test(invalidPackNameMacro, "c/d:z@1");

/**
 * Test macro for pretty printing pack specs
 */
const packSpecPrettyPrintingMacro = test.macro({
  exec: (t: ExecutionContext, packStr: string, packObj: dbConfig.Pack) => {
    const parsed = dbConfig.parsePacksSpecification(packStr);
    t.deepEqual(parsed, packObj, "parsed pack spec is correct");
    const stringified = prettyPrintPack(packObj);
    t.deepEqual(
      stringified,
      packStr.trim(),
      "pretty-printed pack spec is correct",
    );

    t.deepEqual(
      dbConfig.validatePackSpecification(packStr),
      packStr.trim(),
      "pack spec is valid",
    );
  },
  title: (
    _providedTitle: string | undefined,
    packStr: string,
    _packObj: dbConfig.Pack,
  ) => `Prettyprint pack spec: '${packStr}'`,
});

test(packSpecPrettyPrintingMacro, "a/b", {
  name: "a/b",
  version: undefined,
  path: undefined,
});
test(packSpecPrettyPrintingMacro, "a/b@~1.2.3", {
  name: "a/b",
  version: "~1.2.3",
  path: undefined,
});
test(packSpecPrettyPrintingMacro, "a/b@~1.2.3:abc/def", {
  name: "a/b",
  version: "~1.2.3",
  path: "abc/def",
});
test(packSpecPrettyPrintingMacro, "a/b:abc/def", {
  name: "a/b",
  version: undefined,
  path: "abc/def",
});
test(packSpecPrettyPrintingMacro, "    a/b:abc/def    ", {
  name: "a/b",
  version: undefined,
  path: "abc/def",
});

const calculateAugmentationMacro = test.macro({
  exec: async (
    t: ExecutionContext,
    _title: string,
    rawPacksInput: string | undefined,
    rawQueriesInput: string | undefined,
    languages: Language[],
    repositoryProperties: RepositoryProperties,
    expectedAugmentationProperties: dbConfig.AugmentationProperties,
  ) => {
    const actualAugmentationProperties = await dbConfig.calculateAugmentation(
      rawPacksInput,
      rawQueriesInput,
      repositoryProperties,
      languages,
    );
    t.deepEqual(actualAugmentationProperties, expectedAugmentationProperties);
  },
  title: (_, title) => `Calculate Augmentation: ${title}`,
});

test(
  calculateAugmentationMacro,
  "All empty",
  undefined,
  undefined,
  [KnownLanguage.javascript],
  {},
  {
    ...dbConfig.defaultAugmentationProperties,
  },
);

test(
  calculateAugmentationMacro,
  "With queries",
  undefined,
  " a, b , c, d",
  [KnownLanguage.javascript],
  {},
  {
    ...dbConfig.defaultAugmentationProperties,
    queriesInput: [{ uses: "a" }, { uses: "b" }, { uses: "c" }, { uses: "d" }],
  },
);

test(
  calculateAugmentationMacro,
  "With queries combining",
  undefined,
  "   +   a, b , c, d ",
  [KnownLanguage.javascript],
  {},
  {
    ...dbConfig.defaultAugmentationProperties,
    queriesInputCombines: true,
    queriesInput: [{ uses: "a" }, { uses: "b" }, { uses: "c" }, { uses: "d" }],
  },
);

test(
  calculateAugmentationMacro,
  "With packs",
  "   codeql/a , codeql/b   , codeql/c  , codeql/d  ",
  undefined,
  [KnownLanguage.javascript],
  {},
  {
    ...dbConfig.defaultAugmentationProperties,
    packsInput: ["codeql/a", "codeql/b", "codeql/c", "codeql/d"],
  },
);

test(
  calculateAugmentationMacro,
  "With packs combining",
  "   +   codeql/a, codeql/b, codeql/c, codeql/d",
  undefined,
  [KnownLanguage.javascript],
  {},
  {
    ...dbConfig.defaultAugmentationProperties,
    packsInputCombines: true,
    packsInput: ["codeql/a", "codeql/b", "codeql/c", "codeql/d"],
  },
);

test(
  calculateAugmentationMacro,
  "With repo property queries",
  undefined,
  undefined,
  [KnownLanguage.javascript],
  {
    "github-codeql-extra-queries": "a, b, c, d",
  },
  {
    ...dbConfig.defaultAugmentationProperties,
    repoPropertyQueries: {
      combines: false,
      input: [{ uses: "a" }, { uses: "b" }, { uses: "c" }, { uses: "d" }],
    },
  },
);

test(
  calculateAugmentationMacro,
  "With repo property queries combining",
  undefined,
  undefined,
  [KnownLanguage.javascript],
  {
    "github-codeql-extra-queries": "+ a, b, c, d",
  },
  {
    ...dbConfig.defaultAugmentationProperties,
    repoPropertyQueries: {
      combines: true,
      input: [{ uses: "a" }, { uses: "b" }, { uses: "c" }, { uses: "d" }],
    },
  },
);

const calculateAugmentationErrorMacro = test.macro({
  exec: async (
    t: ExecutionContext,
    _title: string,
    rawPacksInput: string | undefined,
    rawQueriesInput: string | undefined,
    languages: Language[],
    repositoryProperties: RepositoryProperties,
    expectedError: RegExp | string,
  ) => {
    await t.throwsAsync(
      () =>
        dbConfig.calculateAugmentation(
          rawPacksInput,
          rawQueriesInput,
          repositoryProperties,
          languages,
        ),
      { message: expectedError },
    );
  },
  title: (_, title) => `Calculate Augmentation Error: ${title}`,
});

test(
  calculateAugmentationErrorMacro,
  "Plus (+) with nothing else (queries)",
  undefined,
  "   +   ",
  [KnownLanguage.javascript],
  {},
  /The workflow property "queries" is invalid/,
);

test(
  calculateAugmentationErrorMacro,
  "Plus (+) with nothing else (packs)",
  "   +   ",
  undefined,
  [KnownLanguage.javascript],
  {},
  /The workflow property "packs" is invalid/,
);

test(
  calculateAugmentationErrorMacro,
  "Plus (+) with nothing else (repo property queries)",
  undefined,
  undefined,
  [KnownLanguage.javascript],
  {
    "github-codeql-extra-queries": "    + ",
  },
  /The repository property "github-codeql-extra-queries" is invalid/,
);

test(
  calculateAugmentationErrorMacro,
  "Packs input with multiple languages",
  "   +  a/b, c/d ",
  undefined,
  [KnownLanguage.javascript, KnownLanguage.java],
  {},
  /Cannot specify a 'packs' input in a multi-language analysis/,
);

test(
  calculateAugmentationErrorMacro,
  "Packs input with no languages",
  "   +  a/b, c/d ",
  undefined,
  [],
  {},
  /No languages specified/,
);

test(
  calculateAugmentationErrorMacro,
  "Invalid packs",
  " a-pack-without-a-scope ",
  undefined,
  [KnownLanguage.javascript],
  {},
  /"a-pack-without-a-scope" is not a valid pack/,
);
