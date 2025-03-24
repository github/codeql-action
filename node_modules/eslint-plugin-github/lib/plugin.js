import {packageJson} from './utils/commonjs-json-wrappers.cjs'
import a11yNoVisuallyHiddenInteractiveElement from './rules/a11y-no-visually-hidden-interactive-element.js'
import a11yNoGenericLinkText from './rules/a11y-no-generic-link-text.js'
import a11yNoTitleAttribute from './rules/a11y-no-title-attribute.js'
import a11yAriaLabelIsWellFormatted from './rules/a11y-aria-label-is-well-formatted.js'
import a11yRoleSupportsAriaProps from './rules/a11y-role-supports-aria-props.js'
import a11ySvgHasAccessibleName from './rules/a11y-svg-has-accessible-name.js'
import arrayForeach from './rules/array-foreach.js'
import asyncCurrenttarget from './rules/async-currenttarget.js'
import asyncPreventdefault from './rules/async-preventdefault.js'
import authenticityToken from './rules/authenticity-token.js'
import filenamesMatchRegex from './rules/filenames-match-regex.js'
import getAttribute from './rules/get-attribute.js'
import jsClassName from './rules/js-class-name.js'
import noBlur from './rules/no-blur.js'
import noDNone from './rules/no-d-none.js'
import noDataset from './rules/no-dataset.js'
import noImplicitBuggyGlobals from './rules/no-implicit-buggy-globals.js'
import noInnerHTML from './rules/no-inner-html.js'
import noInnerText from './rules/no-innerText.js'
import noDynamicScriptTag from './rules/no-dynamic-script-tag.js'
import noThen from './rules/no-then.js'
import noUselessPassive from './rules/no-useless-passive.js'
import preferObservers from './rules/prefer-observers.js'
import requirePassiveEvents from './rules/require-passive-events.js'
import unescapedHtmlLiteral from './rules/unescaped-html-literal.js'

const {name, version} = packageJson

export default {
  meta: {name, version},
  rules: {
    'a11y-no-visually-hidden-interactive-element': a11yNoVisuallyHiddenInteractiveElement,
    'a11y-no-generic-link-text': a11yNoGenericLinkText,
    'a11y-no-title-attribute': a11yNoTitleAttribute,
    'a11y-aria-label-is-well-formatted': a11yAriaLabelIsWellFormatted,
    'a11y-role-supports-aria-props': a11yRoleSupportsAriaProps,
    'a11y-svg-has-accessible-name': a11ySvgHasAccessibleName,
    'array-foreach': arrayForeach,
    'async-currenttarget': asyncCurrenttarget,
    'async-preventdefault': asyncPreventdefault,
    'authenticity-token': authenticityToken,
    'filenames-match-regex': filenamesMatchRegex,
    'get-attribute': getAttribute,
    'js-class-name': jsClassName,
    'no-blur': noBlur,
    'no-d-none': noDNone,
    'no-dataset': noDataset,
    'no-implicit-buggy-globals': noImplicitBuggyGlobals,
    'no-inner-html': noInnerHTML,
    'no-innerText': noInnerText,
    'no-dynamic-script-tag': noDynamicScriptTag,
    'no-then': noThen,
    'no-useless-passive': noUselessPassive,
    'prefer-observers': preferObservers,
    'require-passive-events': requirePassiveEvents,
    'unescaped-html-literal': unescapedHtmlLiteral,
  },
}
