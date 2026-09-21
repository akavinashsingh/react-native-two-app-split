# 01. The layout

```text
repo-root/
  package.json          workspaces: ["shared"]   <- note what is NOT here
  shared/               @org/shared   (pure TS, zero deps)
    package.json
    tsconfig.json
    src/
      theme.ts
      api/              client.ts + role-agnostic endpoint modules
      store/            authStore.ts
      constants/        endpoints, auth rules, validation caps
      types/
      utils/
      components/
      screens/auth/     Splash, PhoneInput, OtpVerify, Register
  app-customer/         standalone RN app, complete node_modules
    package.json        "@org/shared": "file:../shared"
    metro.config.js     <- the interesting file
    tsconfig.json       <- must mirror metro.config.js
  app-provider/         standalone RN app, complete node_modules
    package.json        "@org/shared": "file:../shared"
    metro.config.js
    tsconfig.json
```

## Neither app is a workspace member

This is the decision people get wrong first, including us. The obvious move is to put all three packages in `workspaces` and let npm hoist. Do not.

npm hoisting lifts shared dependencies to `repo-root/node_modules` and leaves behind, in each workspace member's own `node_modules`, whatever it decided not to hoist. For a backend or a Next.js app that is fine. Here is what it did to the one RN app we made a workspace member:

```text
Plugin [id: 'com.facebook.react.settings'] was not found
```

That is a plugin resolution failure at **configure time**. `com.facebook.react.settings` is applied in `android/settings.gradle`, the first file Gradle evaluates, so the build was dead in about a second and no task ever ran.

The cause is not the one the phrase "hoisted to the root" suggests. Gradle's composite build reaches for `../node_modules/@react-native/gradle-plugin`, relative to the app's `android/` folder, and **that path was correct**. The problem was what was sitting at it. The workspace install had left a partial, nine-file copy of `@react-native/gradle-plugin` in the app's own `node_modules`, shadowing the complete one, and the partial copy does not contain the settings plugin. An incomplete package in exactly the right place, not a correct package in the wrong one.

**It did not fail on every install.** The layout was mangled nondeterministically. So if you run a workspace install and your Android build comes up green, you have not disproved this. You got a different hoist layout that time.

How we confirmed it: we took both apps out of `workspaces`, gave each a complete local `node_modules`, regenerated the root lockfile, and both apps then built `assembleRelease` green, installed side by side and booted on a device. That is the fix working plus an inspection of the shadowed directory. It is not a controlled bisect, and we did not try candidate fixes alongside each other.

Only one app ever failed this way, because only one ever had a workspace version to fail. The second app was created in the same commit and was standalone from birth.

If you are arriving from Yarn you will reach for `nohoist`. npm has no such field. Our fallback, which we never needed, was an `.npmrc` or `overrides` layout fix.

So: **only the shared package is a workspace member.** Each RN app is standalone with its own complete, unhoisted `node_modules`, and pulls the shared package in explicitly:

```jsonc
// app-customer/package.json
{
  "dependencies": {
    "@org/shared": "file:../shared",
    "react": "19.2.3",
    "react-native": "0.84.1"
  }
}
```

npm symlinks `shared/` into `app-customer/node_modules/@org/shared`. The symlink is the part that matters for everything in [doc 02](02-metro-duplicate-instances.md): the *source* still physically lives at `repo-root/shared`, outside the app.

## Why the shared package is a workspace member at all

Only so that `npm install` at the root sets up the link and typechecking works from the root. It has no dependencies to hoist, so it costs nothing.

## What goes in `shared/`

The rule we used: **anything where two divergent copies would be a bug, not a feature.**

| Shared | Why |
|---|---|
| API client and interceptors | Two auth-refresh implementations is two bugs |
| Auth store | Literally the same session |
| Endpoint constants | A single `ENDPOINTS` map, so a rename is one edit |
| Types | The server response shape is the server response shape |
| Validation constants mirroring the server | See the drift story in [doc 06](06-governing-shared-code.md) |
| Auth screens | Both apps sign in the same way against the same endpoints |

| App-local | Why |
|---|---|
| Navigation | Different tabs, different gates, different deep links |
| Anything role-specific | The customer app has no concept of a job offer |
| Theme, **if the apps look different** | See [doc 06](06-governing-shared-code.md). This one is a trap |

## The role-picker screen dies

The old single app opened with "I am a customer / I am a provider". Delete it. The app someone installed is the role choice, and each app passes its fixed role into the shared `Register` screen:

```ts
// app-customer
<RegisterScreen role="customer" />
// app-provider
<RegisterScreen role="provider" />
```

Keep a **role mismatch** screen though. A provider will eventually sign into the customer app with their provider account, and the honest response is a terminal screen that says so and offers sign-out, not a half-rendered home tab. We render it from the shared package in both apps.
