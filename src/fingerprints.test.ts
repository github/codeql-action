import * as fs from 'fs';

import * as fingerprints from './fingerprints';

function testHash(input: string, expectedHashes: string[]) {
    let index = 0;
    let callback = function (lineNumber: number, hash: string) {
        expect(lineNumber).toBe(index + 1);
        expect(hash).toBe(expectedHashes[index]);
        index++;
    };
    fingerprints.hash(callback, input);
    expect(index).toBe(input.split(/\r\n|\r|\n/).length);
}

test('hash', () => {
    // Try empty file
    testHash("", ["c129715d7a2bc9a3:1"]);

    // Try various combinations of newline characters
    testHash(
        " a\nb\n  \t\tc\n d",
        [
            "271789c17abda88f:1",
            "54703d4cd895b18:1",
            "180aee12dab6264:1",
            "a23a3dc5e078b07b:1"
        ]);
    testHash(
        " hello; \t\nworld!!!\n\n\n  \t\tGreetings\n End",
        [
            "8b7cf3e952e7aeb2:1",
            "b1ae1287ec4718d9:1",
            "bff680108adb0fcc:1",
            "c6805c5e1288b612:1",
            "b86d3392aea1be30:1",
            "e6ceba753e1a442:1",
        ]);
    testHash(
        " hello; \t\nworld!!!\n\n\n  \t\tGreetings\n End\n",
        [
            "e9496ae3ebfced30:1",
            "fb7c023a8b9ccb3f:1",
            "ce8ba1a563dcdaca:1",
            "e20e36e16fcb0cc8:1",
            "b3edc88f2938467e:1",
            "c8e28b0b4002a3a0:1",
            "c129715d7a2bc9a3:1",
        ]);
    testHash(
        " hello; \t\nworld!!!\r\r\r  \t\tGreetings\r End\r",
        [
            "e9496ae3ebfced30:1",
            "fb7c023a8b9ccb3f:1",
            "ce8ba1a563dcdaca:1",
            "e20e36e16fcb0cc8:1",
            "b3edc88f2938467e:1",
            "c8e28b0b4002a3a0:1",
            "c129715d7a2bc9a3:1",
        ]);
    testHash(
        " hello; \t\r\nworld!!!\r\n\r\n\r\n  \t\tGreetings\r\n End\r\n",
        [
            "e9496ae3ebfced30:1",
            "fb7c023a8b9ccb3f:1",
            "ce8ba1a563dcdaca:1",
            "e20e36e16fcb0cc8:1",
            "b3edc88f2938467e:1",
            "c8e28b0b4002a3a0:1",
            "c129715d7a2bc9a3:1",
        ]);
    testHash(
        " hello; \t\nworld!!!\r\n\n\r  \t\tGreetings\r End\r\n",
        [
            "e9496ae3ebfced30:1",
            "fb7c023a8b9ccb3f:1",
            "ce8ba1a563dcdaca:1",
            "e20e36e16fcb0cc8:1",
            "b3edc88f2938467e:1",
            "c8e28b0b4002a3a0:1",
            "c129715d7a2bc9a3:1",
        ]);

    // Try repeating line that will generate identical hashes
    testHash(
        "Lorem ipsum dolor sit amet.\n".repeat(10),
        [
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
            "c129715d7a2bc9a3:1"
        ]);
});

function testResolveUriToFile(uri: any, index: any, artifactsURIs: any[]) {
    const location = { "uri": uri, "index": index };
    const artifacts = artifactsURIs.map(uri => ({ "location": { "uri": uri } }));
    return fingerprints.resolveUriToFile(location, artifacts);
}

test('resolveUriToFile', () => {
    // The resolveUriToFile method checks that the file exists and is in the right directory
    // so we need to give it real files to look at. We will use this file as an example.
    // For this to work we require the current working directory to be a parent, but this
    // should generally always be the case so this is fine.
    const cwd = process.cwd();
    const filepath = __filename;
    expect(filepath.startsWith(cwd + '/')).toBeTruthy();
    const relativeFilepaht = filepath.substring(cwd.length + 1);

    process.env['GITHUB_WORKSPACE'] = cwd;

    // Absolute paths are unmodified
    expect(testResolveUriToFile(filepath, undefined, [])).toBe(filepath);
    expect(testResolveUriToFile('file://' + filepath, undefined, [])).toBe(filepath);

    // Relative paths are made absolute
    expect(testResolveUriToFile(relativeFilepaht, undefined, [])).toBe(filepath);
    expect(testResolveUriToFile('file://' + relativeFilepaht, undefined, [])).toBe(filepath);

    // Absolute paths outside the src root are discarded
    expect(testResolveUriToFile('/src/foo/bar.js', undefined, [])).toBe(undefined);
    expect(testResolveUriToFile('file:///src/foo/bar.js', undefined, [])).toBe(undefined);

    // Other schemes are discarded
    expect(testResolveUriToFile('https://' + filepath, undefined, [])).toBe(undefined);
    expect(testResolveUriToFile('ftp://' + filepath, undefined, [])).toBe(undefined);

    // Invalid URIs are discarded
    expect(testResolveUriToFile(1, undefined, [])).toBe(undefined);
    expect(testResolveUriToFile(undefined, undefined, [])).toBe(undefined);

    // Non-existant files are discarded
    expect(testResolveUriToFile(filepath + '2', undefined, [])).toBe(undefined);

    // Index is resolved
    expect(testResolveUriToFile(undefined, 0, [filepath])).toBe(filepath);
    expect(testResolveUriToFile(undefined, 1, ['foo', filepath])).toBe(filepath);

    // Invalid indexes are discarded
    expect(testResolveUriToFile(undefined, 1, [filepath])).toBe(undefined);
    expect(testResolveUriToFile(undefined, '0', [filepath])).toBe(undefined);
});

test('addFingerprints', () => {
    // Run an end-to-end test on a test file
    let input = fs.readFileSync(__dirname + '/testdata/fingerprinting.input.sarif').toString();
    let expected = fs.readFileSync(__dirname + '/testdata/fingerprinting.expected.sarif').toString();

    // The test files are stored prettified, but addFingerprints outputs condensed JSON
    input = JSON.stringify(JSON.parse(input));
    expected = JSON.stringify(JSON.parse(expected));

    // The URIs in the SARIF files resolve to files in the testdata directory
    process.env['GITHUB_WORKSPACE'] = __dirname + '/testdata';

    expect(fingerprints.addFingerprints(input)).toBe(expected);
});

test('missingRegions', () => {
    // Run an end-to-end test on a test file
    let input = fs.readFileSync(__dirname + '/testdata/fingerprinting2.input.sarif').toString();
    let expected = fs.readFileSync(__dirname + '/testdata/fingerprinting2.expected.sarif').toString();

    // The test files are stored prettified, but addFingerprints outputs condensed JSON
    input = JSON.stringify(JSON.parse(input));
    expected = JSON.stringify(JSON.parse(expected));

    // The URIs in the SARIF files resolve to files in the testdata directory
    process.env['GITHUB_WORKSPACE'] = __dirname + '/testdata';

    expect(fingerprints.addFingerprints(input)).toBe(expected);
});
