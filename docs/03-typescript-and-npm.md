# 03. TypeScript and npm

## The shared package declares zero dependencies

Not `dependencies`. Not `peerDependencies`. Nothing.

```jsonc
{
  "name": "@org/shared",
  "version": "0.0.1",
  "private": true,
  "main": "src/index.ts",
  "react-native": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./constants": "./src/constants/index.ts",
    "./utils": "./src/utils/index.ts",
    "./api": "./src/api/index.ts",
    "./store": "./src/store/index.ts",
    "./components": "./src/components/index.ts",
    "./hooks": "./src/hooks/index.ts",
    "./screens/auth": "./src/screens/auth/index.ts",
    "./*": "./src/*.ts"
  }
}
```

It imports React, React Native, axios, zustand, AsyncStorage and several native modules, and declares none of them. That looks wrong. Here is why it is not.

### Declaring `peerDependencies` gives you a permanent ERESOLVE

A peer dependency is a request to the installing package manager: "whoever installs me must provide this." The shared package is a workspace member, so "whoever installs me" resolves at the **repo root**. If your monorepo also holds web packages, the root carries their React (18 in our case) while the RN apps carry theirs (19). npm tries to satisfy the peer at the root, finds 18 where 19 is required, and fails the whole install with `ERESOLVE`.

You can paper over it with `--legacy-peer-deps`, which then quietly disables peer resolution everywhere else in the repo too. Not a trade worth making for a private package that is never published.

### So who provides the modules?

The host app, at build time, through the two resolvers:

- **Metro** resolves them via the `resolveRequest` pins in [doc 02](02-metro-duplicate-instances.md).
- **tsc** resolves them via `paths` in the host app's `tsconfig.json`.

The shared package is not independently installable or buildable. That is a real cost. In exchange, there is exactly one copy of every stateful module per app, which is the thing that actually determines whether the app works. Put the reasoning in the `description` field of the shared `package.json` so the next person does not "fix" it.

### Subpath exports, not one mega-barrel

Only the theme is on the bare `.` entry. Everything else is subpath-only (`@org/shared/types`, `@org/shared/api`). Two reasons: a growing barrel that re-exports everything eventually collides on a name and gives you `TS2308`, and a subpath import keeps the module graph tight so a screen that wants a type does not pull in the API client.

## The tsconfig must mirror the Metro config

Metro and `tsc` are separate resolvers with separate configuration. Pin one and not the other and you get one of two bad outcomes: the app runs but the editor is full of red, or the editor is clean and the app crashes.

```jsonc
// app-customer/tsconfig.json
{
  "extends": "@react-native/typescript-config",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],

      "@org/shared": ["../shared/src"],
      "@org/shared/*": ["../shared/src/*"],

      // Same list as metro.config.js singletons, for the same reason.
      "react": ["node_modules/@types/react", "node_modules/react"],
      "react/*": ["node_modules/@types/react/*", "node_modules/react/*"],
      "react-native": ["node_modules/react-native"],
      "react-native/*": ["node_modules/react-native/*"],
      "axios": ["node_modules/axios"],
      "zustand": ["node_modules/zustand"],
      "zustand/*": ["node_modules/zustand/*"],
      "react-native-safe-area-context": ["node_modules/react-native-safe-area-context"],
      "@react-native-async-storage/async-storage": ["node_modules/@react-native-async-storage/async-storage"],
      "@react-native-community/geolocation": ["node_modules/@react-native-community/geolocation"],
      "@react-native-firebase/crashlytics": ["node_modules/@react-native-firebase/crashlytics"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["**/node_modules", "**/Pods"]
}
```

Note the `@types` entry listed **before** the implementation for `react` and for icon packages. Without it, tsc can pick up types from a different copy and report structurally identical types as incompatible: `Type 'ReactNode' is not assignable to type 'ReactNode'`. If you have seen that message, this is usually why.

The `@/*` alias stays app-local. Shared code never uses it, because `@/` means something different in each app.

## The rule that matters most in this doc

**A green `tsc` is not evidence that the split works.**

Type checking resolves through `paths` and confirms the shapes line up. Every duplicate-instance failure in [doc 02](02-metro-duplicate-instances.md) is invisible to it by construction: two copies of zustand have identical types. The type checker's job is to agree that they match. It will do that job perfectly while the app is broken.

The only proof is a device run of a flow that crosses the boundary. Sign-in is the cheapest one.

## Babel

Unchanged and boring, which is the point. The module resolver alias is app-local only:

```js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    ['module-resolver', { root: ['./src'], alias: { '@': './src' } }],
  ],
}
```

Do not try to alias the shared package here. Babel rewrites specifiers before Metro resolves them, so an alias here fights the `resolveRequest` pins instead of helping them.
