import * as fs from "fs";
import * as path from "path";

import * as ava from "ava";
import test from "ava";

import * as fingerprints from "./fingerprints";
import { getRunnerLogger } from "./logging";
import { setupTests } from "./testing-utils";

setupTests(test);

function testHash(t: ava.Assertions, input: string, expectedHashes: string[]) {
  let index = 0;
  const callback = function (lineNumber: number, hash: string) {
    t.is(lineNumber, index + 1);
    t.is(hash, expectedHashes[index]);
    index++;
  };
  fingerprints.hash(callback, input);
  t.is(index, input.split(/\r\n|\r|\n/).length);
}

test("hash", (t: ava.Assertions) => {
  // Try empty file
  testHash(t, "", ["c129715d7a2bc9a3:1"]);

  // Try various combinations of newline characters
  testHash(t, " a\nb\n  \t\tc\n d", [
    "271789c17abda88f:1",
    "54703d4cd895b18:1",
    "180aee12dab6264:1",
    "a23a3dc5e078b07b:1",
  ]);
  testHash(t, " hello; \t\nworld!!!\n\n\n  \t\tGreetings\n End", [
    "8b7cf3e952e7aeb2:1",
    "b1ae1287ec4718d9:1",
    "bff680108adb0fcc:1",
    "c6805c5e1288b612:1",
    "b86d3392aea1be30:1",
    "e6ceba753e1a442:1",
  ]);
  testHash(t, " hello; \t\nworld!!!\n\n\n  \t\tGreetings\n End\n", [
    "e9496ae3ebfced30:1",
    "fb7c023a8b9ccb3f:1",
    "ce8ba1a563dcdaca:1",
    "e20e36e16fcb0cc8:1",
    "b3edc88f2938467e:1",
    "c8e28b0b4002a3a0:1",
    "c129715d7a2bc9a3:1",
  ]);
  testHash(t, " hello; \t\nworld!!!\r\r\r  \t\tGreetings\r End\r", [
    "e9496ae3ebfced30:1",
    "fb7c023a8b9ccb3f:1",
    "ce8ba1a563dcdaca:1",
    "e20e36e16fcb0cc8:1",
    "b3edc88f2938467e:1",
    "c8e28b0b4002a3a0:1",
    "c129715d7a2bc9a3:1",
  ]);
  testHash(t, " hello; \t\r\nworld!!!\r\n\r\n\r\n  \t\tGreetings\r\n End\r\n", [
    "e9496ae3ebfced30:1",
    "fb7c023a8b9ccb3f:1",
    "ce8ba1a563dcdaca:1",
    "e20e36e16fcb0cc8:1",
    "b3edc88f2938467e:1",
    "c8e28b0b4002a3a0:1",
    "c129715d7a2bc9a3:1",
  ]);
  testHash(t, " hello; \t\nworld!!!\r\n\n\r  \t\tGreetings\r End\r\n", [
    "e9496ae3ebfced30:1",
    "fb7c023a8b9ccb3f:1",
    "ce8ba1a563dcdaca:1",
    "e20e36e16fcb0cc8:1",
    "b3edc88f2938467e:1",
    "c8e28b0b4002a3a0:1",
    "c129715d7a2bc9a3:1",
  ]);

  // Try repeating line that will generate identical hashes
  testHash(t, "Lorem ipsum dolor sit amet.\n".repeat(10), [
    "a7f2ff13bc495cf2:1",
    "a7f2ff13bc495cf2:2",
    "a7f2ff13bc495cf2:3",
    "a7f2ff13bc495cf2:4",
    "a7f2ff13bc495cf2:5",
    "a7f2ff13bc495cf2:6",
    "a7f2ff1481e87703:1",
    "a9cf91f7bbf1862b:1",
    "55ec222b86bcae53:1",
    "cc97dc7b1d7d8f7b:1",
    "c129715d7a2bc9a3:1",
  ]);

  testHash(t, "x = 2\nx = 1\nprint(x)\nx = 3\nprint(x)\nx = 4\nprint(x)\n", [
    "e54938cc54b302f1:1",
    "bb609acbe9138d60:1",
    "1131fd5871777f34:1",
    "5c482a0f8b35ea28:1",
    "54517377da7028d2:1",
    "2c644846cb18d53e:1",
    "f1b89f20de0d133:1",
    "c129715d7a2bc9a3:1",
  ]);
});

