# CodeQL Action and CodeQL Runner Changelog

## [UNRELEASED]
- Add an option to upload the CodeQL databases created by the analyze step as Actions artifacts. [#529](https://github.com/github/codeql-action/pull/529)

## 1.0.0 - 31 May 2021

- Add this changelog file. [#507](https://github.com/github/codeql-action/pull/507)
- Improve grouping of analysis logs. Add a new log group containing a summary of metrics and diagnostics, if they were produced by CodeQL builtin queries. [#515](https://github.com/github/codeql-action/pull/515)
- Add metrics and diagnostics summaries from custom query suites to the analysis summary log group. [#532](https://github.com/github/codeql-action/pull/532)
