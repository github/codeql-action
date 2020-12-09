# OpenCensus Web types
[![Gitter chat][gitter-image]][gitter-url]

*For overview and usage info see the main [OpenCensus Web readme][oc-web-readme-url].*

This package provides TypeScript interfaces and enums for the OpenCensus core 
trace and metrics model. These are copied from the OpenCensus Node 
[@opencensus/core][opencensus-core-url] package.

The library is in alpha stage and the API is subject to change.

## Why not just depend on `@opencensus/core`?

The `@opencensus/core` package includes some Node-specific dependencies
that make it difficult to import in web-specific packages. This will be
particularly true once OpenCensus Web supports building with Bazel (see
[rules_typescript](https://github.com/bazelbuild/rules_typescript) on GitHub).

This package resolves these dependency issues by copying the `types.ts` and
supporting files from the `@opencensus/core`. It also uses a polyfill for the
`NodeJS.EventEmitter` type to avoid a dependency on the `@types/node` package.

Having the types copied will also make it easier to adopt a build with using
Bazel (see [rules_typescript][rules-typescript-url]), [Tsickle][tsickle-url],
and [Closure][closure-url], which would result in more optimized
(smaller) JS binary sizes.

## How to refresh the types

To refresh the types for a new release (or a non-released commit) of 
`@opencensus/core`, modify the `copytypes` command in the `package.json` file 
with the git tag of the new release. You may need to also modify the list of
copied files or the patching logic in the `scripts/copy-types.js` file.

Then run `npm run copytypes` to copy the types.

## Usage

Currently the primary intended usage of OpenCensus Web is to collect
spans from the resource timing waterfall of an initial page load
and trace on-page user interactions with a series of features like automatic tracing 
for *clicks* and *route transitions*, *custom spans*, and browser [Performance API][performance-api] data.
See the [OpenCensus Web readme][oc-web-readme-url] for details.

In the future we would like to support collecting spans for XHRs and other
operations made after the initial page load and then join those back to the
Resrouce Timing API information for more detailed network timings and events.

## Useful links
- For more information on OpenCensus, visit: <https://opencensus.io/>
- For more about OpenCensus Web: <https://github.com/census-instrumentation/opencensus-web>
- For help or feedback on this project, join us on [gitter][gitter-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[gitter-image]: https://badges.gitter.im/census-instrumentation/lobby.svg
[gitter-url]: https://gitter.im/census-instrumentation/lobby
[opencensus-core-url]: https://github.com/census-instrumentation/opencensus-node/tree/master/packages/opencensus-core
[oc-web-readme-url]: https://github.com/census-instrumentation/opencensus-web/blob/master/README.md
[license-url]: https://github.com/census-instrumentation/opencensus-web/blob/master/packages/opencensus-web-instrumentation-perf/LICENSE
[rules-typescript-url]: https://github.com/bazelbuild/rules_typescript
[tsickle-url]: https://github.com/angular/tsickle
[closure-url]: https://github.com/google/closure-compiler
