# plugin-paginate-graphql.js

> Octokit plugin to paginate GraphQL API endpoint responses

[![@latest](https://img.shields.io/npm/v/@octokit/plugin-paginate-graphql.svg)](https://www.npmjs.com/package/@octokit/plugin-paginate-graphql)
[![Build Status](https://github.com/octokit/plugin-paginate-graphql.js/workflows/Test/badge.svg)](https://github.com/octokit/plugin-paginate-graphql.js/actions?workflow=Test)

## Usage

<table>
<tbody valign=top align=left>
<tr><th>
Browsers
</th><td width=100%>

Load `@octokit/plugin-paginate-graphql` and [`@octokit/core`](https://github.com/octokit/core.js) (or core-compatible module) directly from [esm.sh](https://esm.sh)

```html
<script type="module">
  import { Octokit } from "https://esm.sh/@octokit/core";
  import { paginateGraphQL } from "https://esm.sh/@octokit/plugin-paginate-graphql";
</script>
```

</td></tr>
<tr><th>
Node
</th><td>

Install with `npm install @octokit/core @octokit/plugin-paginate-graphql`. Optionally replace `@octokit/core` with a core-compatible module

```js
import { Octokit } from "@octokit/core";
import { paginateGraphQL } from "@octokit/plugin-paginate-graphql";
```

</td></tr>
</tbody>
</table>

> [!IMPORTANT]
> As we use [conditional exports](https://nodejs.org/api/packages.html#conditional-exports), you will need to adapt your `tsconfig.json` by setting `"moduleResolution": "node16", "module": "node16"`.
>
> See the TypeScript docs on [package.json "exports"](https://www.typescriptlang.org/docs/handbook/modules/reference.html#packagejson-exports).<br>
> See this [helpful guide on transitioning to ESM](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c) from [@sindresorhus](https://github.com/sindresorhus)

```js
const MyOctokit = Octokit.plugin(paginateGraphQL);
const octokit = new MyOctokit({ auth: "secret123" });

const { repository } = await octokit.graphql.paginate(
  `query paginate($cursor: String) {
    repository(owner: "octokit", name: "rest.js") {
      issues(first: 10, after: $cursor) {
        nodes {
          title
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }`,
);

console.log(`Found ${repository.issues.nodes.length} issues!`);
```

There are two conventions this plugin relies on:

1. The name of the cursor variable must be `$cursor`
2. You must include a valid `pageInfo` object in the paginated resource (see [Pagination Direction](#pagination-direction) for more info on what is considered valid)

## `octokit.graphql.paginate()`

The `paginateGraphQL` plugin adds a new `octokit.graphql.paginate()` method which accepts a query with a single `$cursor` variable that is used to paginate.

The query gets passed over to the `octokit.graphql()`-function. The response is then scanned for the required `pageInfo`-object. If `hasNextPage` is `true`, it will automatically use the `endCursor` to execute the next query until `hasNextPage` is `false`.

While iterating, it continually merges all `nodes` and/or `edges` of all responses and returns a combined response in the end.

> **Warning**
> Please note that this plugin only supports pagination of a single resource - so you can **not** execute queries with parallel or nested pagination. You can find more details in [the chapter below](#unsupported-nested-pagination).

## `octokit.graphql.paginate.iterator()`

If your target runtime environments supports async iterators (such as most modern browsers and Node 10+), you can iterate through each response:

```js
const pageIterator = octokit.graphql.paginate.iterator(
  `query paginate($cursor: String) {
    repository(owner: "octokit", name: "rest.js") {
      issues(first: 10, after: $cursor) {
        nodes {
          title
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }`,
);

for await (const response of pageIterator) {
  const issues = response.repository.issues;
  console.log(`${issues.length} issues found.`);
}
```

### Variables

Just like with [octokit/graphql.js](https://github.com/octokit/graphql.js/#variables), you can pass your own variables as a second parameter to the `paginate` or `iterator` function.

```js
await octokit.graphql.paginate(
  `
      query paginate($cursor: String, $organization: String!) {
        repository(owner: $organization, name: "rest.js") {
          issues(first: 10, after: $cursor) {
            nodes {
              title
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `,
  {
    organization: "octokit",
  },
);
```

You can also use this to pass a initial cursor value:

```js
await octokit.graphql.paginate(
  `
      query paginate($cursor: String, $organization: String!) {
        repository(owner: $organization, name: "rest.js") {
          issues(first: 10, after: $cursor) {
            nodes {
              title
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `,
  {
    organization: "octokit",
    cursor: "initialValue",
  },
);
```

### Pagination Direction

You can control the pagination direction by the properties defined in the `pageInfo` resource.

For a forward pagination, use:

```gql
pageInfo {
  hasNextPage
  endCursor
}
```

For a backwards pagination, use:

```gql
pageInfo {
  hasPreviousPage
  startCursor
}
```

If you provide all 4 properties in a `pageInfo`, the plugin will default to forward pagination.

### Unsupported: Nested pagination

Nested pagination with GraphQL is complicated, so the following **is not supported**:

```js
await octokit.graphql.paginate((cursor) => {
  const issuesCursor = cursor.create("issuesCursor");
  const commentsCursor = cursor.create("issuesCursor");
  return `{
    repository(owner: "octokit", name: "rest.js") {
      issues(first: 10, after: ${issuesCursor}) {
        nodes {
          title,
          comments(first: 10, after: ${commentsCursor}) {
            nodes: {
              body
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }`;
});
```

There is a great video from GitHub Universe 2019 [Advanced patterns for GitHub's GraphQL API](https://www.youtube.com/watch?v=i5pIszu9MeM&t=719s) by [@ReaLoretta](https://github.com/ReaLoretta) that goes into depth why this is so hard to achieve and patterns and ways around it.

### TypeScript Support

You can type the response of the `paginateGraphQL()` and `iterator()` functions like this:

```ts
await octokit.graphql.paginate<RepositoryIssueResponseType>((cursor) => {
  return `{
      repository(owner: "octokit", name: "rest.js") {
        issues(first: 10, after: ${cursor.create()}) {
          nodes {
            title
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }`;
});
```

You can utilize the `PageInfoForward` and `PageInfoBackward`-Interfaces exported from this library to construct your response-types:

```ts
import { PageInfoForward } from "@octokit/plugin-paginate-graphql";

type Issues = {
  title: string;
};

type IssueResponseType = {
  repository: {
    issues: {
      nodes: Issues[];
      pageInfo: PageInfoForward;
    };
  };
};

// Response will be of type IssueResponseType
const response = await octokit.graphql.paginate<IssueResponseType>((cursor) => {
  return `{
      repository(owner: "octokit", name: "rest.js") {
        issues(first: 10, after: ${cursor.create()}) {
          nodes {
            title
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }`;
});
```

The `PageInfoBackward` contains the properties `hasPreviousPage` and `startCursor` and can be used accordingly when doing backwards pagination.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[MIT](LICENSE)
