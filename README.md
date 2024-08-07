# CodeQL Action

This action runs GitHub's industry-leading semantic code analysis engine, [CodeQL](https://codeql.github.com/), against a repository's source code to find security vulnerabilities. It then automatically uploads the results to GitHub so they can be displayed on pull requests and in the repository's security tab. CodeQL runs an extensible set of [queries](https://github.com/github/codeql), which have been developed by the community and the [GitHub Security Lab](https://securitylab.github.com/) to find common vulnerabilities in your code.

For a list of recent changes, see the CodeQL Action's [changelog](CHANGELOG.md).

## License

This project is released under the [MIT License](LICENSE).

The underlying CodeQL CLI, used in this action, is licensed under the [GitHub CodeQL Terms and Conditions](https://securitylab.github.com/tools/codeql/license). As such, this action may be used on open source projects hosted on GitHub, and on private repositories that are owned by an organisation with GitHub Advanced Security enabled.

## Usage

We recommend using default setup to configure CodeQL analysis for your repository. For more information, see "[Configuring default setup for code scanning](https://docs.github.com/en/code-security/code-scanning/enabling-code-scanning/configuring-default-setup-for-code-scanning)."

You can also configure advanced setup for a repository to find security vulnerabilities in your code using a highly customizable code scanning configuration. For more information, see "[Configuring advanced setup for code scanning](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/configuring-advanced-setup-for-code-scanning)" and "[Customizing your advanced setup for code scanning](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/customizing-your-advanced-setup-for-code-scanning)."

### Inputs

The CodeQL Action supports various inputs to customize the analysis. Here are some important inputs:

- `config`: Path of the config file to use. This input allows you to specify a custom configuration file for the analysis.
- `languages`: A comma-separated list of CodeQL languages to analyze.
- `queries`: Comma-separated list of additional queries to run. By default, this overrides the same setting in a configuration file; prefix with "+" to use both sets of queries.
- `packs`: Comma-separated list of packs to run. Reference a pack in the format `scope/name[@version]`. If `version` is not specified, then the latest version of the pack is used. By default, this overrides the same setting in a configuration file; prefix with "+" to use both sets of packs.
- `db-location`: Path where CodeQL databases should be created. If not specified, a temporary directory will be used.
- `ram`: The amount of memory in MB that can be used by CodeQL extractors.
- `threads`: The number of threads that can be used by CodeQL extractors.
- `source-root`: Path of the root source code directory, relative to $GITHUB_WORKSPACE.

### Workflow Permissions

All advanced setup code scanning workflows must have the `security-events: write` permission. Workflows in private repositories must additionally have the `contents: read` permission. For more information, see "[Assigning permissions to jobs](https://docs.github.com/en/actions/using-jobs/assigning-permissions-to-jobs)."

### Build Modes

The CodeQL Action supports different build modes for analyzing the source code. The available build modes are:

- `none`: The database will be created without building the source code. Available for all interpreted languages and some compiled languages.
- `autobuild`: The database will be created by attempting to automatically build the source code. Available for all compiled languages.
- `manual`: The database will be created by building the source code using a manually specified build command. To use this build mode, specify manual build steps in your workflow between the `init` and `analyze` steps. Available for all compiled languages.

### Actions

The CodeQL Action includes several actions that can be used in your workflows. Here are the available actions and how to use them:

- `init`: Sets up CodeQL for analysis. For more information, see the [init action documentation](https://github.com/github/codeql-action/blob/main/init/action.yml).
- `autobuild`: Attempts to automatically build the code. For more information, see the [autobuild action documentation](https://github.com/github/codeql-action/blob/main/autobuild/action.yml).
- `analyze`: Finalizes the CodeQL database and runs the analysis. For more information, see the [analyze action documentation](https://github.com/github/codeql-action/blob/main/analyze/action.yml).
- `upload-sarif`: Uploads a SARIF file to Code Scanning. For more information, see the [upload-sarif action documentation](https://github.com/github/codeql-action/blob/main/upload-sarif/action.yml).
- `resolve-environment`: Attempts to infer a build environment suitable for automatic builds. For more information, see the [resolve-environment action documentation](https://github.com/github/codeql-action/blob/main/resolve-environment/action.yml).
- `start-proxy`: Starts an HTTP proxy server. For more information, see the [start-proxy action documentation](https://github.com/github/codeql-action/blob/main/start-proxy/action.yml).

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
| `v3.25.11` | `2.17.6` | Enterprise Server 3.14 | |
| `v3.24.11` | `2.16.6` | Enterprise Server 3.13 | |
| `v3.22.12` | `2.15.5` | Enterprise Server 3.12 | |
| `v2.22.1` | `2.14.6` | Enterprise Server 3.11 | Supports CodeQL Action v3, but did not ship with CodeQL Action v3. For more information, see "[Code scanning: deprecation of CodeQL Action v2](https://github.blog/changelog/2024-01-12-code-scanning-deprecation-of-codeql-action-v2/#users-of-github-enterprise-server-311)." |
| `v2.20.3` | `2.13.5` | Enterprise Server 3.10 | Does not support CodeQL Action v3. |

CodeQL Action v2 will stop receiving updates when GHES 3.11 is deprecated. 

See the full list of GHES release and deprecation dates at [GitHub Enterprise Server releases](https://docs.github.com/en/enterprise-server/admin/all-releases#releases-of-github-enterprise-server).

## Troubleshooting

Read about [troubleshooting code scanning](https://docs.github.com/en/code-security/code-scanning/troubleshooting-code-scanning).

## Contributing

This project welcomes contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to build, install, and contribute.
