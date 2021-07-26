# CodeQL Action

This action runs GitHub's industry-leading semantic code analysis engine, CodeQL, against a repository's source code to find security vulnerabilities. It then automatically uploads the results to GitHub so they can be displayed in the repository's security tab. CodeQL runs an extensible set of [queries](https://github.com/github/codeql), which have been developed by the community and the [GitHub Security Lab](https://securitylab.github.com/) to find common vulnerabilities in your code.

For a list of recent changes, see the CodeQL Action's [changelog](CHANGELOG.md).

## License

This project is released under the [MIT License](LICENSE).

The underlying CodeQL CLI, used in this action, is licensed under the [GitHub CodeQL Terms and Conditions](https://securitylab.github.com/tools/codeql/license). As such, this action may be used on open source projects hosted on GitHub, and on  private repositories that are owned by an organisation with GitHub Advanced Security enabled.

## Usage

This is a short walkthrough, but for more information read [configuring code scanning](https://help.github.com/en/github/finding-security-vulnerabilities-and-errors-in-your-code/configuring-code-scanning).

To get code scanning results from CodeQL analysis on your repo you can use the following workflow as a template:

```yaml

name: "Code Scanning - Action"

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    #        ┌───────────── minute (0 - 59)
    #        │  ┌───────────── hour (0 - 23)
    #        │  │ ┌───────────── day of the month (1 - 31)
    #        │  │ │ ┌───────────── month (1 - 12 or JAN-DEC)
    #        │  │ │ │ ┌───────────── day of the week (0 - 6 or SUN-SAT)
    #        │  │ │ │ │
    #        │  │ │ │ │
    #        │  │ │ │ │
    #        *  * * * *
    - cron: '30 1 * * 0'

jobs:
  CodeQL-Build:
    # CodeQL runs on ubuntu-latest, windows-latest, and macos-latest
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v2

      # Initializes the CodeQL tools for scanning.
      - name: Initialize CodeQL
        uses: github/codeql-action/init@v1
        # Override language selection by uncommenting this and choosing your languages
        # with:
        #   languages: go, javascript, csharp, python, cpp, java

      # Autobuild attempts to build any compiled languages (C/C++, C#, or Java).
      # If this step fails, then you should remove it and run the build manually (see below).
      - name: Autobuild
        uses: github/codeql-action/autobuild@v1

      # ℹ️ Command-line programs to run using the OS shell.
      # 📚 https://git.io/JvXDl

      # ✏️ If the Autobuild fails above, remove it and uncomment the following
      #    three lines and modify them (or add more) to build your code if your
      #    project uses a compiled language

      #- run: |
      #   make bootstrap
      #   make release

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v1
```

If you prefer to integrate this within an existing CI workflow, it should end up looking something like this:

```yaml
- name: Initialize CodeQL
  uses: github/codeql-action/init@v1
  with:
    languages: go, javascript

# Here is where you build your code
- run: |
  make bootstrap
  make release

- name: Perform CodeQL Analysis
  uses: github/codeql-action/analyze@v1
```

### Configuration file

Use the `config-file` parameter of the `init` action to enable the configuration file. The value of `config-file` is the path to the configuration file you want to use. This example loads the configuration file `./.github/codeql/codeql-config.yml`.

```yaml
- uses: github/codeql-action/init@v1
  with:
    config-file: ./.github/codeql/codeql-config.yml
```

The configuration file can be located in a different repository. This is useful if you want to share the same configuration across multiple repositories. If the configuration file is in a private repository you can also specify an `external-repository-token` option. This should be a personal access token that has read access to any repositories containing referenced config files and queries.

```yaml
- uses: github/codeql-action/init@v1
  with:
    config-file: owner/repo/codeql-config.yml@branch
    external-repository-token: ${{ secrets.EXTERNAL_REPOSITORY_TOKEN }}
```

For information on how to write a configuration file, see "[Using a custom configuration file](https://help.github.com/en/github/finding-security-vulnerabilities-and-errors-in-your-code/configuring-code-scanning#using-a-custom-configuration-file)."

If you only want to customise the queries used, you can specify them in your workflow instead of creating a config file, using the `queries` property of the `init` action:

```yaml
- uses: github/codeql-action/init@v1
  with:
    queries: <local-or-remote-query>,<another-query>
```

By default, this will override any queries specified in a config file. If you wish to use both sets of queries, prefix the list of queries in the workflow with `+`:

```yaml
- uses: github/codeql-action/init@v1
  with:
    queries: +<local-or-remote-query>,<another-query>
```

## Troubleshooting

Read about [troubleshooting code scanning](https://help.github.com/en/github/finding-security-vulnerabilities-and-errors-in-your-code/troubleshooting-code-scanning).

### Note on "missing analysis" message

The very first time code scanning is run and if it is on a pull request, you will probably get a message mentioning a "missing analysis". This is expected.

After code scanning has analyzed the code in a pull request, it needs to compare the analysis of the topic branch (the merge commit of the branch you used to create the pull request) with the analysis of the base branch (the branch into which you want to merge the pull request). This allows code scanning to compute which alerts are newly introduced by the pull request, which alerts were already present in the base branch, and whether any existing alerts are fixed by the changes in the pull request. Initially, if you use a pull request to add code scanning to a repository, the base branch has not yet been analyzed, so it's not possible to compute these details. In this case, when you click through from the results check on the pull request you will see the "Missing analysis for base commit SHA-HASH" message.

For more information and other causes of this message, see [Reasons for the "missing analysis" message](https://docs.github.com/en/code-security/secure-coding/automatically-scanning-your-code-for-vulnerabilities-and-errors/setting-up-code-scanning-for-a-repository#reasons-for-the-missing-analysis-message)
