# gar
> The lightweight Node arguments parser

[GitHub](https://github.com/ethanent/gar) | [NPM](https://www.npmjs.com/package/gar)

## Install

```bash
npm i gar
```

## Use

![gar usage demo](https://i.imgur.com/Ln6A8Nn.png)

```javascript
const args = require('gar')(process.argv.slice(2))

console.log(args)
```

So for: `-h hey --toggle -ac --hey=hi -spaced "hey there" -num 1 lone`

```json
{
	"h": "hey",
	"toggle": true,
	"a": true,
	"c": true,
	"hey": "hi",
	"spaced": "hey there",
	"num": 1,
	"_": ["lone"]
}
```

## Why use gar?

gar is way more lightweight than other argument parsing packages.

Here's a size comparison table:

Package | Size
--- | ---
optimist | [![optimist package size](https://packagephobia.now.sh/badge?p=optimist)](https://packagephobia.now.sh/result?p=optimist)
minimist | [![minimist package size](https://packagephobia.now.sh/badge?p=minimist)](https://packagephobia.now.sh/result?p=minimist)
args-parser | [![args-parser package size](https://packagephobia.now.sh/badge?p=args-parser)](https://packagephobia.now.sh/result?p=args-parser)
gar | [![gar package size](https://packagephobia.now.sh/badge?p=gar)](https://packagephobia.now.sh/result?p=gar)