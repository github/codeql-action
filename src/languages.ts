/** A language to analyze with CodeQL. */
export type Language = string;

/**
 * A language supported by CodeQL that is treated specially by the Action.
 *
 * This is not an exhaustive list of languages supported by CodeQL and new
 * languages do not need to be added here.
 */
export enum KnownLanguage {
  actions = "actions",
  cpp = "cpp",
  csharp = "csharp",
  go = "go",
  java = "java",
  javascript = "javascript",
  python = "python",
  ruby = "ruby",
  rust = "rust",
  swift = "swift",
}

/** Java-specific environment variable names that we may care about. */
export enum JavaEnvVars {
  JAVA_HOME = "JAVA_HOME",
  JAVA_TOOL_OPTIONS = "JAVA_TOOL_OPTIONS",
  JDK_JAVA_OPTIONS = "JDK_JAVA_OPTIONS",
  _JAVA_OPTIONS = "_JAVA_OPTIONS",
}
