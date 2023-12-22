# CodeQL Action Changelog

See the [releases page](https://github.com/github/codeql-action/releases) for the relevant changes to the CodeQL CLI and language packs.

Note that the only difference between `v2` and `v3` of the CodeQL Action is the node version they support, with `v3` running on node 20 while we continue to release `v2` to support running on node 16. For example `3.22.11` was the first `v3` release and is functionally identical to `2.22.11`. This approach ensures an easy way to track exactly which features are included in different versions, indicated by the minor and patch version numbers.

## [UNRELEASED]

No user facing changes.

## 3.22.12 - 22 Dec 2023

- Update default CodeQL bundle version to 2.15.5. [#2047](https://github.com/github/codeql-action/pull/2047)

## 3.22.11 - 13 Dec 2023

- [v3+ only] The CodeQL Action now runs on Node.js v20. [#2006](https://github.com/github/codeql-action/pull/2006)

## 2.22.10 - 12 Dec 2023

- Update default CodeQL bundle version to 2.15.4. [#2016](https://github.com/github/codeql-action/pull/2016)

## 2.22.9 - 07 Dec 2023

No user facing changes.

## 2.22.8 - 23 Nov 2023

- Update default CodeQL bundle version to 2.15.3. [#2001](https://github.com/github/codeql-action/pull/2001)

## 2.22.7 - 16 Nov 2023

- Add a deprecation warning for customers using CodeQL version 2.11.5 and earlier. These versions of CodeQL were discontinued on 8 November 2023 alongside GitHub Enterprise Server 3.7, and will be unsupported by CodeQL Action v2.23.0 and later. [#1993](https://github.com/github/codeql-action/pull/1993)
  - If you are using one of these versions, please update to CodeQL CLI version 2.11.6 or later. For instance, if you have specified a custom version of the CLI using the 'tools' input to the 'init' Action, you can remove this input to use the default version.
  - Alternatively, if you want to continue using a version of the CodeQL CLI between 2.10.5 and 2.11.5, you can replace `github/codeql-action/*@v2` by `github/codeql-action/*@v2.22.7` in your code scanning workflow to ensure you continue using this version of the CodeQL Action.

## 2.22.6 - 14 Nov 2023

- Customers running Python analysis on macOS using version 2.14.6 or earlier of the CodeQL CLI should upgrade to CodeQL CLI version 2.15.0 or later. If you do not wish to upgrade the CodeQL CLI, ensure that you are using Python version 3.11 or earlier, as CodeQL version 2.14.6 and earlier do not support Python 3.12. You can achieve this by adding a [`setup-python`](https://github.com/actions/setup-python) step to your code scanning workflow before the step that invokes `github/codeql-action/init`.
- Update default CodeQL bundle version to 2.15.2. [#1978](https://github.com/github/codeql-action/pull/1978)

## 2.22.5 - 27 Oct 2023

No user facing changes.

## 2.22.4 - 20 Oct 2023

- Update default CodeQL bundle version to 2.15.1. [#1953](https://github.com/github/codeql-action/pull/1953)
- Users will begin to see warnings on Node.js 16 deprecation in their Actions logs on code scanning runs starting October 23, 2023.
  - All code scanning workflows should continue to succeed regardless of the warning.
  - The team at GitHub maintaining the CodeQL Action is aware of the deprecation timeline and actively working on creating another version of the CodeQL Action, v3, that will bump us to Node 20.
  - For more information, and to communicate with the maintaining team, please use [this issue](https://github.com/github/codeql-action/issues/1959).

## 2.22.3 - 13 Oct 2023

- Provide an authentication token when downloading the CodeQL Bundle from the API of a GitHub Enterprise Server instance. [#1945](https://github.com/github/codeql-action/pull/1945)

## 2.22.2 - 12 Oct 2023

- Update default CodeQL bundle version to 2.15.0. [#1938](https://github.com/github/codeql-action/pull/1938)
- Improve the log output when an error occurs in an invocation of the CodeQL CLI. [#1927](https://github.com/github/codeql-action/pull/1927)

## 2.22.1 - 09 Oct 2023

- Add a workaround for Python 3.12, which is not supported in CodeQL CLI version 2.14.6 or earlier. If you are running an analysis on Windows and using Python 3.12 or later, the CodeQL Action will switch to running Python 3.11. In this case, if Python 3.11 is not found, then the workflow will fail. [#1928](https://github.com/github/codeql-action/pull/1928)

## 2.22.0 - 06 Oct 2023

- The CodeQL Action now requires CodeQL version 2.10.5 or later. For more information, see the corresponding changelog entry for CodeQL Action version 2.21.8. [#1907](https://github.com/github/codeql-action/pull/1907)
- The CodeQL Action no longer runs ML-powered queries. For more information, including details on our investment in AI-powered security technology, see ["CodeQL code scanning deprecates ML-powered alerts."](https://github.blog/changelog/2023-09-29-codeql-code-scanning-deprecates-ml-powered-alerts/) [#1910](https://github.com/github/codeql-action/pull/1910)
- Fix a bug which prevented tracing of projects using Go 1.21 and above on Linux. [#1909](https://github.com/github/codeql-action/pull/1909)

## 2.21.9 - 27 Sep 2023

- Update default CodeQL bundle version to 2.14.6. [#1897](https://github.com/github/codeql-action/pull/1897)
- We are rolling out a feature in October 2023 that will improve the success rate of C/C++ autobuild. [#1889](https://github.com/github/codeql-action/pull/1889)
- We are rolling out a feature in October 2023 that will provide specific file coverage information for C and C++, Java and Kotlin, and JavaScript and TypeScript. Currently file coverage information for each of these pairs of languages is grouped together. [#1903](https://github.com/github/codeql-action/pull/1903)
- Add a warning to help customers avoid inadvertently analyzing the same CodeQL language in multiple matrix jobs. [#1901](https://github.com/github/codeql-action/pull/1901)

## 2.21.8 - 19 Sep 2023

- Add a deprecation warning for customers using CodeQL version 2.10.4 and earlier. These versions of CodeQL were discontinued on 12 September 2023 alongside GitHub Enterprise Server 3.6, and will be unsupported by the next minor release of the CodeQL Action. [#1884](https://github.com/github/codeql-action/pull/1884)
  - If you are using one of these versions, please update to CodeQL CLI version 2.10.5 or later. For instance, if you have specified a custom version of the CLI using the 'tools' input to the 'init' Action, you can remove this input to use the default version.
  - Alternatively, if you want to continue using a version of the CodeQL CLI between 2.9.5 and 2.10.4, you can replace `github/codeql-action/*@v2` by `github/codeql-action/*@v2.21.7` in your code scanning workflow to ensure you continue using this version of the CodeQL Action.
- Enable the following language aliases when using CodeQL 2.14.4 and later: `c-cpp` for C/C++ analysis, `java-kotlin` for Java/Kotlin analysis, and `javascript-typescript` for JavaScript/TypeScript analysis. [#1883](https://github.com/github/codeql-action/pull/1883)

## 2.21.7 - 14 Sep 2023

- Update default CodeQL bundle version to 2.14.5. [#1882](https://github.com/github/codeql-action/pull/1882)

## 2.21.6 - 13 Sep 2023

- Better error message when there is a failure to determine the merge base of the code to analysis. [#1860](https://github.com/github/codeql-action/pull/1860)
- Improve the calculation of default amount of RAM used for query execution on GitHub Enterprise Server. This now reduces in proportion to the runner's total memory to better account for system memory usage, helping to avoid out-of-memory failures on larger runners. This feature is already available to GitHub.com users. [#1866](https://github.com/github/codeql-action/pull/1866)
- Enable improved file coverage information for GitHub Enterprise Server users. This feature is already available to GitHub.com users. [#1867](https://github.com/github/codeql-action/pull/1867)
- Update default CodeQL bundle version to 2.14.4. [#1873](https://github.com/github/codeql-action/pull/1873)

## 2.21.5 - 28 Aug 2023

- Update default CodeQL bundle version to 2.14.3. [#1845](https://github.com/github/codeql-action/pull/1845)
- Fixed a bug in CodeQL Action 2.21.3 onwards that affected beta support for [Project Lombok](https://projectlombok.org/) when analyzing Java. The environment variable `CODEQL_EXTRACTOR_JAVA_RUN_ANNOTATION_PROCESSORS` will now be respected if it was manually configured in the workflow. [#1844](https://github.com/github/codeql-action/pull/1844)
- Enable support for Kotlin 1.9.20 when running with CodeQL CLI v2.13.4 through v2.14.3. [#1853](https://github.com/github/codeql-action/pull/1853)

## 2.21.4 - 14 Aug 2023

- Update default CodeQL bundle version to 2.14.2. [#1831](https://github.com/github/codeql-action/pull/1831)
- Log a warning if the amount of available disk space runs low during a code scanning run. [#1825](https://github.com/github/codeql-action/pull/1825)
- When downloading CodeQL bundle version 2.13.4 and later, cache these bundles in the Actions tool cache using a simpler version number. [#1832](https://github.com/github/codeql-action/pull/1832)
- Fix an issue that first appeared in CodeQL Action v2.21.2 that prevented CodeQL invocations from being logged. [#1833](https://github.com/github/codeql-action/pull/1833)
- We are rolling out a feature in August 2023 that will improve the quality of file coverage information. [#1835](https://github.com/github/codeql-action/pull/1835)

## 2.21.3 - 08 Aug 2023

- We are rolling out a feature in August 2023 that will improve multi-threaded performance on larger runners. [#1817](https://github.com/github/codeql-action/pull/1817)
- We are rolling out a feature in August 2023 that adds beta support for [Project Lombok](https://projectlombok.org/) when analyzing Java. [#1809](https://github.com/github/codeql-action/pull/1809)
- Reduce disk space usage when downloading the CodeQL bundle. [#1820](https://github.com/github/codeql-action/pull/1820)

## 2.21.2 - 28 Jul 2023

- Update default CodeQL bundle version to 2.14.1. [#1797](https://github.com/github/codeql-action/pull/1797)
- Avoid duplicating the analysis summary within the logs. [#1811](https://github.com/github/codeql-action/pull/1811)

## 2.21.1 - 26 Jul 2023

- Improve the handling of fatal errors from the CodeQL CLI. [#1795](https://github.com/github/codeql-action/pull/1795)
- Add the `sarif-output` output to the analyze action that contains the path to the directory of the generated SARIF. [#1799](https://github.com/github/codeql-action/pull/1799)

## 2.21.0 - 19 Jul 2023

- CodeQL Action now requires CodeQL CLI 2.9.4 or later. For more information, see the corresponding changelog entry for CodeQL Action version 2.20.4. [#1724](https://github.com/github/codeql-action/pull/1724)

## 2.20.4 - 14 Jul 2023

- This is the last release of the Action that supports CodeQL CLI versions 2.8.5 to 2.9.3. These versions of the CodeQL CLI were deprecated on June 20, 2023 alongside GitHub Enterprise Server 3.5 and will not be supported by the next release of the CodeQL Action (2.21.0).
  - If you are using one of these versions, please update to CodeQL CLI version 2.9.4 or later. For instance, if you have specified a custom version of the CLI using the 'tools' input to the 'init' Action, you can remove this input to use the default version.
  - Alternatively, if you want to continue using a version of the CodeQL CLI between 2.8.5 and 2.9.3, you can replace 'github/codeql-action/*@v2' by 'github/codeql-action/*@v2.20.4' in your code scanning workflow to ensure you continue using this version of the CodeQL Action.
- We are rolling out a feature in July 2023 that will slightly reduce the default amount of RAM used for query execution, in proportion to the runner's total memory. This will help to avoid out-of-memory failures on larger runners. [#1760](https://github.com/github/codeql-action/pull/1760)
- Update default CodeQL bundle version to 2.14.0. [#1762](https://github.com/github/codeql-action/pull/1762)

## 2.20.3 - 06 Jul 2023

- Update default CodeQL bundle version to 2.13.5. [#1743](https://github.com/github/codeql-action/pull/1743)

## 2.20.2 - 03 Jul 2023

No user facing changes.

## 2.20.1 - 21 Jun 2023

- Update default CodeQL bundle version to 2.13.4. [#1721](https://github.com/github/codeql-action/pull/1721)
- Experimental: add a new `resolve-environment` action which attempts to infer a configuration for the build environment that is required to build a given project. Do not use this in production as it is part of an internal experiment and subject to change at any time.

## 2.20.0 - 13 Jun 2023

- Bump the version of the Action to 2.20.0. This ensures that users who received a Dependabot upgrade to [`cdcdbb5`](https://github.com/github/codeql-action/commit/cdcdbb579706841c47f7063dda365e292e5cad7a), which was mistakenly marked as Action version 2.13.4, continue to receive updates to the CodeQL Action. Full details in [#1729](https://github.com/github/codeql-action/pull/1729)

## 2.3.6 - 01 Jun 2023

- Update default CodeQL bundle version to 2.13.3. [#1698](https://github.com/github/codeql-action/pull/1698)

## 2.3.5 - 25 May 2023

- Allow invalid URIs to be used as values to `artifactLocation.uri` properties. This reverses a change from [#1668](https://github.com/github/codeql-action/pull/1668) that inadvertently led to stricter validation of some URI values. [#1705](https://github.com/github/codeql-action/pull/1705)
- Gracefully handle invalid URIs when fingerprinting. [#1694](https://github.com/github/codeql-action/pull/1694)

## 2.3.4 - 24 May 2023

- Updated the SARIF 2.1.0 JSON schema file to the latest from [oasis-tcs/sarif-spec](https://github.com/oasis-tcs/sarif-spec/blob/123e95847b13fbdd4cbe2120fa5e33355d4a042b/Schemata/sarif-schema-2.1.0.json). [#1668](https://github.com/github/codeql-action/pull/1668)
- We are rolling out a feature in May 2023 that will disable Python dependency installation for new users of the CodeQL Action. This improves the speed of analysis while having only a very minor impact on results. [#1676](https://github.com/github/codeql-action/pull/1676)
- We are improving the way that [CodeQL bundles](https://github.com/github/codeql-action/releases) are tagged to make it possible to easily identify bundles by their CodeQL semantic version. [#1682](https://github.com/github/codeql-action/pull/1682)
  - As of CodeQL CLI 2.13.4, CodeQL bundles will be tagged using semantic versions, for example `codeql-bundle-v2.13.4`, instead of timestamps, like `codeql-bundle-20230615`.
  - This change does not affect the majority of workflows, and we will not be changing tags for existing bundle releases.
  - Some workflows with custom logic that depends on the specific format of the CodeQL bundle tag may need to be updated. For example, if your workflow matches CodeQL bundle tag names against a `codeql-bundle-yyyymmdd` pattern, you should update it to also recognize `codeql-bundle-vx.y.z` tags.
- Remove the requirement for `on.push` and `on.pull_request` to trigger on the same branches. [#1675](https://github.com/github/codeql-action/pull/1675)

## 2.3.3 - 04 May 2023

- Update default CodeQL bundle version to 2.13.1. [#1664](https://github.com/github/codeql-action/pull/1664)
- You can now configure CodeQL within your code scanning workflow by passing a `config` input to the `init` Action. See [Using a custom configuration file](https://aka.ms/code-scanning-docs/config-file) for more information about configuring code scanning. [#1590](https://github.com/github/codeql-action/pull/1590)

## 2.3.2 - 27 Apr 2023

No user facing changes.

## 2.3.1 - 26 Apr 2023

No user facing changes.

## 2.3.0 - 21 Apr 2023

- Update default CodeQL bundle version to 2.13.0. [#1649](https://github.com/github/codeql-action/pull/1649)
- Bump the minimum CodeQL bundle version to 2.8.5. [#1618](https://github.com/github/codeql-action/pull/1618)

## 2.2.12 - 13 Apr 2023

- Include the value of the `GITHUB_RUN_ATTEMPT` environment variable in the telemetry sent to GitHub. [#1640](https://github.com/github/codeql-action/pull/1640)
- Improve the ease of debugging failed runs configured using [default setup](https://docs.github.com/en/code-security/code-scanning/automatically-scanning-your-code-for-vulnerabilities-and-errors/configuring-code-scanning-for-a-repository#configuring-code-scanning-automatically). The CodeQL Action will now upload diagnostic information to Code Scanning from failed runs configured using default setup. You can view this diagnostic information on the [tool status page](https://docs.github.com/en/code-security/code-scanning/automatically-scanning-your-code-for-vulnerabilities-and-errors/about-the-tool-status-page). [#1619](https://github.com/github/codeql-action/pull/1619)

## 2.2.11 - 06 Apr 2023

No user facing changes.

## 2.2.10 - 05 Apr 2023

- Update default CodeQL bundle version to 2.12.6. [#1629](https://github.com/github/codeql-action/pull/1629)

## 2.2.9 - 27 Mar 2023

- Customers post-processing the SARIF output of the `analyze` Action before uploading it to Code Scanning will benefit from an improved debugging experience. [#1598](https://github.com/github/codeql-action/pull/1598)
  - The CodeQL Action will now upload a SARIF file with debugging information to Code Scanning on failed runs for customers using `upload: false`. Previously, this was only available for customers using the default value of the `upload` input.
  - The `upload` input to the `analyze` Action now accepts the following values:
    - `always` is the default value, which uploads the SARIF file to Code Scanning for successful and failed runs.
    - `failure-only` is recommended for customers post-processing the SARIF file before uploading it to Code Scanning. This option uploads debugging information to Code Scanning for failed runs to improve the debugging experience.
    - `never` avoids uploading the SARIF file to Code Scanning even if the code scanning run fails. This is not recommended for external users since it complicates debugging.
    - The legacy `true` and `false` options will be interpreted as `always` and `failure-only` respectively.

## 2.2.8 - 22 Mar 2023

- Update default CodeQL bundle version to 2.12.5. [#1585](https://github.com/github/codeql-action/pull/1585)

## 2.2.7 - 15 Mar 2023

No user facing changes.

## 2.2.6 - 10 Mar 2023

- Update default CodeQL bundle version to 2.12.4. [#1561](https://github.com/github/codeql-action/pull/1561)

## 2.2.5 - 24 Feb 2023

- Update default CodeQL bundle version to 2.12.3. [#1543](https://github.com/github/codeql-action/pull/1543)

## 2.2.4 - 10 Feb 2023

No user facing changes.

## 2.2.3 - 08 Feb 2023

- Update default CodeQL bundle version to 2.12.2. [#1518](https://github.com/github/codeql-action/pull/1518)

## 2.2.2 - 06 Feb 2023

- Fix an issue where customers using the CodeQL Action with the [CodeQL Action sync tool](https://docs.github.com/en/enterprise-server@3.7/admin/code-security/managing-github-advanced-security-for-your-enterprise/configuring-code-scanning-for-your-appliance#configuring-codeql-analysis-on-a-server-without-internet-access) would not be able to obtain the CodeQL tools. [#1517](https://github.com/github/codeql-action/pull/1517)

## 2.2.1 - 27 Jan 2023

No user facing changes.

## 2.2.0 - 26 Jan 2023

- Improve stability when choosing the default version of CodeQL to use in code scanning workflow runs on Actions on GitHub.com. [#1475](https://github.com/github/codeql-action/pull/1475)
  - This change addresses customer reports of code scanning alerts on GitHub.com being closed and reopened during the rollout of new versions of CodeQL in the GitHub Actions [runner images](https://github.com/actions/runner-images).
  - **No change is required for the majority of workflows**, including:
    - Workflows on GitHub.com hosted runners using the latest version (`v2`) of the CodeQL Action.
    - Workflows on GitHub.com hosted runners that are pinned to specific versions of the CodeQL Action from `v2.2.0` onwards.
    - Workflows on GitHub Enterprise Server.
  - **A change may be required** for workflows on GitHub.com hosted runners that are pinned to specific versions of the CodeQL Action before `v2.2.0` (e.g. `v2.1.32`):
    - Previously, these workflows would obtain the latest version of CodeQL from the Actions runner image.
    - Now, these workflows will download an older, compatible version of CodeQL from GitHub Releases. To use this older version, no change is required. To use the newest version of CodeQL, please update your workflows to reference the latest version of the CodeQL Action (`v2`).
  - **Internal changes**
    - These changes will not affect the majority of code scanning workflows. Continue reading only if your workflow uses [@actions/tool-cache](https://github.com/actions/toolkit/tree/main/packages/tool-cache) or relies on the precise location of CodeQL within the Actions tool cache.
    - The tool cache now contains **two** recent CodeQL versions (previously **one**).
    - Each CodeQL version is located under a directory named after the release date and version number, e.g. CodeQL 2.11.6 is now located under `CodeQL/2.11.6-20221211/x64/codeql` (previously `CodeQL/0.0.0-20221211/x64/codeql`).
- The maximum number of [SARIF runs](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning#run-object) per file has been increased from 15 to 20 for users uploading SARIF files to GitHub.com. This change will help ensure that Code Scanning can process SARIF files generated by third-party tools that have many runs. See the [GitHub API documentation](https://docs.github.com/en/rest/code-scanning#upload-an-analysis-as-sarif-data) for a list of all the limits around uploading SARIF. This change will be released to GitHub Enterprise Server as part of GHES 3.9.
- Update default CodeQL bundle version to 2.12.1. [#1498](https://github.com/github/codeql-action/pull/1498)
- Fix a bug that forced the `init` Action to run for at least two minutes on JavaScript. [#1494](https://github.com/github/codeql-action/pull/1494)

## 2.1.39 - 18 Jan 2023

- CodeQL Action v1 is now deprecated, and is no longer updated or supported. For better performance, improved security, and new features, upgrade to v2. For more information, see [this changelog post](https://github.blog/changelog/2023-01-18-code-scanning-codeql-action-v1-is-now-deprecated/). [#1467](https://github.com/github/codeql-action/pull/1466)
- Python automatic dependency installation will no longer fail for projects using Poetry that specify `virtualenvs.options.no-pip = true` in their `poetry.toml`. [#1431](https://github.com/github/codeql-action/pull/1431)
- Avoid printing a stack trace and error message when the action fails to find the SHA at the
  current directory. This will happen in several non-error states and so we now avoid cluttering the
  log with this message. [#1485](https://github.com/github/codeql-action/pull/1485)

## 2.1.38 - 12 Jan 2023

- Update default CodeQL bundle version to 2.12.0. [#1466](https://github.com/github/codeql-action/pull/1466)

## 2.1.37 - 14 Dec 2022

- Update default CodeQL bundle version to 2.11.6. [#1433](https://github.com/github/codeql-action/pull/1433)

## 2.1.36 - 08 Dec 2022

- Update default CodeQL bundle version to 2.11.5. [#1412](https://github.com/github/codeql-action/pull/1412)
- Add a step that tries to upload a SARIF file for the workflow run when that workflow run fails. This will help better surface failed code scanning workflow runs. [#1393](https://github.com/github/codeql-action/pull/1393)
- Python automatic dependency installation will no longer consider dependency code installed in venv as user-written, for projects using Poetry that specify `virtualenvs.in-project = true` in their `poetry.toml`. [#1419](https://github.com/github/codeql-action/pull/1419)

## 2.1.35 - 01 Dec 2022

No user facing changes.

## 2.1.34 - 25 Nov 2022

- Update default CodeQL bundle version to 2.11.4. [#1391](https://github.com/github/codeql-action/pull/1391)
- Fixed a bug where some the `init` action and the `analyze` action would have different sets of experimental feature flags enabled. [#1384](https://github.com/github/codeql-action/pull/1384)

## 2.1.33 - 16 Nov 2022

- Go is now analyzed in the same way as other compiled languages such as C/C++, C#, and Java. This completes the rollout of the feature described in [CodeQL Action version 2.1.27](#2127---06-oct-2022). [#1322](https://github.com/github/codeql-action/pull/1322)
- Bump the minimum CodeQL bundle version to 2.6.3. [#1358](https://github.com/github/codeql-action/pull/1358)

## 2.1.32 - 14 Nov 2022

- Update default CodeQL bundle version to 2.11.3. [#1348](https://github.com/github/codeql-action/pull/1348)
- Update the ML-powered additional query pack for JavaScript to version 0.4.0. [#1351](https://github.com/github/codeql-action/pull/1351)

## 2.1.31 - 04 Nov 2022

- The `rb/weak-cryptographic-algorithm` Ruby query has been updated to no longer report uses of hash functions such as `MD5` and `SHA1` even if they are known to be weak. These hash algorithms are used very often in non-sensitive contexts, making the query too imprecise in practice. For more information, see the corresponding change in the [github/codeql repository](https://github.com/github/codeql/pull/11129). [#1344](https://github.com/github/codeql-action/pull/1344)

## 2.1.30 - 02 Nov 2022

- Improve the error message when using CodeQL bundle version 2.7.2 and earlier in a workflow that runs on a runner image such as `ubuntu-22.04` that uses glibc version 2.34 and later. [#1334](https://github.com/github/codeql-action/pull/1334)

## 2.1.29 - 26 Oct 2022

- Update default CodeQL bundle version to 2.11.2. [#1320](https://github.com/github/codeql-action/pull/1320)

## 2.1.28 - 18 Oct 2022

- Update default CodeQL bundle version to 2.11.1. [#1294](https://github.com/github/codeql-action/pull/1294)
- Replace uses of GitHub Actions command `set-output` because it is now deprecated. See more information in the [GitHub Changelog](https://github.blog/changelog/2022-10-11-github-actions-deprecating-save-state-and-set-output-commands/). [#1301](https://github.com/github/codeql-action/pull/1301)

## 2.1.27 - 06 Oct 2022

- We are rolling out a feature of the CodeQL Action in October 2022 that changes the way that Go code is analyzed to be more consistent with other compiled languages like C/C++, C#, and Java. You do not need to alter your code scanning workflows. If you encounter any problems, please [file an issue](https://github.com/github/codeql-action/issues) or open a private ticket with GitHub Support and request an escalation to engineering.

## 2.1.26 - 29 Sep 2022

- Update default CodeQL bundle version to 2.11.0. [#1267](https://github.com/github/codeql-action/pull/1267)

## 2.1.25 - 21 Sep 2022

- We will soon be rolling out a feature of the CodeQL Action that stores some information used to make future runs faster in the GitHub Actions cache. Initially, this will only be enabled on JavaScript repositories, but we plan to add more languages to this soon. The new feature can be disabled by passing the `trap-caching: false` option to your workflow's `init` step, for example if you are already using the GitHub Actions cache for a different purpose and are near the storage limit for it.
- Add support for Python automatic dependency installation with Poetry 1.2 [#1258](https://github.com/github/codeql-action/pull/1258)

## 2.1.24 - 16 Sep 2022

No user facing changes.

## 2.1.23 - 14 Sep 2022

- Allow CodeQL packs to be downloaded from GitHub Enterprise Server instances, using the new `registries` input for the `init` action.  [#1221](https://github.com/github/codeql-action/pull/1221)
- Update default CodeQL bundle version to 2.10.5. [#1240](https://github.com/github/codeql-action/pull/1240)

## 2.1.22 - 01 Sep 2022

- Downloading CodeQL packs has been moved to the `init` step. Previously, CodeQL packs were downloaded during the `analyze` step. [#1218](https://github.com/github/codeql-action/pull/1218)
- Update default CodeQL bundle version to 2.10.4. [#1224](https://github.com/github/codeql-action/pull/1224)
- The newly released [Poetry 1.2](https://python-poetry.org/blog/announcing-poetry-1.2.0) is not yet supported. In the most common case where the CodeQL Action is automatically installing Python dependencies, it will continue to install and use Poetry 1.1 on its own. However, in certain cases such as with self-hosted runners, you may need to ensure Poetry 1.1 is installed yourself.

## 2.1.21 - 25 Aug 2022

- Improve error messages when the code scanning configuration file includes an invalid `queries` block or an invalid `query-filters` block. [#1208](https://github.com/github/codeql-action/pull/1208)
- Fix a bug where Go build tracing could fail on Windows. [#1209](https://github.com/github/codeql-action/pull/1209)

## 2.1.20 - 22 Aug 2022

No user facing changes.

## 2.1.19 - 17 Aug 2022

- Add the ability to filter queries from a code scanning run by using the `query-filters` option in the code scanning configuration file. [#1098](https://github.com/github/codeql-action/pull/1098)
- In debug mode, debug artifacts are now uploaded even if a step in the Actions workflow fails. [#1159](https://github.com/github/codeql-action/pull/1159)
- Update default CodeQL bundle version to 2.10.3. [#1178](https://github.com/github/codeql-action/pull/1178)
- The combination of python2 and Pipenv is no longer supported. [#1181](https://github.com/github/codeql-action/pull/1181)

## 2.1.18 - 03 Aug 2022

- Update default CodeQL bundle version to 2.10.2.  [#1156](https://github.com/github/codeql-action/pull/1156)

## 2.1.17 - 28 Jul 2022

- Update default CodeQL bundle version to 2.10.1.  [#1143](https://github.com/github/codeql-action/pull/1143)

## 2.1.16 - 13 Jul 2022

- You can now quickly debug a job that uses the CodeQL Action by re-running the job from the GitHub UI and selecting the "Enable debug logging" option. [#1132](https://github.com/github/codeql-action/pull/1132)
- You can now see diagnostic messages produced by the analysis in the logs of the `analyze` Action by enabling debug mode. To enable debug mode, pass `debug: true` to the `init` Action, or [enable step debug logging](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/enabling-debug-logging#enabling-step-debug-logging). This feature is available for CodeQL CLI version 2.10.0 and later. [#1133](https://github.com/github/codeql-action/pull/1133)

## 2.1.15 - 28 Jun 2022

- CodeQL query packs listed in the `packs` configuration field will be skipped if their target language is not being analyzed in the current Actions job. Previously, this would throw an error. [#1116](https://github.com/github/codeql-action/pull/1116)
- The combination of python2 and poetry is no longer supported. See <https://github.com/actions/setup-python/issues/374> for more details. [#1124](https://github.com/github/codeql-action/pull/1124)
- Update default CodeQL bundle version to 2.10.0. [#1123](https://github.com/github/codeql-action/pull/1123)

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
- Fix counting of lines of code for C# projects. [#586](https://github.com/github/codeql-action/pull/586)

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
