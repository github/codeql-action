# SARIF formatter for ESLint

`eslint-formatter-sarif` is a formatter for [ESLint](https://www.npmjs.com/package/eslint) that produces output in the SARIF (Static Analysis Results Interchange Format) v2.1.0 format.

It is available as an npm module [@microsoft/eslint-formatter-sarif](https://www.npmjs.com/package/@microsoft/eslint-formatter-sarif).

# Installation and usage

1. To install ESLint, follow the instructions at [Getting Started with ESLint](https://eslint.org/docs/3.0.0/user-guide/getting-started).

2. To install the ESLint SARIF formatter:

    ```
    npm install @microsoft/eslint-formatter-sarif --save-dev
    ```

3. To run ESLint with the SARIF formatter:

    ```
    ./node-modules/.bin/eslint -f @microsoft/eslint-formatter-sarif -o yourfile.sarif yourfile.js
    ```

Note that you *cannot* use the abbreviated form `-f sarif`, because that only works when the npm module name is of the form `eslint-formatter-example`, and the ESLint SARIF formatter module is not `eslint-formatter-sarif`; it's `@microsoft/eslint-formatter-sarif`. Alternatively, you can use the form `-f @microsoft/sarif`.

# Developer details

To embed the contents of the analyzed source files in the resulting SARIF file:

```bat
set SARIF_ESLINT_EMBED=true
```

To disable content embedding:

```bat
set SARIF_ESLINT_EMBED=
```

To run unit tests:

```bat
RunTests.cmd
```
