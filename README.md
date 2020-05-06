# CodeQL Action

This action runs GitHub's industry-leading static analysis engine, CodeQL, against a repository's source code to find security vulnerabilities. It then automatically uploads the results to GitHub so they can be displayed in the repository's security tab. CodeQL runs an extensible set of [queries](https://github.com/semmle/ql), which have been developed by the community and the [GitHub Security Lab](https://securitylab.github.com/) to find common vulnerabilities in your code.

## License

This project is released under the [MIT License](LICENSE).

The underlying CodeQL CLI, used in this action, is licensed under the [GitHub CodeQL Terms and Conditions](https://securitylab.github.com/tools/codeql/license). As such, this action may be used on open source projects hosted on GitHub, and on  private repositories that are owned by an organisation with GitHub Advanced Security enabled.

## Usage

To get code scanning results from CodeQL analysis on your repo you can use the following workflow as a template:

```yaml

name: "Code Scanning - Action"

on:
  push:
  schedule:
    - cron: '0 0 * * 0'

jobs:
  CodeQL-Build:

    strategy:
      fail-fast: false

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

### Actions triggers

The CodeQL action should be run on `push` events, and on a `schedule`. `Push` events allow us to do a detailed analysis of the delta in a pull request, while the `schedule` event ensures that GitHub regularly scans the repository for the latest vulnerabilities, even if the repository becomes inactive. This action does not support the `pull_request` event.

### Configuration

You may optionally specify additional queries for CodeQL to execute by using a config file. The queries must belong to a [QL pack](https://help.semmle.com/codeql/codeql-cli/reference/qlpack-overview.html) and can be in your repository or any public repository. You can choose a single .ql file, a folder containing multiple .ql files, a .qls [query suite](https://help.semmle.com/codeql/codeql-cli/procedures/query-suites.html) file, or any combination of the above. To use queries from other repositories use the same syntax as when [using an action](https://help.github.com/en/actions/reference/workflow-syntax-for-github-actions#jobsjob_idstepsuses).

You can disable the default queries using `disable-default-queries: true`.

You can choose to ignore some files or folders from the analysis, or include additional files/folders for analysis. This *only* works for Javascript and Python analysis.
Identifying potential files for extraction:

- Scans each folder that's defined as `paths` in turn, traversing subfolders, and looking for relevant files.
- If it finds a subfolder that's defined as `paths-ignore`, stop traversing.
- If a file or folder is both in `paths` and `paths-ignore`, the `paths-ignore` is ignored.

Use the `config-file` parameter of the init action to enable the configuration file. For example:

```yaml
- uses: github/codeql-action/init@v1
  with:
    config-file: ./.github/codeql/codeql-config.yml
```

A config file looks like this:

```yaml
name: "My CodeQL config"

disable-default-queries: true

queries:
  - name: In-repo queries (Runs the queries located in the my-queries folder of the repo)
    uses: ./my-queries
  - name: External Javascript QL pack (Runs a QL pack located in an external repo)
    uses: /Semmle/ql/javascript/ql/src/Electron@master
  - name: External query (Runs a single query located in an external QL pack)
    uses: Semmle/ql/javascript/ql/src/AngularJS/DeadAngularJSEventListener.ql@master
  - name: Select query suite (Runs a query suites)
    uses: ./codeql-querypacks/complex-python-querypack/rootAndBar.qls

paths:
  - src/util.ts

paths-ignore:
  - src
  - lib
```

## Troubleshooting

### Trouble with Go dependencies

#### If you use a vendor directory

Try passing

```yaml
env:
  GOFLAGS: "-mod=vendor"
```

to `github/codeql-action/analyze`.

### If you do not use a vendor directory

Dependencies on public repositories should just work. If you have dependencies on private repositories, one option is to use `git config` and a [personal access token](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line) to authenticate when downloading dependencies. Add a section like

```yaml
steps:
  - name: Configure git private repo access
    env:
      TOKEN: ${{ secrets.GITHUB_PAT }}
    run: |
      git config --global url."https://${TOKEN}@github.com/foo/bar".insteadOf "https://github.com/foo/bar"
      git config --global url."https://${TOKEN}@github.com/foo/baz".insteadOf "https://github.com/foo/baz"
```

before any codeql actions. A similar thing can also be done with an SSH key or deploy key.

### C# using dotnet version 2 on linux

This currently requires invoking `dotnet` with the `/p:UseSharedCompilation=false` flag. For example:

```shell
dotnet build /p:UseSharedCompilation=false
```

Version 3 does not require the additional flag.
