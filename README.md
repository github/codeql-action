# CodeQL Action

This action runs GitHub's industry-leading semantic code analysis engine, [CodeQL](https://codeql.github.com/), against a repository's source code to find security vulnerabilities. It then automatically uploads the results to GitHub so they can be displayed on pull requests and in the repository's security tab. CodeQL runs an extensible set of [queries](https://github.com/github/codeql), which have been developed by the community and the [GitHub Security Lab](https://securitylab.github.com/) to find common vulnerabilities in your code.

For a list of recent changes, see the CodeQL Action's [changelog](CHANGELOG.md).

## License

This project is released under the [MIT License](LICENSE).

The underlying CodeQL CLI, used in this action, is licensed under the [GitHub CodeQL Terms and Conditions](https://securitylab.github.com/tools/codeql/license). As such, this action may be used on open source projects hosted on GitHub, and on  private repositories that are owned by an organisation with GitHub Advanced Security enabled.

## Usage

We recommend using default setup to configure CodeQL analysis for your repository. For more information, see "[Configuring default setup for code scanning](https://docs.github.com/en/code-security/code-scanning/enabling-code-scanning/configuring-default-setup-for-code-scanning)."

You can also configure advanced setup for a repository to find security vulnerabilities in your code using a highly customizable code scanning configuration. For more information, see "[Configuring advanced setup for code scanning](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/configuring-advanced-setup-for-code-scanning)" and "[Customizing your advanced setup for code scanning](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/customizing-your-advanced-setup-for-code-scanning)."

### Permissions

All advanced setup Code Scanning workflows must have the `security-events: write` permission. Workflows in private repositories muse additionally have the `contents: read` permission. For more information, see [Assigning permissions to jobs](https://docs.github.com/en/actions/using-jobs/assigning-permissions-to-jobs).

## Supported versions of the CodeQL Action

The following versions of the CodeQL Action are currently supported:

- v3 (latest)
- v2 (deprecated, support will end on December 5th, 2024)

The only difference between CodeQL Action v2 and v3 is the version of Node.js on which they run. CodeQL Action v3 runs on Node 20, while CodeQL Action v2 runs on Node 16.

To provide the best experience to customers using older versions of GitHub Enterprise Server, we will continue to release CodeQL Action v2 so that these customers can continue to run the latest version of CodeQL as long as their version of GitHub Enterprise Server is supported. For example CodeQL Action v3.22.11 was the first release of CodeQL Action v3 and is functionally identical to v2.22.11. This approach provides an easy way to track exactly which features are included in different versions by looking at the minor and patch version numbers.

For more information, see ["Code scanning: deprecation of CodeQL Action v2."](https://github.blog/changelog/2024-01-12-code-scanning-deprecation-of-codeql-action-v2/).

## Troubleshooting

Read about [troubleshooting code scanning](https://docs.github.com/en/code-security/code-scanning/troubleshooting-code-scanning).

## Contributing

This project welcomes contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to build, install, and contribute.
