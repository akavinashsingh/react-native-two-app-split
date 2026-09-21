# Examples

Copyable configuration, genericised from a real two-app split. Rename `@org/shared` and the app folder names to match your tree.

| File | Goes where | Notes |
|---|---|---|
| `metro.config.js` | each app's `metro.config.js` | The important one. Both apps need the **identical** `singletons` list |
| `app-tsconfig.json` | each app's `tsconfig.json` | `paths` must mirror the Metro pins, or one resolver lies to you |
| `shared-package.json` | `shared/package.json` | Declares zero dependencies. The long `description` is load-bearing: it stops the next person from "fixing" it |
| `root-package.json` | repo root `package.json` | Note which packages are **not** in `workspaces` |

Read [doc 02](../docs/02-metro-duplicate-instances.md) before copying `metro.config.js`. The list of pinned modules is specific to what your shared package imports, and an incomplete list is worse than none, because it looks like it works.
