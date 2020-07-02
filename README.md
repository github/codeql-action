# CodeQL Action

This action runs GitHub's industry-leading static analysis engine, CodeQL, against a repository's source code to find security vulnerabilities. It then automatically uploads the results to GitHub so they can be displayed in the repository's security tab. CodeQL runs an extensible set of [queries](https://github.com/github/codeql), which have been developed by the community and the [GitHub Security Lab](https://securitylab.github.com/) to find common vulnerabilities in your code.

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
  pull_request:
  schedule:
    - cron: '0 0 * * 0'

jobs:
  CodeQL-Build:
    # CodeQL runs on ubuntu-latest, windows-latest, and macos-latest
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v2
        with:
          # Must fetch at least the immediate parents so that if this is
          # a pull request then we can checkout the head of the pull request.
          # Only include this option if you are running this workflow on pull requests.
          fetch-depth: 2

      # If this run was triggered by a pull request event then checkout
      # the head of the pull request instead of the merge commit.
      # Only include this step if you are running this workflow on pull requests.
      - run: git checkout HEAD^2
        if: ${{ github.event_name == 'pull_request' }}

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

The configuration file must be located within the local repository. For information on how to write a configuration file, see "[Using a custom configuration](https://help.github.com/en/github/finding-security-vulnerabilities-and-errors-in-your-code/configuring-code-scanning#using-a-custom-configuration)."

## Troubleshooting

Read about [troubleshooting code scanning](https://help.github.com/en/github/finding-security-vulnerabilities-and-errors-in-your-code/troubleshooting-code-scanning).
