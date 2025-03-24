import path from 'node:path'

export default function parseFilename(filename) {
  const ext = path.extname(filename)

  return {
    dir: path.dirname(filename),
    base: path.basename(filename),
    ext,
    name: path.basename(filename, ext),
  }
}
