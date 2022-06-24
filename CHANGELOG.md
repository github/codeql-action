# CodeQL Action Changelog

## [UNRELEASED]

- The combination of python2 and poetry is no longer supported. See https://github.com/actions/setup-python/issues/374 for more details. [#1124](https://github.com/github/codeql-action/pull/1124)

## 2.1.14 - 22 Jun 2022

No user facing changes.

## 2.1.13 - 21 Jun 2022

- Update default CodeQL bundle version to 2.9.4. [#1100](https://github.com/github/codeql-action/pull/1100)

## 2.1.12 - 01 Jun 2022

- Update default CodeQL bundle version to 2.9.3. [#1084](https://github.com/github/codeql-action/pull/1084)

## 2.1.11 - 17 May 2022

- Update default CodeQL bundle version to 2.9.2. [#1074](https://github.com/github/codeql-action/pull/1074)

## 2.1.10 - 10 May 2022

- Update default CodeQL bundle version to 2.9.1. [#1056](https://github.com/github/codeql-action/pull/1056)
- When `wait-for-processing` is enabled, the workflow will now fail if there were any errors that occurred during processing of the analysis results.

## 2.1.9 - 27 Apr 2022

- Add `working-directory` input to the `autobuild` action. [#1024](https://github.com/github/codeql-action/pull/1024)
- The `analyze` and `upload-sarif` actions will now wait up to 2 minutes for processing to complete after they have uploaded the results so they can report any processing errors that occurred. This behavior can be disabled by setting the `wait-for-processing` action input to `"false"`. [#1007](https://github.com/github/codeql-action/pull/1007)
- Update default CodeQL bundle version to 2.9.0.
- Fix a bug where [status reporting fails on Windows](https://github.com/github/codeql-action/issues/1041). [#1042](https://github.com/github/codeql-action/pull/1042)

## 2.1.8 - 08 Apr 2022

- Update default CodeQL bundle version to 2.8.5. [#1014](https://github.com/github/codeql-action/pull/1014)
- Fix error where the init action would fail due to a GitHub API request that was taking too long to complete [#1025](https://github.com/github/codeql-action/pull/1025)

## 2.1.7 - 05 Apr 2022

- A bug where additional queries specified in the workflow file would sometimes not be respected has been fixed. [#1018](https://github.com/github/codeql-action/pull/1018)

## 2.1.6 - 30 Mar 2022

- [v2+ only] The CodeQL Action now runs on Node.js v16. [#1000](https://github.com/github/codeql-action/pull/1000)
- Update default CodeQL bundle version to 2.8.4. [#990](https://github.com/github/codeql-action/pull/990)
- Fix a bug where an invalid `commit_oid` was being sent to code scanning when a custom checkout path was being used. [#956](https://github.com/github/codeql-action/pull/956)

## 1.1.5 - 15 Mar 2022

- Update default CodeQL bundle version to 2.8.3.
- The CodeQL runner is now deprecated and no longer being released. For more information, see [CodeQL runner deprecation](https://github.blog/changelog/2021-09-21-codeql-runner-deprecation/).
- Fix two bugs that cause action failures with GHES 3.3 or earlier. [#978](https://github.com/github/codeql-action/pull/978)
  - Fix `not a permitted key` invalid requests with GHES 3.1 or earlier
  - Fix `RUNNER_ARCH environment variable must be set` errors with GHES 3.3 or earlier

## 1.1.4 - 07 Mar 2022

- Update default CodeQL bundle version to 2.8.2. [#950](https://github.com/github/codeql-action/pull/950)
- Fix a bug where old results can be uploaded if the languages in a repository change when using a non-ephemeral self-hosted runner. [#955](https://github.com/github/codeql-action/pull/955)

## 1.1.3 - 23 Feb 2022

- Fix a bug where the CLR traces can continue tracing even after tracing should be stopped. [#938](https://github.com/github/codeql-action/pull/938)

## 1.1.2 - 17 Feb 2022

- Due to potential issues for GHES 3.1–3.3 customers who are using recent versions of the CodeQL Action via GHES Connect, the CodeQL Action now uses Node.js v12 rather than Node.js v16. [#937](https://github.com/github/codeql-action/pull/937)

## 1.1.1 - 17 Feb 2022

- The CodeQL CLI versions up to and including version 2.4.4 are not compatible with the CodeQL Action 1.1.1 and later. The Action will emit an error if it detects that it is being used by an incompatible version of the CLI. [#931](https://github.com/github/codeql-action/pull/931)
- Update default CodeQL bundle version to 2.8.1. [#925](https://github.com/github/codeql-action/pull/925)

## 1.1.0 - 11 Feb 2022

- The CodeQL Action now uses Node.js v16. [#909](https://github.com/github/codeql-action/pull/909)
- Beware that the CodeQL build tracer in this release (and in all earlier releases) is incompatible with Windows 11 and Windows Server 2022. This incompatibility affects database extraction for compiled languages: cpp, csharp, go, and java. As a result, analyzing these languages with the `windows-latest` or `windows-2022` Actions virtual environments is currently unsupported. If you use any of these languages, please use the `windows-2019` Actions virtual environment or otherwise avoid these specific Windows versions until a new release fixes this incompatibility.

## 1.0.32 - 07 Feb 2022

- Add `sarif-id` as an output for the `upload-sarif` and `analyze` actions. [#889](https://github.com/github/codeql-action/pull/889)
- Add `ref` and `sha` inputs to the `analyze` action, which override the defaults provided by the GitHub Action context. [#889](https://github.com/github/codeql-action/pull/889)
- Update default CodeQL bundle version to 2.8.0. [#911](https://github.com/github/codeql-action/pull/911)

## 1.0.31 - 31 Jan 2022

- Remove `experimental` message when using custom CodeQL packages. [#888](https://github.com/github/codeql-action/pull/888)
- Add a better warning message stating that experimental features will be disabled if the workflow has been triggered by a pull request from a fork or the `security-events: write` permission is not present. [#882](https://github.com/github/codeql-action/pull/882)

## 1.0.30 - 24 Jan 2022

- Display a better error message when encountering a workflow that runs the `codeql-action/init` action multiple times. [#876](https://github.com/github/codeql-action/pull/876)
- Update default CodeQL bundle version to 2.7.6. [#877](https://github.com/github/codeql-action/pull/877)

## 1.0.29 - 21 Jan 2022

- The feature to wait for SARIF processing to complete after upload has been disabled by default due to a bug in its interaction with pull requests from forks.

## 1.0.28 - 18 Jan 2022

- Update default CodeQL bundle version to 2.7.5. [#866](https://github.com/github/codeql-action/pull/866)
- Fix a bug where SARIF files were failing upload due to an invalid test for unique categories. [#872](https://github.com/github/codeql-action/pull/872)

## 1.0.27 - 11 Jan 2022

- The `analyze` and `upload-sarif` actions will now wait up to 2 minutes for processing to complete after they have uploaded the results so they can report any processing errors that occurred. This behavior can be disabled by setting the `wait-for-processing` action input to `"false"`. [#855](https://github.com/github/codeql-action/pull/855)

## 1.0.26 - 10 Dec 2021

- Update default CodeQL bundle version to 2.7.3. [#842](https://github.com/github/codeql-action/pull/842)

## 1.0.25 - 06 Dec 2021

No user facing changes.

## 1.0.24 - 23 Nov 2021

- Update default CodeQL bundle version to 2.7.2. [#827](https://github.com/github/codeql-action/pull/827)

## 1.0.23 - 16 Nov 2021

- The `upload-sarif` action now allows multiple uploads in a single job, as long as they have different categories. [#801](https://github.com/github/codeql-action/pull/801)
- Update default CodeQL bundle version to 2.7.1. [#816](https://github.com/github/codeql-action/pull/816)

## 1.0.22 - 04 Nov 2021

- The `init` step of the Action now supports `ram` and `threads` inputs to limit resource use of CodeQL extractors. These inputs also serve as defaults to the subsequent `analyze` step, which finalizes the database and executes queries. [#738](https://github.com/github/codeql-action/pull/738)
- When used with CodeQL 2.7.1 or above, the Action now includes custom query help in the analysis results uploaded to GitHub code scanning, if available. To add help text for a custom query, create a Markdown file next to the `.ql` file containing the query, using the same base name but the file extension `.md`. [#804](https://github.com/github/codeql-action/pull/804)

## 1.0.21 - 28 Oct 2021

- Update default CodeQL bundle version to 2.7.0. [#795](https://github.com/github/codeql-action/pull/795)

## 1.0.20 - 25 Oct 2021

No user facing changes.

## 1.0.19 - 18 Oct 2021

No user facing changes.

## 1.0.18 - 08 Oct 2021

- Fixed a bug where some builds were no longer being traced correctly. [#766](https://github.com/github/codeql-action/pull/766)

## 1.0.17 - 07 Oct 2021

- Update default CodeQL bundle version to 2.6.3. [#761](https://github.com/github/codeql-action/pull/761)

## 1.0.16 - 05 Oct 2021

No user facing changes.

## 1.0.15 - 22 Sep 2021

- Update default CodeQL bundle version to 2.6.2. [#746](https://github.com/github/codeql-action/pull/746)

## 1.0.14 - 09 Sep 2021

- Update default CodeQL bundle version to 2.6.1. [#733](https://github.com/github/codeql-action/pull/733)

## 1.0.13 - 06 Sep 2021

- Update default CodeQL bundle version to 2.6.0. [#712](https://github.com/github/codeql-action/pull/712)
- Update baseline lines of code counter for python. All multi-line strings are counted as code. [#714](https://github.com/github/codeql-action/pull/714)
- Remove old baseline LoC injection [#715](https://github.com/github/codeql-action/pull/715)

## 1.0.12 - 16 Aug 2021

- Update README to include a sample permissions block. [#689](https://github.com/github/codeql-action/pull/689)

## 1.0.11 - 09 Aug 2021

- Update default CodeQL bundle version to 2.5.9. [#687](https://github.com/github/codeql-action/pull/687)

## 1.0.10 - 03 Aug 2021

- Fix an issue where a summary of diagnostics information from CodeQL was not output to the logs of the `analyze` step of the Action. [#672](https://github.com/github/codeql-action/pull/672)

## 1.0.9 - 02 Aug 2021

No user facing changes.

## 1.0.8 - 26 Jul 2021

- Update default CodeQL bundle version to 2.5.8. [#631](https://github.com/github/codeql-action/pull/631)

## 1.0.7 - 21 Jul 2021

No user facing changes.

## 1.0.6 - 19 Jul 2021

- The `init` step of the Action now supports a `source-root` input as a path to the root source-code directory. By default, the path is relative to `$GITHUB_WORKSPACE`. [#607](https://github.com/github/codeql-action/pull/607)
- The `init` step will now try to install a few Python tools needed by this Action when running on a self-hosted runner. [#616](https://github.com/github/codeql-action/pull/616)

## 1.0.5 - 12 Jul 2021

- The `analyze` step of the Action now supports a `skip-queries` option to merely build the CodeQL database without analyzing. This functionality is not present in the runner. Additionally, the step will no longer fail if it encounters a finalized database, and will instead continue with query execution. [#602](https://github.com/github/codeql-action/pull/602)
- Update the warning message when the baseline lines of code count is unavailable. [#608](https://github.com/github/codeql-action/pull/608)

## 1.0.4 - 28 Jun 2021

- Fix `RUNNER_TEMP environment variable must be set` when using runner. [#594](https://github.com/github/codeql-action/pull/594)
- Fix couting of lines of code for C# projects. [#586](https://github.com/github/codeql-action/pull/586)

## 1.0.3 - 23 Jun 2021

No user facing changes.

## 1.0.2 - 17 Jun 2021

- Fix out of memory in hash computation. [#550](https://github.com/github/codeql-action/pull/550)
- Clean up logging during analyze results. [#557](https://github.com/github/codeql-action/pull/557)
- Add `--finalize-dataset` to `database finalize` call, freeing up some disk space after database creation. [#558](https://github.com/github/codeql-action/pull/558)

## 1.0.1 - 07 Jun 2021

- Pass the `--sarif-group-rules-by-pack` argument to CodeQL CLI invocations that generate SARIF. This means the SARIF rule object for each query will now be found underneath its corresponding query pack in `runs[].tool.extensions`. [#546](https://github.com/github/codeql-action/pull/546)
- Output the location of CodeQL databases created in the analyze step. [#543](https://github.com/github/codeql-action/pull/543)

## 1.0.0 - 31 May 2021

- Add this changelog file. [#507](https://github.com/github/codeql-action/pull/507)
- Improve grouping of analysis logs. Add a new log group containing a summary of metrics and diagnostics, if they were produced by CodeQL builtin queries. [#515](https://github.com/github/codeql-action/pull/515)
- Add metrics and diagnostics summaries from custom query suites to the analysis summary log group. [#532](https://github.com/github/codeql-action/pull/532)
