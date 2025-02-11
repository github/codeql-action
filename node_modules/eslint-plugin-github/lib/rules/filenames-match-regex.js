// This is adapted from https://github.com/selaux/eslint-plugin-filenames since it's no longer actively maintained
// and needed a fix for eslint v9
const path = require('path')
const parseFilename = require('../utils/parse-filename')
const getExportedName = require('../utils/get-exported-name')
const isIgnoredFilename = require('../utils/is-ignored-filename')

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'ensure filenames match a regex naming convention',
      url: require('../url')(module),
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
          context.report(node, "Filename '{{name}}' does not match the regex naming convention.", {
            name: parsed.base,
          })
        }
      },
    }
  },
}
