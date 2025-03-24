// This is adapted from https://github.com/selaux/eslint-plugin-filenames since it's no longer actively maintained
// and needed a fix for eslint v9
import path from 'node:path'
import parseFilename from '../utils/parse-filename.js'
import getExportedName from '../utils/get-exported-name.js'
import isIgnoredFilename from '../utils/is-ignored-filename.js'
import url from '../url.js'

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'require filenames to match a regex naming convention',
      url: url(import.meta.url),
      recommended: true,
    },
    schema: {
      type: 'array',
      minItems: 0,
      maxItems: 1,
      items: [
        {
          type: 'string',
        },
      ],
    },
    messages: {
      regex: "Filename '{{name}}' does not match the regex naming convention.",
    },
  },

  create(context) {
    // GitHub's default is kebab case or one hump camel case
    const defaultRegexp = /^[a-z0-9-]+(.[a-z0-9-]+)?$/
    const conventionRegexp = context.options[0] ? new RegExp(context.options[0]) : defaultRegexp
    const ignoreExporting = context.options[1] ? context.options[1] : false

    return {
      Program(node) {
        const filename = context.filename ?? context.getFilename()
        const absoluteFilename = path.resolve(filename)
        const parsed = parseFilename(absoluteFilename)
        const shouldIgnore = isIgnoredFilename(filename)
        const isExporting = Boolean(getExportedName(node))
        const matchesRegex = conventionRegexp.test(parsed.name)

        if (shouldIgnore) return
        if (ignoreExporting && isExporting) return
        if (!matchesRegex) {
          context.report({
            node,
            messageId: 'regex',
            data: {
              name: parsed.base,
            },
          })
        }
      },
    }
  },
}
