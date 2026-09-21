# 05. Failure catalogue

Symptom first, because that is what you have when you arrive here.

---

### `npm install` fails with `ERESOLVE could not resolve` mentioning react

**Cause.** The shared package declares `peerDependencies`. npm tries to satisfy them at the repo root, where a web package pins a different React major than the RN apps.

**Fix.** Remove the peer declarations entirely. The host app provides every module. See [doc 03](03-typescript-and-npm.md).

**Not the fix.** `--legacy-peer-deps`, which disables peer resolution for the entire repo.

---

### Metro: `Unable to resolve module @org/shared from ...`

**Cause.** Shared source lives outside `projectRoot` and Metro will not serve it.

**Fix.** `watchFolders: [workspaceRoot]`.

---

### `TypeError: Cannot read property 'current' of null`, or "Invalid hook call", from a shared component

**Cause.** Two copies of React. The shared file resolved React from the repo root, the app resolved it from its own `node_modules`.

**Fix.** Pin `react` **and** `react/jsx-runtime` (covered by the subpath match) and `react-native`, `scheduler`, `react-is` in `resolveRequest`. See [doc 02](02-metro-duplicate-instances.md).

---

### Sign-in succeeds, returns 200, persists a token, and the app stays on the login screen

**Cause.** Two copies of the state store. The shared auth screen wrote to one instance, the app shell reads the other.

**Fix.** Pin the store library in `resolveRequest`.

**Why this one is expensive.** There is no error anywhere. The network tab is clean, the token is in storage, and every individual piece is working. Budget for suspecting your API, your persistence and your navigator first. If you are reading this before it happens to you, you have just saved a day.

---

### Auth headers are attached on some requests and not others

**Cause.** Two copies of axios. Interceptors are instance state, so the interceptor registered by the app is not present on the client used by shared API modules. If the two copies are also different versions, behaviour diverges further.

**Fix.** Pin `axios`.

---

### A native module behaves as if it is not linked, but it is

**Cause.** Double registration. AsyncStorage, geolocation, vector icons and crash reporting each expect one JS handle to one native instance.

**Fix.** Pin every native module the shared package imports.

---

### `Type 'ReactNode' is not assignable to type 'ReactNode'`

**Cause.** Two copies of `@types/react` reachable, so tsc compares structurally identical types from different declaration files.

**Fix.** In the host `tsconfig.json` `paths`, list `node_modules/@types/react` **before** `node_modules/react`, and pin the same set of modules you pinned in Metro.

---

### The Android build dies in about a second with `Plugin [id: 'com.facebook.react.settings'] was not found`

**Cause.** The RN app is an npm workspace member, and the install left a partial copy of `@react-native/gradle-plugin` in the **app's own** `node_modules`, shadowing the complete one. Gradle's composite build looks in the right place and finds a copy with no settings plugin in it. `com.facebook.react.settings` is applied in `android/settings.gradle`, so this fails at settings evaluation, before any task runs.

**The tell that separates it from an ordinary broken install.** A complete copy of the package is present somewhere in the tree while a partial one shadows it. Run `ls node_modules/@react-native/gradle-plugin` from the app directory and compare it against a copy that works, at the repo root or from a fresh non-workspace install. Fewer files in the app's copy is this bug.

**Fix.** Take both RN apps out of `workspaces`, give each a complete local `node_modules` and regenerate the root lockfile. Only the shared package stays in. See [doc 01](01-the-layout.md).

**It is intermittent.** The hoist layout was mangled nondeterministically, so one clean workspace install does not mean you are safe.

---

### `tsc` is green, the bundle builds, the app is broken

**Cause.** You verified the wrong thing. Type checking resolves through `paths` and cannot see duplicate instances, because two copies of a module have identical types.

**Fix.** Run the sign-in flow on a device. That one flow crosses the boundary through the store, the HTTP client, storage and React at once.

---

### Maps render as a blank grey rectangle on the release build only

**Cause.** The Maps API key allowlist has a row for the debug certificate but not the release one, or has rows for one application id but not the second app's.

**Fix.** Four rows minimum: debug and release fingerprints for each application id. See [doc 04](04-native-identity.md).

---

### The store rejects the upload for a signing mismatch, but the APK worked locally

**Cause.** The release keystore was not present, and Gradle silently fell back to the debug signing config.

**Fix.** Make the missing keystore throw. See [doc 04](04-native-identity.md).

---

### A change to a shared file breaks the app you were not working on

**Cause.** This is not a bug, it is the shape of the system. A shared package is two shipped products.

**Fix.** Process, not code. See [doc 06](06-governing-shared-code.md) and the pre-commit check in [`scripts/`](../scripts/).

---

### After the split, a forked screen checks error codes the server never sends

**Cause.** The fork was made by retyping rather than importing, and the copies drifted immediately.

**Fix.** Fork **presentation only**. Keep the request contract, error codes and validation caps in one shared constants module. See [doc 06](06-governing-shared-code.md).
