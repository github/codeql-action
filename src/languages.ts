/**
 * A CodeQL language.
 *
 * To facilitate adding new languages, this is a typedef rather than an
 * exhaustive list of languages supported by CodeQL.
 */
export type Language = string;

export enum KnownLanguage {
  csharp = "csharp",
  cpp = "cpp",
  go = "go",
  java = "java",
  javascript = "javascript",
  python = "python",
  ruby = "ruby",
  rust = "rust",
  swift = "swift",
}
