
export type ErrorMatcher = [number|null, RegExp|null, string];

const namedMatchers: { [key: string]: ErrorMatcher } = {
  noSourceCodeFound: [
    32,
    null,
    `No source code was seen during the build. Please see...
https://docs.github.com/en/github/finding-security-vulnerabilities-and-errors-in-your-code/troubleshooting-code-scanning#no-code-found-during-the-build`
  ],
  noSourceCodeFoundJavascript: [
    null,
    new RegExp("No JavaScript or TypeScript code found\\."),
    `No source code was seen during the build. Please see...
https://docs.github.com/en/github/finding-security-vulnerabilities-and-errors-in-your-code/troubleshooting-code-scanning#no-code-found-during-the-build`
  ]
};

export const errorMatchers = Object.values(namedMatchers);
