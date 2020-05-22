# @concordance/react

React plugin for [Concordance](https://github.com/concordancejs/concordance).

Allows
[`React.createElement()`](https://facebook.github.io/react/docs/react-api.html#createelement)
objects to be compared, formatted, diffed and serialized. Also supports
`toJSON()` renderings of
[`react-test-renderer`](https://www.npmjs.com/package/react-test-renderer).
These may be compared to `React.createElement()` objects.

When comparing [React
component](https://facebook.github.io/react/docs/components-and-props.html)
elements, the element type is compared by identity. After deserialization the
element types are compared by function name.

Component elements are formatted with a &#x235F; character after the element
name. Properties and children are formatted by [Concordance](https://github.com/concordancejs/concordance).
