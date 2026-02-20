import { fixupPluginRules } from "@eslint/compat";
import github from "eslint-plugin-github";
import noAsyncForeach from "eslint-plugin-no-async-foreach";
import jsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";
import globals from "globals";

const githubFlatConfigs = github.getFlatConfigs();

export default [
  {
    ignores: [
      "**/webpack.config.js",
      "build/**/*",
      "lib/**/*",
      "src/testdata/**/*",
      "tests/**/*",
      "build.mjs",
      "eslint.config.mjs",
      ".github/**/*",
    ],
  },
  // eslint-plugin-github recommended config (includes eslint:recommended,
  // eslint-plugin-import, eslint-comments, i18n-text, and github rules).
  githubFlatConfigs.recommended,
  // eslint-plugin-github typescript config (includes
  // @typescript-eslint/recommended and escompat).
  ...githubFlatConfigs.typescript,
  // Type-checked rules from typescript-eslint (the github plugin only
  // includes the base recommended rules, not the type-checked ones).
  ...tseslint.configs.recommendedTypeCheckedOnly,
  {
    plugins: {
      "no-async-foreach": fixupPluginRules(noAsyncForeach),
      "jsdoc": jsdoc,
    },

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",

      globals: {
        ...globals.node,
      },

      parserOptions: {
        project: "./tsconfig.json",
      },
    },

    settings: {
      "import/resolver": {
        node: {
          moduleDirectory: ["node_modules", "src"],
        },

        typescript: {},
      },
      "import/ignore": ["sinon", "uuid", "@octokit/plugin-retry", "del", "get-folder-size"],
    },

    rules: {
      "github/filenames-match-regex": ["error", "^[a-z0-9-]+(\\.test)?$"],
      "i18n-text/no-en": "off",

      "import/extensions": [
        "error",
        {
          json: {},
        },
      ],

      "import/no-amd": "error",
      "import/no-commonjs": "error",
      "import/no-cycle": "error",
      "import/no-dynamic-require": "error",

      "import/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: true,
        },
      ],

      "import/no-namespace": "off",
      "import/no-unresolved": "error",
      "import/no-webpack-loader-syntax": "error",

      "import/order": [
        "error",
        {
          alphabetize: {
            order: "asc",
          },

          "newlines-between": "always",
        },
      ],

      "max-len": [
        "error",
        {
          code: 120,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
        },
      ],

      "no-async-foreach/no-async-foreach": "error",
      "no-sequences": "error",
      "no-shadow": "off",
      "@typescript-eslint/no-shadow": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "one-var": ["error", "never"],

      // Check param names to ensure that we don't have outdated JSDocs.
      "jsdoc/check-param-names": [
        "error",
        {
          // We don't currently require full JSDoc coverage, so this rule
          // should not error on missing @param annotations.
          disableMissingParamChecks: true,
        }
      ],
    },
  },
  {
    files: ["**/*.ts", "**/*.js"],

    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/prefer-regexp-exec": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
        }
      ],
      "func-style": "off",
    },
  },
];
