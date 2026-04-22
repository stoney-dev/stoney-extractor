# @stoney-dev/extractor

Deterministic API shape extractor. Reads your route code, emits OpenAPI 3.1.

Used internally by [Stoney](https://stoneydev.com) to derive contract candidates from source code without executing it or persisting it.

## What it does

Given a set of in-memory files (typically `app/api/**/route.ts` from Next.js), it returns:

- An **OpenAPI 3.1 document** describing the routes, methods, parameters, and response shapes it could determine
- A **coverage report** listing which routes had typed responses, which were opaque, and which files were skipped

## What it does not do

- **No network access.** The extractor never fetches anything.
- **No filesystem access.** Files come in as strings. The extractor operates on them in-memory via `ts-morph`'s virtual FS.
- **No environment variables.** No secrets, no config files read from disk.
- **No code execution.** Static analysis only. The user's code is never run.

## Install

```bash
pnpm add @stoney-dev/extractor
```

## Use

```ts
import { extract } from "@stoney-dev/extractor";

const result = extract({
  files: [
    { path: "app/api/users/[id]/route.ts", content: "..." },
  ],
  options: { title: "My API" },
});

console.log(result.spec);      // OpenAPI 3.1 document
console.log(result.coverage);  // What was and wasn't extracted
```

## Supported frameworks

- Next.js App Router (`app/**/route.{ts,tsx,js,mjs,jsx}`)
- Next.js Pages Router (`pages/api/**/*.{ts,tsx,js,mjs,jsx}`)

## License

MIT © [The Tiny Rock, LLC](https://stoneydev.com)
