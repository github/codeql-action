import test, { ExecutionContext } from "ava";

import { RepositoryProperties } from "../feature-flags/properties";
import { BuiltInLanguage, Language } from "../languages";
import { getRunnerLogger } from "../logging";
import {
  checkExpectedLogMessages,
  getRecordingLogger,
  LoggedMessage,
  makeMacro,
} from "../testing-utils";
import { ConfigurationError, prettyPrintPack } from "../util";

import * as dbConfig from "./db-config";

/**
 * Test macro for ensuring the packs block is valid
 */
const parsePacksMacro = makeMacro({
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
const parsePacksErrorMacro = makeMacro({
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
const invalidPackNameMacro = makeMacro({
  exec: (t: ExecutionContext, arg: string) =>
    parsePacksErrorMacro.fn(
      t,
      arg,
      [BuiltInLanguage.cpp],
      new RegExp(`^"${arg}" is not a valid pack$`),
    ),
  title: (_providedTitle: string | undefined, arg: string | undefined) =>
    `Invalid pack string: ${arg}`,
});

parsePacksMacro("no packs", "", [], undefined);
parsePacksMacro("two packs", "a/b,c/d@1.2.3", [BuiltInLanguage.cpp], {
  [BuiltInLanguage.cpp]: ["a/b", "c/d@1.2.3"],
});
parsePacksMacro(
  "two packs with spaces",
  " a/b , c/d@1.2.3 ",
  [BuiltInLanguage.cpp],
  {
    [BuiltInLanguage.cpp]: ["a/b", "c/d@1.2.3"],
  },
);
parsePacksErrorMacro(
  "two packs with language",
  "a/b,c/d@1.2.3",
  [BuiltInLanguage.cpp, BuiltInLanguage.java],
  new RegExp(
    "Cannot specify a 'packs' input in a multi-language analysis. " +
      "Use a codeql-config.yml file instead and specify packs by language.",
  ),
);

parsePacksMacro(
  "packs with other valid names",
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
  [BuiltInLanguage.cpp],
  {
    [BuiltInLanguage.cpp]: [
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

invalidPackNameMacro.test("c"); // all packs require at least a scope and a name
invalidPackNameMacro.test("c-/d");
invalidPackNameMacro.test("-c/d");
invalidPackNameMacro.test("c/d_d");
invalidPackNameMacro.test("c/d@@");
invalidPackNameMacro.test("c/d@1.0.0:");
invalidPackNameMacro.test("c/d:");
invalidPackNameMacro.test("c/d:/a");
invalidPackNameMacro.test("@1.0.0:a");
invalidPackNameMacro.test("c/d@../a");
invalidPackNameMacro.test("c/d@b/../a");
invalidPackNameMacro.test("c/d:z@1");

/**
 * Test macro for pretty printing pack specs
 */
const packSpecPrettyPrintingMacro = makeMacro({
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

packSpecPrettyPrintingMacro.test("a/b", {
  name: "a/b",
  version: undefined,
  path: undefined,
});
packSpecPrettyPrintingMacro.test("a/b@~1.2.3", {
  name: "a/b",
  version: "~1.2.3",
  path: undefined,
});
packSpecPrettyPrintingMacro.test("a/b@~1.2.3:abc/def", {
  name: "a/b",
  version: "~1.2.3",
  path: "abc/def",
});
packSpecPrettyPrintingMacro.test("a/b:abc/def", {
  name: "a/b",
  version: undefined,
  path: "abc/def",
});
packSpecPrettyPrintingMacro.test("    a/b:abc/def    ", {
  name: "a/b",
  version: undefined,
  path: "abc/def",
});

const calculateAugmentationMacro = makeMacro({
  exec: async (
    t: ExecutionContext,
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
  title: (title) => `Calculate Augmentation: ${title}`,
});

calculateAugmentationMacro(
  "All empty",
  undefined,
  undefined,
  [BuiltInLanguage.javascript],
  {},
  {
    ...dbConfig.defaultAugmentationProperties,
  },
);

calculateAugmentationMacro(
  "With queries",
  undefined,
  " a, b , c, d",
  [BuiltInLanguage.javascript],
  {},
  {
    ...dbConfig.defaultAugmentationProperties,
    queriesInput: [{ uses: "a" }, { uses: "b" }, { uses: "c" }, { uses: "d" }],
  },
);

calculateAugmentationMacro(
  "With queries combining",
  undefined,
  "   +   a, b , c, d ",
  [BuiltInLanguage.javascript],
  {},
  {
    ...dbConfig.defaultAugmentationProperties,
    queriesInputCombines: true,
    queriesInput: [{ uses: "a" }, { uses: "b" }, { uses: "c" }, { uses: "d" }],
  },
);

calculateAugmentationMacro(
  "With packs",
  "   codeql/a , codeql/b   , codeql/c  , codeql/d  ",
  undefined,
  [BuiltInLanguage.javascript],
  {},
  {
    ...dbConfig.defaultAugmentationProperties,
    packsInput: ["codeql/a", "codeql/b", "codeql/c", "codeql/d"],
  },
);

calculateAugmentationMacro(
  "With packs combining",
  "   +   codeql/a, codeql/b, codeql/c, codeql/d",
  undefined,
  [BuiltInLanguage.javascript],
  {},
  {
    ...dbConfig.defaultAugmentationProperties,
    packsInputCombines: true,
    packsInput: ["codeql/a", "codeql/b", "codeql/c", "codeql/d"],
  },
);

calculateAugmentationMacro(
  "With repo property queries",
  undefined,
  undefined,
  [BuiltInLanguage.javascript],
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

calculateAugmentationMacro(
  "With repo property queries combining",
  undefined,
  undefined,
  [BuiltInLanguage.javascript],
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

const calculateAugmentationErrorMacro = makeMacro({
  exec: async (
    t: ExecutionContext,
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
  title: (title) => `Calculate Augmentation Error: ${title}`,
});

calculateAugmentationErrorMacro(
  "Plus (+) with nothing else (queries)",
  undefined,
  "   +   ",
  [BuiltInLanguage.javascript],
  {},
  /The workflow property "queries" is invalid/,
);

calculateAugmentationErrorMacro(
  "Plus (+) with nothing else (packs)",
  "   +   ",
  undefined,
  [BuiltInLanguage.javascript],
  {},
  /The workflow property "packs" is invalid/,
);

calculateAugmentationErrorMacro(
  "Plus (+) with nothing else (repo property queries)",
  undefined,
  undefined,
  [BuiltInLanguage.javascript],
  {
    "github-codeql-extra-queries": "    + ",
  },
  /The repository property "github-codeql-extra-queries" is invalid/,
);

calculateAugmentationErrorMacro(
  "Packs input with multiple languages",
  "   +  a/b, c/d ",
  undefined,
  [BuiltInLanguage.javascript, BuiltInLanguage.java],
  {},
  /Cannot specify a 'packs' input in a multi-language analysis/,
);

calculateAugmentationErrorMacro(
  "Packs input with no languages",
  "   +  a/b, c/d ",
  undefined,
  [],
  {},
  /No languages specified/,
);

calculateAugmentationErrorMacro(
  "Invalid packs",
  " a-pack-without-a-scope ",
  undefined,
  [BuiltInLanguage.javascript],
  {},
  /"a-pack-without-a-scope" is not a valid pack/,
);

test("parseUserConfig - successfully parses valid YAML", (t) => {
  const result = dbConfig.parseUserConfig(
    getRunnerLogger(true),
    "test",
    `
    paths-ignore:
      - "some/path"
    queries:
      - uses: foo
    some-unknown-option: true
    `,
    true,
  );
  t.truthy(result);
  if (t.truthy(result["paths-ignore"])) {
    t.is(result["paths-ignore"].length, 1);
    t.is(result["paths-ignore"][0], "some/path");
  }
  if (t.truthy(result["queries"])) {
    t.is(result["queries"].length, 1);
    t.deepEqual(result["queries"][0], { uses: "foo" });
  }
});

test("parseUserConfig - throws a ConfigurationError if the file is not valid YAML", (t) => {
  t.throws(
    () =>
      dbConfig.parseUserConfig(
        getRunnerLogger(true),
        "test",
        `
        paths-ignore:
         - "some/path"
         queries:
         - foo
        `,
        true,
      ),
    {
      instanceOf: ConfigurationError,
    },
  );
});

test("parseUserConfig - validation isn't picky about `query-filters`", (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  t.notThrows(() =>
    dbConfig.parseUserConfig(
      logger,
      "test",
      `
        query-filters:
          - something
          - include: foo
          - exclude: bar
        `,
      true,
    ),
  );
});

test("parseUserConfig - throws a ConfigurationError if validation fails", (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  t.throws(
    () =>
      dbConfig.parseUserConfig(
        logger,
        "test",
        `
        paths-ignore:
         - "some/path"
        queries: true
        `,
        true,
      ),
    {
      instanceOf: ConfigurationError,
      message:
        'The configuration file "test" is invalid: instance.queries is not of a type(s) array.',
    },
  );

  const expectedMessages = ["instance.queries is not of a type(s) array"];
  checkExpectedLogMessages(t, loggedMessages, expectedMessages);
});

test("parseUserConfig - throws no ConfigurationError if validation should fail, but feature is disabled", (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  t.notThrows(() =>
    dbConfig.parseUserConfig(
      logger,
      "test",
      `
        paths-ignore:
         - "some/path"
        queries: true
        `,
      false,
    ),
  );
});
