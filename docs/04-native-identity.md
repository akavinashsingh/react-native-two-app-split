# 04. Native identity

The JS side is one problem. The native side is a different one: you now have two *products*, and every per-app identity has to be duplicated and kept distinct.

## Android

```groovy
// app-customer/android/app/build.gradle
android {
    namespace "com.example.app"          // generated R / BuildConfig package
    defaultConfig {
        applicationId "com.example.app"  // store identity
        versionCode 6
        versionName "2.3"
    }
}

// app-provider/android/app/build.gradle
android {
    namespace "com.example.app"           // may stay identical
    defaultConfig {
        applicationId "com.example.app.partner"   // MUST differ
        versionCode 12
        versionName "1.9"
    }
}
```

`applicationId` is what the Play Store and the device use as identity, so it must differ or the second app overwrites the first on install. `namespace` only sets the Java package for generated `R` and `BuildConfig`, and since the two apps are never compiled into one binary, leaving it identical is harmless and saves you rewriting import statements across the app you forked from. We left ours identical deliberately. Write that down somewhere, because it looks like a copy-paste mistake for years afterwards.

**Version numbers drift independently.** The two apps ship on their own cadence, so the customer app being at 2.3 while the provider app is at 1.9 is normal, not a mistake to reconcile.

## The version sites problem

Count how many places a version number lives before your first release. In our tree it was four, and we shipped a release that got it wrong:

1. `android/app/build.gradle` `versionCode`
2. `android/app/build.gradle` `versionName`
3. An in-app constant rendered on a settings screen
4. iOS `MARKETING_VERSION`, **in both Debug and Release build configurations**

Miss number 4 and Xcode reports a version that disagrees with what you told the store. Miss number 3 and support gets a screenshot from a user whose app claims to be a version you never shipped. There are now two apps, so there are eight sites. Script the bump or put a checklist in your release doc.

## Firebase

Each `applicationId` needs its own Firebase app inside the same Firebase project, and therefore its own config file:

- `app-customer/android/app/google-services.json`
- `app-provider/android/app/google-services.json`
- `app-customer/ios/<Target>/GoogleService-Info.plist`
- `app-provider/ios/<Target>/GoogleService-Info.plist`

On iOS the plist must be in **Copy Bundle Resources**, not merely present in the folder. A plist that is in the repo but not in the build phase produces a runtime failure at `FirebaseApp.configure()` that reads like a missing file, because it is one.

## Signing

Two upload keystores, or one keystore with two aliases. Either is fine. What is not fine is the failure mode: **a missing release keystore does not fail the build.** The Gradle config falls back to the debug signing config, produces an APK that installs and runs perfectly on your desk, and is rejected by the store, or worse, is accepted into a track where it can never be updated because the signing key is wrong. Assert on it:

```groovy
signingConfigs {
    release {
        if (!project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
            throw new GradleException('Release keystore missing. Refusing to sign with debug key.')
        }
        // ...
    }
}
```

Release keystores are irreplaceable. Lose one and that `applicationId` can never be updated again.

## Google Maps

If you use the Maps SDK with an API key restricted to Android apps, the restriction is a list of `(package name, SHA-1)` pairs. **Two apps means at least four rows**: debug and release certificate fingerprints for each package. Miss one and maps render as a blank grey rectangle with no error dialog, typically discovered on the release build the day you submit.

The same trap exists on iOS Maps if you use Google's SDK there. We moved iOS to Apple Maps, which sidesteps the key entirely.

## iOS

Two bundle identifiers, two App Store Connect records, two provisioning profile sets. If you use `fastlane match`, each app needs its own entry. Things that are configured **per developer account** rather than per app, and therefore only need doing once, include the APNs auth key. Things that are per bundle id, and therefore need doing twice, include App IDs, capabilities such as Push, and privacy manifests.

**`PrivacyInfo.xcprivacy` is per app and is not copyable between them.** The declared data types have to match what that specific app actually collects. Ours legitimately differed (one app takes payments, the other takes location), and copying one into the other would have swapped one inaccurate declaration for a different inaccurate declaration.

## Two store listings, two review accounts

Reviewers need a working login for each app. A provider-role account in a marketplace app usually cannot do anything until an admin approves it, so hand the reviewer a pre-approved account and say so in the review notes. Otherwise the reviewer signs in, sees an empty dashboard, and rejects for broken functionality.

If your provider app dispatches real work to real people, make sure the reviewer's test account cannot dispatch to a real one. We kept a parked test provider on a test service area for exactly this.
