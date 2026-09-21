# 06. Governing shared code

The technical split is a week. This part is permanent.

## The one sentence

**A shared package is not a library you maintain. It is two products you ship.**

Before the split, a change to the theme was a change to one app that one team tested and released. After the split, the same edit is a simultaneous release to two apps with different users, different release cadences and different store review queues. Nothing in the tooling tells you this. The file looks like any other file.

## The theme is where this bites first

Our two apps deliberately diverged visually. The customer app got a warm redesign; the provider app kept the older system and was explicitly not to be touched.

The naive move is to edit the shared theme. That ships an unrequested redesign to every provider, mid-release-cycle, with no changelog and no one having asked. Around 49 files in the live provider app read those tokens.

What we did instead:

- The customer app got **its own** theme file, app-local.
- The shared theme stayed exactly as it was, still read by the provider app and by any customer screen not yet migrated.
- The app-local theme **mirrors the shared token shape on purpose**, so migrating a screen is usually a one-line import swap.

It is a mirror, not a superset. Several tokens and component styles exist only in the older shared theme, so a screen using those needs a real port rather than an import swap. Write down which ones, or every migration becomes an investigation.

## Fork presentation, never contracts

The auth screens were forked rather than restyled, because the live provider app mounts the shared ones and we were not willing to re-test it for a visual change it did not want.

**Only the presentation is forked.** Both copies still import the same API module, the same error extractor, the same auth store and the same constants. The request contract has one source of truth.

We know this is the right boundary because we got it wrong first. The initial fork retyped the constants instead of importing them, and drifted immediately:

- it checked two registration error codes the server has never emitted, so the entire session-recovery branch was dead code that could not fire
- it allowed 60-character names against a server cap of 50, so the only way to discover the limit was a rejected submission

Both were caught in review rather than by a test, because a fork that drifts produces code that is *internally* consistent. Nothing is broken until it meets the server.

The rule that came out of it: **anything that has to agree with the server lives in one shared constants module.** Phone format, name length caps, OTP length and resend cooldown, the error code enum and its user-facing copy. If the server changes, one file changes.

## When one app needs a shared component to look different

Two bad options and one good one.

**Restyle the shared component.** Ships a visual change to the live app that did not ask for it, and requires re-testing it.

**Fork the component.** Now one bug lives in two files forever, for the sake of one colour.

**Add an optional prop that defaults to current behaviour.** This is the one:

```tsx
// shared component
<Pressable style={[styles.primary, primaryFill ? { backgroundColor: primaryFill } : null]}>

// app A (the one that needs the change)
<SharedGate primaryFill={theme.colors.fill} />

// app B passes nothing, renders byte-identically, needs no re-test
```

The property that makes it worth the parameter: **the app that did not ask for a change gets no change at all**, provably, so it does not re-enter your test matrix. Use this for every "one app needs different X from a shared component" problem you will have, and you will have several.

## A cheap check that catches the real mistake

The mistake is not writing bad code in the shared package. It is forgetting that the file you edited is a shared build input at all. A path-based pre-commit check answers exactly one question: does this change end up inside one of the shipped apps?

Fail closed. Treat everything under the app and shared folders as a build input unless it is platform-specific to a platform you are not shipping, or is documentation. Our first version enumerated dangerous paths and missed the app entry point, the metro and babel configs, `app.json` and the entire assets folder, which is the predictable outcome of maintaining a list by hand.

A copyable version is in [`scripts/shared-build-input-check.sh`](../scripts/shared-build-input-check.sh).

## Write down which app is live where

Keep one short table in the repo, updated on every release, saying what version of each app is live on each store. It sounds like bookkeeping. It is actually the input to the only question that matters before touching shared code: **if I get this wrong, how many shipped apps does it reach, and is there an unreleased one that can absorb the mistake?**

There is a real difference between "one of these is live and the other is still in review" and "both are live". While one app is unreleased, it absorbs mistakes for free. The day it ships, that cushion is gone, and the docs that still describe the old situation will actively mislead you.
