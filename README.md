# Splitting one React Native app into two

**One RN app with two user roles became two apps on both stores, sharing a 64-file package. Here is what broke, in the order it broke.**

<svg width="540" height="280" viewBox="0 0 540 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A file in shared resolves the zustand import upward into repo-root/node_modules, while a file in app-customer resolves the same specifier into app-customer/node_modules. Both resolutions succeed and the app ends up with two instances of the module.">
  <title>One import specifier, two resolutions, two module instances</title>

  <rect x="10" y="20" width="226" height="58" rx="6" fill="none" stroke="#8b949e" stroke-width="1.25"/>
  <text x="24" y="45" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" fill="#6e7681">shared/src/store/authStore.ts</text>
  <text x="24" y="64" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" font-size="10" fill="#6e7681">source lives at repo-root/shared</text>

  <text x="270" y="42" text-anchor="middle" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" font-size="9.5" fill="#6e7681">walks up</text>
  <line x1="242" y1="49" x2="289" y2="49" stroke="#8b949e" stroke-width="1.5"/>
  <polygon points="298,49 288,44 288,54" fill="#8b949e"/>

  <rect x="304" y="20" width="226" height="58" rx="6" fill="none" stroke="#d95f02" stroke-width="1.25"/>
  <text x="318" y="43" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" fill="#6e7681">repo-root/node_modules/</text>
  <text x="318" y="66" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" font-weight="600" fill="#d95f02">zustand</text>

  <line x1="417" y1="82" x2="417" y2="124" stroke="#8b949e" stroke-width="1.25" stroke-dasharray="4 4"/>
  <text x="417" y="149" text-anchor="middle" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" font-size="20" fill="#d95f02">&#8800;</text>
  <line x1="417" y1="158" x2="417" y2="172" stroke="#8b949e" stroke-width="1.25" stroke-dasharray="4 4"/>

  <text x="397" y="126" text-anchor="end" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" font-size="10" fill="#6e7681">different directory,</text>
  <text x="397" y="142" text-anchor="end" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" font-size="10" fill="#6e7681">different module,</text>
  <text x="397" y="158" text-anchor="end" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" font-size="10" fill="#d95f02">no error raised</text>

  <rect x="10" y="176" width="226" height="58" rx="6" fill="none" stroke="#8b949e" stroke-width="1.25"/>
  <text x="24" y="201" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" fill="#6e7681">app-customer/src/App.tsx</text>
  <text x="24" y="220" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" font-size="10" fill="#6e7681">source lives inside the app</text>

  <text x="270" y="198" text-anchor="middle" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" font-size="9.5" fill="#6e7681">walks up</text>
  <line x1="242" y1="205" x2="289" y2="205" stroke="#8b949e" stroke-width="1.5"/>
  <polygon points="298,205 288,200 288,210" fill="#8b949e"/>

  <rect x="304" y="176" width="226" height="58" rx="6" fill="none" stroke="#d95f02" stroke-width="1.25"/>
  <text x="318" y="199" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" fill="#6e7681">app-customer/node_modules/</text>
  <text x="318" y="222" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" font-weight="600" fill="#d95f02">zustand</text>

  <text x="270" y="262" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" fill="#6e7681">both files contain:  import { create } from 'zustand'</text>
</svg>

Metro resolves a file's imports from that file's own location. The shared file and the app file walk up into different `node_modules` trees, both lookups succeed, and nothing is logged. The app now holds two copies of a module that only works as one. [Doc 02](docs/02-metro-duplicate-instances.md) is entirely about this.

Most "React Native monorepo" guides stop at `watchFolders`. That gets you a bundle that builds. It does not get you an app that works, because the interesting failures are not resolution errors. They are silent duplicate instances: you log in on a shared screen and the app never notices, or a hook throws `Cannot read property 'current' of null` in a file you did not touch.

This is a field report from a real split, not a tutorial written from the docs.

**Setup:** React Native 0.84, React 19, npm (not Yarn, not pnpm), bare workflow (no Expo), one customer app and one service-provider app, both live on Google Play and the App Store. Shared package is pure TypeScript, 64 files: theme, API client, auth store, constants, types, utils, a few components and the auth screens.

---

## Contents

| Doc | What it covers |
|---|---|
| [01. The layout](docs/01-the-layout.md) | Three packages, and why **neither app is an npm workspace member** |
| [02. Metro and duplicate instances](docs/02-metro-duplicate-instances.md) | The flagship problem. Why `watchFolders` alone gives you two Reacts |
| [03. TypeScript and npm](docs/03-typescript-and-npm.md) | Why the shared package declares **zero dependencies**, and why `tsc` passing proves nothing |
| [04. Native identity](docs/04-native-identity.md) | Two application ids, two Firebase apps, two keystores, two Maps SHA-1 rows |
| [05. Failure catalogue](docs/05-failure-catalogue.md) | Every symptom we hit, with the cause and the fix |
| [06. Governing shared code](docs/06-governing-shared-code.md) | A shared package is two shipped products. Fork vs restyle, and drift |

Runnable examples are in [`examples/`](examples/). A copyable pre-commit check is in [`scripts/`](scripts/).

---

## The short version

If you read nothing else:

1. **Keep both RN apps out of your npm workspaces.** Put only the shared package in. Each app gets a complete, unhoisted `node_modules` and pulls the shared package in as `file:../shared`. A workspace install can leave an incomplete copy of `@react-native/gradle-plugin` in the app's own `node_modules`, shadowing the good one, and the Android build then dies at settings evaluation with `Plugin [id: 'com.facebook.react.settings'] was not found`.

2. **`watchFolders` is half the fix.** It makes Metro *serve* files outside the project root. It does nothing about *how those files resolve their own imports*. A shared file importing `zustand` walks up from the shared folder to the repo root and finds the root copy, while your app code finds the app copy. Two instances, no error.

3. **Pin every shared dependency with `resolveRequest`.** Enumerate every bare import in your shared package and force it to the host app's copy. The list is short and finite. See [doc 02](docs/02-metro-duplicate-instances.md).

4. **The shared package declares no dependencies at all.** Not `dependencies`, not `peerDependencies`. The host app owns every native module. Declaring peers makes npm try to satisfy them at the repo root, where your web packages pin an older React, and you get a permanent `ERESOLVE`.

5. **Mirror the Metro pins in `tsconfig.json` paths.** Metro and `tsc` resolve independently. If only one is pinned, the other one lies to you.

6. **Green `tsc` is not proof the split works.** It is proof the types line up. Duplicate-instance bugs are invisible to the type checker by construction. Only a device run finds them.

7. **Delete your role-picker screen.** In a two-app world, the app someone installed *is* the role choice. Each app hardcodes its role at registration.

---

## The one-paragraph version of why

A shared package in a monorepo is not a library. A published library gets installed *into* each consumer's `node_modules`, so each consumer gets its own resolved copy of everything and Node's algorithm does the right thing. A `file:` or workspace-linked package physically lives somewhere else, and its imports resolve from *its* location, not from the app importing it. Every duplicate-instance bug in this repo comes from that single fact.

---

## What this is not

- Not Expo. Expo's monorepo support solves some of this for you.
- Not pnpm or Yarn Berry. Their linking strategies change which of these bugs you get, not whether you get them.
- Not a template to clone. It is a set of decisions with the reasoning attached, so you can tell which ones apply to you.

## License

MIT. Take any of it.
