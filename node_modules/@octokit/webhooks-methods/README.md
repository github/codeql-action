# webhooks-methods.js

> Methods to handle GitHub Webhook requests

[![@latest](https://img.shields.io/npm/v/@octokit/webhooks-methods.svg)](https://www.npmjs.com/package/@octokit/webhooks-methods)
[![Build Status](https://github.com/octokit/webhooks-methods.js/workflows/Test/badge.svg)](https://github.com/octokit/webhooks-methods.js/actions?query=workflow%3ATest+branch%3Amain)

<details>
<summary>Table of contents</summary>

<!-- toc -->

- [usage](#usage)
- [Methods](#methods)
  - [`sign()`](#sign)
  - [`verify()`](#verify)
  - [`verifyWithFallback()`](#verifywithfallback)
- [Contributing](#contributing)
- [License](#license)

<!-- tocstop -->

</details>

## usage

<table>
<tbody valign=top align=left>
<tr><th>

Browsers

</th><td width=100%>

🚧 `@octokit/webhooks-methods` is not meant to be used in browsers. The webhook secret is a sensitive credential that must not be exposed to users.

Load `@octokit/webhooks-methods` directly from [esm.sh](https://esm.sh)

```html
<script type="module">
  import {
    sign,
    verify,
    verifyWithFallback,
  } from "https://esm.sh/@octokit/webhooks-methods";
</script>
```

</td></tr>
<tr><th>

Node

</th><td>

Install with `npm install @octokit/core @octokit/webhooks-methods`

```js
import { sign, verify, verifyWithFallback } from "@octokit/webhooks-methods";
```

</td></tr>
</tbody>
</table>

```js
await sign("mysecret", eventPayloadString);
// resolves with a string like "sha256=4864d2759938a15468b5df9ade20bf161da9b4f737ea61794142f3484236bda3"

await verify("mysecret", eventPayloadString, "sha256=486d27...");
// resolves with true or false

await verifyWithFallback("mysecret", eventPayloadString, "sha256=486d27...", ["oldsecret", ...]);
// resolves with true or false
```

## Methods

### `sign()`

```js
await sign(secret, eventPayloadString);
```

<table width="100%">
  <tr>
    <td>
      <code>
        secret
      </code>
      <em>(String)</em>
    </td>
    <td>
      <strong>Required.</strong>
      Secret as configured in GitHub Settings.
    </td>
  </tr>
  <tr>
    <td>
      <code>
        eventPayloadString
      </code>
      <em>
        (String)
      </em>
    </td>
    <td>
      <strong>Required.</strong>
      Webhook request payload as received from GitHub.<br>
      <br>
      If you have only access to an already parsed object, stringify it with <code>JSON.stringify(payload)</code>
    </td>
  </tr>
</table>

Resolves with a `signature` string. Throws an error if an argument is missing.

### `verify()`

```js
await verify(secret, eventPayloadString, signature);
```

<table width="100%">
  <tr>
    <td>
      <code>
        secret
      </code>
      <em>(String)</em>
    </td>
    <td>
      <strong>Required.</strong>
      Secret as configured in GitHub Settings.
    </td>
  </tr>
  <tr>
    <td>
      <code>
        eventPayloadString
      </code>
      <em>
        (String)
      </em>
    </td>
    <td>
      <strong>Required.</strong>
      Webhook request payload as received from GitHub.<br>
      <br>
      If you have only access to an already parsed object, stringify it with <code>JSON.stringify(payload)</code>
    </td>
  </tr>
  <tr>
    <td>
      <code>
        signature
      </code>
      <em>
        (String)
      </em>
    </td>
    <td>
      <strong>Required.</strong>
      Signature string as calculated by <code><a href="../sign">sign()</a></code>.
    </td>
  </tr>
</table>

Resolves with `true` or `false`. Throws error if an argument is missing.

### `verifyWithFallback()`

```js
await verifyWithFallback(
  secret,
  eventPayloadString,
  signature,
  additionalSecrets,
);
```

<table width="100%">
  <tr>
    <td>
      <code>
        secret
      </code>
      <em>(String)</em>
    </td>
    <td>
      <strong>Required.</strong>
      Secret as configured in GitHub Settings.
    </td>
  </tr>
  <tr>
    <td>
      <code>
        eventPayloadString
      </code>
      <em>
        (String)
      </em>
    </td>
    <td>
      <strong>Required.</strong>
      Webhook request payload as received from GitHub.<br>
      <br>
      If you have only access to an already parsed object, stringify it with <code>JSON.stringify(payload)</code>
    </td>
  </tr>
  <tr>
    <td>
      <code>
        signature
      </code>
      <em>
        (String)
      </em>
    </td>
    <td>
      <strong>Required.</strong>
      Signature string as calculated by <code><a href="../sign">sign()</a></code>.
    </td>
  </tr>
  <tr>
    <td>
      <code>
        additionalSecrets
      </code>
      <em>
        (Array of String)
      </em>
    </td>
    <td>
        If given, each additional secret will be tried in turn.
    </td>
  </tr>
</table>

This is a thin wrapper around [`verify()`](#verify) that is intended to ease callers' support for key rotation.
Resolves with `true` or `false`. Throws error if a required argument is missing.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[MIT](LICENSE)
