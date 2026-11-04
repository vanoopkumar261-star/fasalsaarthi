# FasalSaarthi — AI Crop-Care Companion

A cross-platform mobile application (Android, built with Expo / React Native) that
gives a farmer direct, on-device crop-care assistance — in nine Indian languages,
with a built-in AI text assistant and an always-on conversational voice agent.

FasalSaarthi turns raw field inputs — a leaf photo, a soil-pH reading, the weather
and the farmer's own field data — into explainable, field-specific decisions: what
is wrong with this crop, how to correct this soil, how much to irrigate today, and
what to do on the field this morning.

## Features

- **Onboarding** — a guided registration wizard (profile, membership plan, farms,
  crops) with a map-based location picker and a voice-driven interview option.
- **My Farms** — the farmer's fields and crop cycles, with stage and harvest tracking,
  and a crop-feasibility check that refuses crops a field cannot grow.
- **Scan Leaf** — crop-disease detection from a leaf photo (hybrid CNN + vision model).
- **Soil** — soil-pH capture and correction advice, with crop-fit guidance.
- **Irrigation** — an FAO-56 water-balance plan: whether to water, how much, how long.
- **Today** — the home dashboard: tasks, weather, farm-health score and alerts.
- **AI assistant** — a text chat assistant grounded in the farmer's own data.
- **Voice agent** — an always-on conversational agent (speech-to-text, tool calling,
  text-to-speech) that can navigate, read screens aloud, log a soil reading, scan a
  leaf and answer questions hands-free, in nine languages.

## Technology

- Expo SDK 57, React Native 0.86, React 19, expo-router, TypeScript (strict).
- Supabase for authentication and per-farmer data (row-level security).
- Server-mediated AI (Groq) via a web API; speech via on-device, self-hosted and
  cloud (NVIDIA) tiers.
- Maps via MapLibre; charts via react-native-svg.

## Build & run

Requires Node 20+ and the Android SDK (a custom dev build — Expo Go cannot run the
native modules this app uses).

```bash
npm install
# configure .env.local (the EXPO_PUBLIC_* variables)
npx expo run:android      # build and launch on an emulator or device
```

Type-checking: `npx tsc --noEmit`. Lint: `npx expo lint`.

## Backend

The app connects to a hosted Supabase project and a web API (`EXPO_PUBLIC_API_BASE_URL`)
for AI features. These backend services are shared infrastructure and are not part of
this work.

## Copyright

Copyright (c) 2026 Anoopkumar V, Aarav Patel, Manan Agrawal. All rights reserved.
See `LICENSE`.
