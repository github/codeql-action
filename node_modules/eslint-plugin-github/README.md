# eslint-plugin-github

[![Node CI](https://github.com/github/eslint-plugin-github/actions/workflows/nodejs.yml/badge.svg)](https://github.com/github/eslint-plugin-github/actions/workflows/nodejs.yml)

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
- `recommended`
  - Recommended rules for every application.
- `typescript`
  - Useful rules when writing TypeScript.
