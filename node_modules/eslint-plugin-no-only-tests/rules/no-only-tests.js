/**
 * @fileoverview Rule to flag use of .only in tests, preventing focused tests being committed accidentally
 * @author Levi Buzolic
 */

'use strict';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const BLOCK_DEFAULTS = ['describe', 'it', 'context', 'test', 'tape', 'fixture', 'serial'];
const FOCUS_DEFAULTS = ['only'];

module.exports = {
  meta: {
    docs: {
      description: 'disallow .only blocks in tests',
      category: 'Possible Errors',
      recommended: true,
      url: 'https://github.com/levibuzolic/eslint-plugin-no-only-tests',
    },
    fixable: true,
    schema: [
      {
        type: 'object',
        properties: {
          block: {
            type: 'array',
            items: {
              type: 'string',
            },
            uniqueItems: true,
          },
          focus: {
            type: 'array',
            items: {
              type: 'string',
            },
            uniqueItems: true,
          },
          fix: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    var block = (context.options[0] || {}).block || BLOCK_DEFAULTS;
    var focus = (context.options[0] || {}).focus || FOCUS_DEFAULTS;
    var fix = !!(context.options[0] || {}).fix;

    return {
      Identifier(node) {
        var parentObject = node.parent && node.parent.object;
        if (parentObject == null) return;
        if (focus.indexOf(node.name) === -1) return;

        var callPath = getCallPath(node.parent).join('.');

        // comparison guarantees that matching is done with the beginning of call path
        if (block.find(b => callPath.split(b)[0] === '')) {
          context.report({
            node,
            message: callPath + ' not permitted',
            fix: fix ? fixer => fixer.removeRange([node.range[0] - 1, node.range[1]]) : undefined,
          });
        }
      },
    };
  },
};

function getCallPath(node, path = []) {
  if (node) {
    const nodeName = node.name || (node.property && node.property.name);
    if (node.object) {
      return getCallPath(node.object, [nodeName, ...path]);
    }
    if (node.callee) {
      return getCallPath(node.callee, path);
    }
    return [nodeName, ...path];
  }
  return path;
}
