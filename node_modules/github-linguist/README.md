# github-linguist

💻 Counts the number of lines of code, written in TypeScript.

**Warning:** This package uses regular expressions to approximate the lines of code in a project. The
results are not 100% precise because the regular expressions can return mistakes in edge
cases, for example if comment tokens are present inside of multiline strings.

## Prerequisites

- Node.js 6+

## Install

```bash
npm install github-linguist
```

or

```bash
yarn add github-linguist
```

## Usage

You can use `loc` in you ternimal, or as a npm package in your projects.

### Command line mode

Supports counting lines of code of a file or directory.

#### 1. Lines of code in a single file

```bash
# loc file <path>
loc file src/index.ts
```

![loc file <path>](https://user-images.githubusercontent.com/3739221/31838697-9fdec114-b5a3-11e7-890e-795444bc9400.png)

#### 2. Lines of code in a directory

```bash
# loc <pattern>
loc dir **/*.ts
```

![loc dir <pattern>](https://user-images.githubusercontent.com/3739221/31838695-9f94a340-b5a3-11e7-914a-91629d2cfa9f.png)

### Third-party mode

```ts
import { LocFile, LocDir } from 'github-linguist';

// for a file.
const file = new LocFile(filePath);
const { info } = file.getInfo();

//  for a directory.
const dir = new LocDir({
  cwd: // root directory, or leave blank to use process.cwd()
  include: // string or string[] containing path patterns to include (default include all)
  exclude: // string or string[] containing path patterns to exclude (default exclude none)
});
const { info } = dir.getInfo();
```

## License

MIT License.
