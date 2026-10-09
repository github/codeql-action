## Change notes

Change-notes are Markdown files used to document user-facing changes. When making a change that affects users, create a Markdown file here that describes the change. During the next release, the change-note files in `unreleased-change-notes/` will automatically be added to `CHANGELOG.md`.

### Change-note file format

Change-note files must follow a certain format so that they can be automatically validated and processed. Failure to follow the format will result in a failed PR check.

You may validate your change-note file locally by running `npx tsx pr-checks/changenotes.ts validate`. This command will scan all change-note files in `unreleased-change-notes/` and report any errors.


#### Body

The body of the change-note file must:

- Be written in valid [GitHub-Flavored Markdown](https://github.github.com/gfm/).
- Be structured as a single unordered Markdown list with hyphen (`-`) bullets. Each list item should describe a single change. If there are multiple changes, use multiple list items.

### Example change-note file

```
- Fixed a bug where a network error while streaming the download of the CodeQL bundle could terminate the `init` Action instead of falling back to downloading the bundle before extracting it. [#4061](https://github.com/github/codeql-action/pull/4061)
- Fix incorrect minimum required Git version for [improved incremental analysis](https://github.com/github/roadmap/issues/1158): it should have been 2.36.0, not 2.11.0. [#3781](https://github.com/github/codeql-action/pull/3781)
```
