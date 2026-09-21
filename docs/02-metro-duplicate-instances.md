# 02. Metro and duplicate instances

This is the doc worth reading. Everything else is bookkeeping.

## The setup

`shared/` is symlinked into `app-customer/node_modules/@org/shared`, but its source physically lives at `repo-root/shared`. Two consequences.

### Consequence 1: Metro will not serve it

Metro only serves files under `projectRoot`. Shared source is outside it, so you get a resolution error on the first import. Everyone hits this, and the fix is in every guide:

```js
watchFolders: [path.resolve(__dirname, '..')]
```

### Consequence 2: the one nobody warns you about

Now Metro serves the file. But when `shared/src/store/authStore.ts` does:

```ts
import { create } from 'zustand'
```

Metro resolves that import **from the file's own location**. It walks up from `repo-root/shared/` and finds `repo-root/node_modules/zustand`, the root tree. Your app code, at `app-customer/src/...`, walks up and finds `app-customer/node_modules/zustand`. Different physical directory. Different module. Two instances.

**No error is raised.** Both resolutions succeeded. That is the whole problem.

## What two instances actually does

Sorted by how long it takes to diagnose, fastest first:

**React, split into two copies.** You get `TypeError: Cannot read property 'current' of null`, or the "Invalid hook call" warning, thrown from inside a shared component that is obviously correct. React keeps its hook dispatcher in module-level state, so a component rendered by one React's renderer while importing hooks from the other React finds a null dispatcher. This one at least crashes loudly.

**A state store, split into two copies.** This one is quiet and it cost us the most. Sign-in happens on a shared auth screen, which writes to the shared copy of the store. The app shell reads the app copy. The user taps through a successful OTP, the request returns 200, a token is persisted, and the app sits on the login screen because as far as its store is concerned nothing happened. Nothing is logged. Nothing throws. You will suspect your API, your persistence layer and your navigation before you suspect module resolution.

**A native module, registered twice.** AsyncStorage, geolocation, vector icons, Crashlytics. The native side registers once per app, and the second JS copy holds a handle to something that is not there. Symptoms vary by module and none of them name the real cause.

**axios, duplicated.** Two problems at once: you ship two copies of the library, and interceptor registration is instance state, so the interceptor your app installs is not on the client your shared API module uses. Auth headers silently stop being attached on exactly the requests made from shared code. In our tree the root also carried a *different version* (an older axios from the backend package), so the two copies did not even behave the same.

## The fix: pin every shared dependency

Enumerate every bare import in your shared package, and force each one to the host app's copy:

```js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')
const localCopy = (name) => path.resolve(projectRoot, 'node_modules', name)

// Every dependency imported by shared/src, pinned to THIS app's copy, so a
// shared file and an app file always receive the same instance.
const singletons = {
  // React stack. Stateful singletons; a split is the useRef-null crash.
  react: localCopy('react'),
  'react-native': localCopy('react-native'),
  scheduler: localCopy('scheduler'),
  'react-is': localCopy('react-is'),

  // HTTP client. Fixes version duplication and split interceptor state.
  axios: localCopy('axios'),

  // Stateful store. Must be one instance across shared screens and app shell.
  zustand: localCopy('zustand'),

  // Native single-instance modules. Double registration breaks them.
  '@react-native-async-storage/async-storage': localCopy('@react-native-async-storage/async-storage'),
  '@react-native-community/geolocation': localCopy('@react-native-community/geolocation'),
  'react-native-safe-area-context': localCopy('react-native-safe-area-context'),
  'react-native-vector-icons': localCopy('react-native-vector-icons'),
  '@react-native-firebase/crashlytics': localCopy('@react-native-firebase/crashlytics'),
}

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    resolveRequest: (context, moduleName, platform) => {
      for (const name of Object.keys(singletons)) {
        if (moduleName === name || moduleName.startsWith(name + '/')) {
          const remainder = moduleName.slice(name.length)  // '' or '/subpath'
          return context.resolveRequest(context, singletons[name] + remainder, platform)
        }
      }
      return context.resolveRequest(context, moduleName, platform)
    },
  },
}

module.exports = mergeConfig(getDefaultConfig(projectRoot), config)
```

Full copyable version: [`examples/metro.config.js`](../examples/metro.config.js).

### Four details that matter

**The `startsWith(name + '/')` branch is not optional.** `react/jsx-runtime` is what the automatic JSX transform actually imports, and it is a subpath. Pin only the bare `react` specifier and every compiled component still pulls the unpinned runtime, which is the same split you were trying to prevent, now harder to see.

**Slicing the remainder preserves the subpath.** `zustand/middleware` must land at `<pinned zustand>/middleware`, not at `<pinned zustand>`.

**The list must be exhaustive.** One unpinned stateful dependency is one duplicate instance. Derive it mechanically rather than from memory:

```bash
grep -rhoE "from '[^.@][^']*'|from '@[^/]+/[^']+'" shared/src \
  | sed "s/from '//;s/'$//" | cut -d/ -f1-2 | sort -u
```

**Both apps need the identical list.** They share the same package, so they have the same import surface. Keep a comment in each config saying so, because the file you will forget to update is the second one.

## Why not `resolver.extraNodeModules`?

It works for some cases, but it applies to unresolved requests rather than intercepting all of them, and its behaviour around symlinked packages and subpaths is less predictable than an explicit `resolveRequest`. `resolveRequest` is a function you can read, reason about and log from. In a debugging session where the symptom is "nothing happens", that is worth a lot.

## Verifying it actually worked

Type checking will not tell you. Add a temporary identity probe, run on a device, then delete it:

```ts
// in a shared file
export const sharedInstanceId = Math.random()
// in an app file
import { sharedInstanceId } from '@org/shared/debug'
console.log('shared sees', sharedInstanceId)
```

Log the same value from both sides. Two different numbers means two module graphs. For React specifically, `require('react') === require('@org/shared/node_modules/react')` is not a check you can write portably, so the probe pattern is the practical one.

The real test is behavioural and takes two minutes: **sign in on a shared auth screen and confirm the app shell sees the session.** That single flow exercises the store, the HTTP client, the persistence layer and React all at once. If it works on a device, your pins are right.
