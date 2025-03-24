const ignoredFilenames = ['<text>', '<input>']

export default function isIgnoredFilename(filename) {
  return ignoredFilenames.indexOf(filename) !== -1
}
