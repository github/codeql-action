## unreleased-change-notes

Change-notes are Markdown files used to document user-facing changes. When making a change that affects users, create a change-note file here that describes the change. At the next release, the change-note files in `unreleased-change-notes/` will be combined into a new entry in `CHANGELOG.md`.

### Change-note file format

Change-note files must follow a certain format so that they can be automatically validated and processed. Failure to follow the format will result in a failed PR check.

You may validate your change-note file locally by running `npx tsx pr-checks/changenotes.ts validate`. This command will scan all change-note files in `unreleased-change-notes/` and report any errors.

#### File name

Change-note files must be named according to the following pattern: `YYYY-MM-DD-<short-title>.md`, where `YYYY-MM-DD` is the date of the change and `<short-title>` is a short description of the change. The `<short-title>` must contain only lowercase letters (`a-z`), digits (`0-9`), and hyphens (`-`), and must start with a letter or digit. Hyphens may be used to separate words. For example, a change-note file for a JSON-related bug fix that was made on January 1st, 2020 might be named `2020-01-01-fix-json-bug.md`.

#### Frontmatter

The first line of the file must be a YAML frontmatter block, which is delimited by lines containing three dashes (`---`). The frontmatter block must contain a single `category` field, whose value must be one of the following categories:

| Category | Description |
| -------- | ----------- |
| `breaking`    | A change that introduces backward-incompatible behavior. |
| `feature`     | A new capability or behavior added to the Action. |
| `improvement` | An enhancement to existing functionality or performance. |
| `securityFix` | A change that addresses a security vulnerability. |
| `fix`         | A bug fix that corrects unexpected behavior. |
| `unship`      | Features or options that have been removed. |
| `deprecation` | Deprecation of features that will be removed in future versions. |
| `knownIssue`  | A known issue or limitation in the current release. |
| `misc`        | Other changes that do not fit into other categories. |

#### Body

The body of the change-note file must:

- Be written in valid [GitHub-Flavored Markdown](https://github.github.com/gfm/).
- Describe the change in a way that is understandable to users of the Action. Limit the description to 1-2 sentences, and avoid technical details that are not relevant to users.
- Be structured as a single unordered Markdown list with hyphen (`-`) bullets. Each list item should describe a single change. If there are multiple changes, use multiple list items.

### Example change-note file

```
---
category: fix
---

- Fixed a bug where a network error while streaming the download of the CodeQL bundle could terminate the `init` Action instead of falling back to downloading the bundle before extracting it. [#4061](https://github.com/github/codeql-action/pull/4061)
- Fix incorrect minimum required Git version for [improved incremental analysis](https://github.com/github/roadmap/issues/1158): it should have been 2.36.0, not 2.11.0. [#3781](https://github.com/github/codeql-action/pull/3781)
```
