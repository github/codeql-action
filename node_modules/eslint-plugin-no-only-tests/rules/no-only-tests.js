/**
 * @fileoverview Rule to flag use of .only in tests, preventing focused tests being committed accidentally
 * @author Levi Buzolic
 */

'use strict';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const defaultOptions = {
  block: ['describe', 'it', 'context', 'test', 'tape', 'fixture', 'serial', 'Feature', 'Scenario', 'Given', 'And', 'When', 'Then'],
  focus: ['only'],
  fix: false,
};

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
            default: defaultOptions.block,
          },
          focus: {
            type: 'array',
            items: {
              type: 'string',
            },
            uniqueItems: true,
            default: defaultOptions.focus,
          },
          fix: {
            type: 'boolean',
            default: defaultOptions.fix,
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = Object.assign({}, defaultOptions, context.options[0]);
    const blocks = options.block || [];
    const focus = options.focus || [];
    const fix = !!options.fix;

    return {
      Identifier(node) {
        const parentObject = node.parent && node.parent.object;
        if (parentObject == null) return;
        if (focus.indexOf(node.name) === -1) return;

        const callPath = getCallPath(node.parent).join('.');

        // comparison guarantees that matching is done with the beginning of call path
        if (
          blocks.find(block => {
            // Allow wildcard tail matching of blocks when ending in a `*`
            if (block.endsWith('*')) return callPath.startsWith(block.replace(/\*$/, ''));
            return callPath.startsWith(`${block}.`);
          })
        ) {
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
    if (node.object) return getCallPath(node.object, [nodeName, ...path]);
    if (node.callee) return getCallPath(node.callee, path);
    return [nodeName, ...path];
  }
  return path;
}