function testResolveUriToFile(uri: any, index: any, artifactsURIs: any[]) {
  const location = { uri, index };
  const artifacts = artifactsURIs.map((artifactURI) => ({
    location: { uri: artifactURI },
  }));
  return fingerprints.resolveUriToFile(
    location,
    artifacts,
    process.cwd(),
    getRunnerLogger(true)
  );
}

test("resolveUriToFile", (t) => {
  // The resolveUriToFile method checks that the file exists and is in the right directory
  // so we need to give it real files to look at. We will use this file as an example.
  // For this to work we require the current working directory to be a parent, but this
  // should generally always be the case so this is fine.
  const cwd = process.cwd();
  const filepath = __filename;
  t.true(filepath.startsWith(`${cwd}/`));
  const relativeFilepath = filepath.substring(cwd.length + 1);

  // Absolute paths are unmodified
  t.is(testResolveUriToFile(filepath, undefined, []), filepath);
  t.is(testResolveUriToFile(`file://${filepath}`, undefined, []), filepath);

  // Relative paths are made absolute
  t.is(testResolveUriToFile(relativeFilepath, undefined, []), filepath);
  t.is(
    testResolveUriToFile(`file://${relativeFilepath}`, undefined, []),
    filepath
  );

  // Absolute paths outside the src root are discarded
  t.is(testResolveUriToFile("/src/foo/bar.js", undefined, []), undefined);
  t.is(
    testResolveUriToFile("file:///src/foo/bar.js", undefined, []),
    undefined
  );

  // Other schemes are discarded
  t.is(testResolveUriToFile(`https://${filepath}`, undefined, []), undefined);
  t.is(testResolveUriToFile(`ftp://${filepath}`, undefined, []), undefined);

  // Invalid URIs are discarded
  t.is(testResolveUriToFile(1, undefined, []), undefined);
  t.is(testResolveUriToFile(undefined, undefined, []), undefined);

  // Non-existent files are discarded
  t.is(testResolveUriToFile(`${filepath}2`, undefined, []), undefined);

  // Index is resolved
  t.is(testResolveUriToFile(undefined, 0, [filepath]), filepath);
  t.is(testResolveUriToFile(undefined, 1, ["foo", filepath]), filepath);

  // Invalid indexes are discarded
  t.is(testResolveUriToFile(undefined, 1, [filepath]), undefined);
  t.is(testResolveUriToFile(undefined, "0", [filepath]), undefined);

  // Directories are discarded
  const dirpath = __dirname;
  t.is(testResolveUriToFile(dirpath, undefined, []), undefined);
  t.is(testResolveUriToFile(`file://${dirpath}`, undefined, []), undefined);
});

test("addFingerprints", (t) => {
  // Run an end-to-end test on a test file
  let input = fs
    .readFileSync(`${__dirname}/../src/testdata/fingerprinting.input.sarif`)
    .toString();
  let expected = fs
    .readFileSync(`${__dirname}/../src/testdata/fingerprinting.expected.sarif`)
    .toString();

  // The test files are stored prettified, but addFingerprints outputs condensed JSON
  input = JSON.stringify(JSON.parse(input));
  expected = JSON.stringify(JSON.parse(expected));

  // The URIs in the SARIF files resolve to files in the testdata directory
  const checkoutPath = path.normalize(`${__dirname}/../src/testdata`);

  t.deepEqual(
    fingerprints.addFingerprints(input, checkoutPath, getRunnerLogger(true)),
    expected
  );
});

test("missingRegions", (t) => {
  // Run an end-to-end test on a test file
  let input = fs
    .readFileSync(`${__dirname}/../src/testdata/fingerprinting2.input.sarif`)
    .toString();
  let expected = fs
    .readFileSync(`${__dirname}/../src/testdata/fingerprinting2.expected.sarif`)
    .toString();

  // The test files are stored prettified, but addFingerprints outputs condensed JSON
  input = JSON.stringify(JSON.parse(input));
  expected = JSON.stringify(JSON.parse(expected));

  // The URIs in the SARIF files resolve to files in the testdata directory
  const checkoutPath = path.normalize(`${__dirname}/../src/testdata`);

  t.deepEqual(
    fingerprints.addFingerprints(input, checkoutPath, getRunnerLogger(true)),
    expected
  );
});
