import {packageJson} from './utils/commonjs-json-wrappers.cjs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const {homepage, version} = packageJson

const getUrl = id => {
  const url = new URL(homepage)
  const rule = path.basename(fileURLToPath(id), '.js')
  url.hash = ''
  url.pathname += `/blob/v${version}/docs/rules/${rule}.md`
  return url.toString()
}

export default getUrl
