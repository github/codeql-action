![Screenshot_2025-01-03-08-15-17-305_com google android gms](https://github.com/user-attachments/assets/54d329ac-d5c7-4fa0-966c-7db176edc367)
# CodeQL Action

This action runs GitHub's industry-leading semantic code analysis engine, [CodeQL](https://codeql.github.com/), against a repository's source code to find security vulnerabilities. It then automatically uploads the results to GitHub so they can be displayed on pull requests and in the repository's security tab. CodeQL runs an extensible set of [queries](https://github.com/github/codeql), which have been developed by the community and the [GitHub Security Lab](https://securitylab.github.com/) to find common vulnerabilities in your code.

For a list of recent changes, see the CodeQL Action's [changelog](CHANGELOG.md).

## License

This project is released under the [MIT License](LICENSE).

The underlying CodeQL CLI, used in this action, is licensed under the [GitHub CodeQL Terms and Conditions](https://securitylab.github.com/tools/codeql/license). As such, this action may be used on open source projects hosted on GitHub, and on private repositories that are owned by an organisation with GitHub Advanced Security enabled.

## Usage

We recommend using default setup to configure CodeQL analysis for your repository. For more information, see "[Configuring default setup for code scanning](https://docs.github.com/en/code-security/code-scanning/enabling-code-scanning/configuring-default-setup-for-code-scanning)."

You can also configure advanced setup for a repository to find security vulnerabilities in your code using a highly customizable code scanning configuration. For more information, see "[Configuring advanced setup for code scanning](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/configuring-advanced-setup-for-code-scanning)" and "[Customizing your advanced setup for code scanning](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/customizing-your-advanced-setup-for-code-scanning)."

### Actions

This repository contains several actions that enable you to analyze code in your repository using CodeQL and upload the analysis to GitHub Code Scanning. Actions in this repository also allow you to upload to GitHub analyses generated by any SARIF-producing SAST tool.

Actions for CodeQL analyses:

- `init`: Sets up CodeQL for analysis. For information about input parameters, see the [init action definition](https://github.com/github/codeql-action/blob/main/init/action.yml).
- `analyze`: Finalizes the CodeQL database, runs the analysis, and uploads the results to Code Scanning. For information about input parameters, see the [analyze action definition](https://github.com/github/codeql-action/blob/main/analyze/action.yml).

Actions for uploading analyses generated by third-party tools:

- `upload-sarif`: Uploads a SARIF file to Code Scanning. If you are using the `analyze` action, there is no reason to use this action as well. For information about input parameters, see the [upload-sarif action definition](https://github.com/github/codeql-action/blob/main/upload-sarif/action.yml).

Actions with special purposes and unlikely to be used directly:

- `autobuild`: Attempts to automatically build the code. Only used for analyzing languages that require a build. Use the `build-mode: autobuild` input in the `init` action instead. For information about input parameters, see the [autobuild action definition](https://github.com/github/codeql-action/blob/main/autobuild/action.yml).
- `resolve-environment`: [Experimental] Attempts to infer a build environment suitable for automatic builds. For information about input parameters, see the [resolve-environment action definition](https://github.com/github/codeql-action/blob/main/resolve-environment/action.yml).
- `start-proxy`: [Experimental] Start the HTTP proxy server. Internal use only and will change without notice. For information about input parameters, see the [start-proxy action definition](https://github.com/github/codeql-action/blob/main/start-proxy/action.yml).

### Workflow Permissions

All advanced setup code scanning workflows must have the `security-events: write` permission. Workflows in private repositories must additionally have the `contents: read` permission. For more information, see "[Assigning permissions to jobs](https://docs.github.com/en/actions/using-jobs/assigning-permissions-to-jobs)."

### Build Modes

The CodeQL Action supports different build modes for analyzing the source code. The available build modes are:

- `none`: The database will be created without building the source code. Available for all interpreted languages and some compiled languages.
- `autobuild`: The database will be created by attempting to automatically build the source code. Available for all compiled languages.
- `manual`: The database will be created by building the source code using a manually specified build command. To use this build mode, specify manual build steps in your workflow between the `init` and `analyze` steps. Available for all compiled languages.

#### Which build mode should I use?

Interpreted languages must use `none` for the build mode.

For compiled languages:

- `manual` build mode will typically produce the most precise results, but it is more difficult to set up and will cause the analysis to take slightly more time to run.
- `autobuild` build mode is simpler to set up, but will only work for projects with generic build steps that can be guessed by the heuristics of the autobuild scripts. If `autobuild` fails, then you must switch to `manual` or `none`. If `autobuild` succeeds, then the results and run time will be the same as `manual` mode.
- `none` build mode is also simpler to set up and is slightly faster to run, but there is a possibility that some alerts will be missed. This may happen if your repository does any code generation during compilation or if there are any dependencies downloaded from registries that the workflow does not have access to. `none` is not yet supported by C/C++, Swift, Go, or Kotlin.


## Supported versions of the CodeQL Action

The following versions of the CodeQL Action are currently supported:

- v3 (latest)
- v2 (deprecated, support will end on December 5th, 2024)

The only difference between CodeQL Action v2 and v3 is the version of Node.js on which they run. CodeQL Action v3 runs on Node 20, while CodeQL Action v2 runs on Node 16.

To provide the best experience to customers using older versions of GitHub Enterprise Server, we will continue to release CodeQL Action v2 so that these customers can continue to run the latest version of CodeQL as long as their version of GitHub Enterprise Server is supported. For example CodeQL Action v3.22.11 was the first release of CodeQL Action v3 and is functionally identical to v2.22.11. This approach provides an easy way to track exactly which features are included in different versions by looking at the minor and patch version numbers.

For more information, see "[Code scanning: deprecation of CodeQL Action v2](https://github.blog/changelog/2024-01-12-code-scanning-deprecation-of-codeql-action-v2/)."

## Supported versions of the CodeQL Bundle on GitHub Enterprise Server

We typically release new minor versions of the CodeQL Action and Bundle when a new minor version of GitHub Enterprise Server (GHES) is released. When a version of GHES is deprecated, the CodeQL Action and Bundle releases that shipped with it are deprecated as well.

| Minimum CodeQL Action | Minimum CodeQL Bundle Version | GitHub Environment | Notes |
|-----------------------|-------------------------------|--------------------|-------|
| `v3.26.6` | `2.18.4` | Enterprise Server 3.15 | |
| `v3.25.11` | `2.17.6` | Enterprise Server 3.14 | |
| `v3.24.11` | `2.16.6` | Enterprise Server 3.13 | |
| `v3.22.12` | `2.15.5` | Enterprise Server 3.12 | |

CodeQL Action v2 has stopped receiving updates now that GHES 3.11 is deprecated.

See the full list of GHES release and deprecation dates at [GitHub Enterprise Server releases](https://docs.github.com/en/enterprise-server/admin/all-releases#releases-of-github-enterprise-server).

## Troubleshooting

Read about [troubleshooting code scanning](https://docs.github.com/en/code-security/code-scanning/troubleshooting-code-scanning).

## Contributing

This project welcomes contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to build, install, and contribute.
