# universal-github-app-jwt

> Calculate GitHub App bearer tokens for Node, Deno, and modern browsers

[![@latest](https://img.shields.io/npm/v/universal-github-app-jwt)](https://www.npmjs.com/universal-github-app-jwt)
[![Build Status](https://github.com/gr2m/universal-github-app-jwt/workflows/Test/badge.svg)](https://github.com/gr2m/universal-github-app-jwt/actions?query=workflow%3ATest+branch%3Amaster)

## Usage

<table>
<tbody valign=top align=left>
<tr><th>
Browsers
</th><td width=100%>
Load <code>universal-github-app-jwt</code> directly from <a href="https://esm.sh">esm.sh</a>
        
```html
<script type="module">
import githubAppJwt from "https://esm.sh/universal-github-app-jwt";
</script>
```

</td></tr>
<tr><th>
Node
</th><td>

Install with <code>npm install universal-github-app-jwt</code>

```js
import githubAppJwt from "universal-github-app-jwt";
```

</td></tr>
<tr><th>
Deno
</th><td>

Load <code>universal-github-app-jwt</code> directly from <a href="https://esm.sh">esm.sh</a>, including types.

```js
import githubAppJwt from "https://esm.sh/universal-github-app-jwt";
```

</td></tr>
</tbody>
</table>

```js
const { token, appId, expiration } = await githubAppJwt({
  id: APP_ID,
  privateKey: PRIVATE_KEY,
});
```

The retrieved `token` can now be used in Authorization request header, e.g. with [`@octokit/request`](https://github.com/octokit/request.js/#readme):

```js
request("GET /app", {
  headers: {
    authorization: `bearer ${token}`,
  },
});
```

For a complete implementation of GitHub App authentication strategies, see [`@octokit/auth-app.js`](https://github.com/octokit/auth-app.js/#readme).

## `githubAppJwt(options)`

<table width="100%">
  <thead align=left>
    <tr>
      <th width=150>
        name
      </th>
      <th width=70>
        type
      </th>
      <th>
        description
      </th>
    </tr>
  </thead>
  <tbody align=left valign=top>
    <tr>
      <th>
        <code>options.id</code>
      </th>
      <th>
        <code>number | string</code>
      </th>
      <td>
        <strong>Required</strong>. The GitHub App's ID or Client ID. For <code>github.com</code> and GHES 3.14+, it is recommended to use the Client ID.
      </td>
    </tr>
    <tr>
      <th>
        <code>options.privateKey</code>
      </th>
      <th>
        <code>string</code>
      </th>
      <td>
        <strong>Required</strong>. Content of the <code>*.pem</code> file you downloaded from the app’s about page. You can generate a new private key if needed. Make sure to preserve the line breaks. If your private key contains escaped newlines (`\\n`), they will be automatically replaced with actual newlines.
      </td>
    </tr>
    <tr>
      <th>
        <code>options.now</code>
      </th>
      <th>
        <code>number</code>
      </th>
      <td>
        An optional override for the current time in seconds since the UNIX epoch. Defaults to <code>Math.floor(Date.now() / 1000))</code>. This value can be overridden to account for a time skew between the local machine and the authentication server.
      </td>
    </tr>
  </tbody>
</table>

`githubAppJwt(options)` resolves with an object with the following keys

<table width="100%">
  <thead align=left>
    <tr>
      <th width=150>
        name
      </th>
      <th width=70>
        type
      </th>
      <th>
        description
      </th>
    </tr>
  </thead>
  <tbody align=left valign=top>
    <tr>
      <th>
        <code>token</code>
      </th>
      <th>
        <code>string</code>
      </th>
      <td>
        The JSON Web Token (JWT) to authenticate as the app.
      </td>
    </tr>
    <tr>
      <th>
        <code>appId</code>
      </th>
      <th>
        <code>number</code>
      </th>
      <td>
        The GitHub App database ID or Client ID passed in <code>options.id</code>.
      </td>
    </tr>
    <tr>
      <th>
        <code>expiration</code>
      </th>
      <th>
        <code>number</code>
      </th>
      <td>
        Timestamp as UNIX epoch, e.g. <code>1530922170</code>. A Date object can be created using <code>new Date(authentication.expiration)</code>.
      </td>
    </tr>
  </tbody>
</table>

<!-- do not remove this anchor, it's used in error messages -->

<a name="private-key-formats"></a>

## About Private Key formats

When downloading a `private-key.pem` file from GitHub, the format is in `PKCS#1` format. Unfortunately, the WebCrypto API only supports `PKCS#8`.

If you use 1Password to store a private key as an SSH key, it will be transformed to the `OpenSSH` format, which is also not supported by WebCrypto.

You can identify the format based on the the first line

| First Line                            | Format  |
| ------------------------------------- | ------- |
| `-----BEGIN RSA PRIVATE KEY-----`     | PKCS#1  |
| `-----BEGIN PRIVATE KEY-----`         | PKCS#8  |
| `-----BEGIN OPENSSH PRIVATE KEY-----` | OpenSSH |

### Converting `PKCS#1` to `PKCS#8`

- #### Using an Online Private Key Converter

Convert quickly using the Web interface at https://private-key-converter.vercel.app

- #### Using Node.js

If you use Node.js, you can convert the format before passing it to `universal-github-app-jwt`:

```js
import crypto from "node:crypto";
import githubAppJwt from "universal-github-app-jwt";

const privateKeyPkcs8 = crypto
  .createPrivateKey(process.env.PRIVATE_KEY)
  .export({
    type: "pkcs8",
    format: "pem",
  });

const { token, appId, expiration } = await githubAppJwt({
  id: process.env.APP_ID,
  privateKey: privateKeyPkcs8,
});
```

- #### Using OpenSSL

Convert the format using `openssl` before passing it to your app.

```
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in private-key.pem -out private-key-pkcs8.key
```

### Converting `OpenSSH` to `PKCS#8`

```
cp private-key.pem private-key-pkcs8.key && ssh-keygen -p -m PKCS8  -N "" -f private-key-pkcs8.key
```

This command forces a format change by asking `ssh-keygen` to set no password and then output in a different format.

I'm looking for help to create a minimal `OpenSSH` to `PKCS` convert library that I can recommend people to use before passing the private key to `githubAppJwt`. Please create an issue if you'd like to help.

## License

[MIT](LICENSE)
