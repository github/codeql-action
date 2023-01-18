# eslint-plugin-github

## Installation

```sh
$ npm install --save-dev eslint eslint-plugin-github
```

## Setup

Add `github` to your list of plugins in your ESLint config.

JSON ESLint config example:

```json
{
  "plugins": ["github"]
}
```

Extend the configs you wish to use.

JSON ESLint config example:

```json
{
  "extends": ["plugin:github/recommended"]
}
```

The available configs are:

- `internal`
  - Rules useful for github applications.
- `browser`
  - Useful rules when shipping your app to the browser.
- `react`
  - Recommended rules for React applications.
- `recommended`
  - Recommended rules for every application.
- `typescript`
  - Useful rules when writing TypeScript.

### Component mapping (Experimental)

_Note: This is experimental and subject to change._

The `react` config includes rules which target specific HTML elements. You may provide a mapping of custom components to an HTML element in your `eslintrc` configuration to increase linter coverage.

For each component, you may specify a `default` and/or `props`. `default` may make sense if there's a 1:1 mapping between a component and an HTML element. However, if the HTML output of a component is dependent on a prop value, you can provide a mapping using the `props` key. To minimize conflicts and complexity, this currently only supports the mapping of a single prop type.

```json
{
  "settings": {
    "github": {
      "components": {
        "Box": { "default": "p" },
        "Link": { "props": {"as": { "undefined": "a", "a": "a", "button": "button"}}},
      }
    }
  }
}
```

This config will be interpreted in the following way:

- All `<Box>` elements will be treated as a `p` element type.
- `<Link>` without a defined `as` prop will be treated as a `a`.
- `<Link as='a'>` will treated as an `a` element type.
- `<Link as='button'>` will be treated as a `button` element type.
- `<Link as='summary'>` will be treated as the raw `Link` type because there is no configuration set for `as='summary'`.

### Rules

- [Array Foreach](./docs/rules/array-foreach.md)
- [Async Currenttarget](./docs/rules/async-currenttarget.md)
- [Async Preventdefault](./docs/rules/async-preventdefault.md)
- [Authenticity Token](./docs/rules/authenticity-token.md)
- [Get Attribute](./docs/rules/get-attribute.md)
- [JS Class Name](./docs/rules/js-class-name.md)
- [No Blur](./docs/rules/no-blur.md)
- [No D None](./docs/rules/no-d-none.md)
- [No Dataset](./docs/rules/no-dataset.md)
- [No Dynamic Script Tag](./docs/rules/no-dynamic-script-tag.md)
- [No Implicit Buggy Globals](./docs/rules/no-implicit-buggy-globals.md)
- [No Inner HTML](./docs/rules/no-inner-html.md)
- [No InnerText](./docs/rules/no-innerText.md)
- [No Then](./docs/rules/no-then.md)
- [No Useless Passive](./docs/rules/no-useless-passive.md)
- [Prefer Observers](./docs/rules/prefer-observers.md)
- [Require Passive Events](./docs/rules/require-passive-events.md)
- [Unescaped HTML Literal](./docs/rules/unescaped-html-literal.md)

#### Accessibility-focused rules (prefixed with a11y)

- [No Generic Link Text](./docs/rules/a11y-no-generic-link-text.md)
