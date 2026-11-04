# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users
Indian farmers using their own Android phones — including low-end devices — in the field and at home. They check what needs doing on their farms today, ask farming questions by text or voice, scan diseased leaves, and follow mandi prices and government schemes. Many prefer Hindi (the app supports nine Indian languages) and some prefer listening over reading.

## Product Purpose
FasalSaarthi Mobile is the native companion to the FasalSaarthi web app: a farmer's daily operating tool that tells them what matters now on their own farms (health, weather, tasks, alerts), answers questions grounded in their farm data, and works under poor connectivity. Success is a farmer acting on the right advice for the right field at the right time.

## Positioning
Advice is grounded in the farmer's own registered farms, crops, growth stages, location, live weather, official IMD/SDMA warnings and handbook knowledge — not generic agricultural content. AI is the engine, not the product's identity.

## Operating Context
- Used outdoors in the field and at home; connectivity is often weak or intermittent.
- Same Supabase project and backend (`EXPO_PUBLIC_API_BASE_URL`, the FasalSaarthi web app's API routes) as the website.
- Core features: Today/Home, Hub (main menu), Assistant (text + voice), leaf Scan, Market, Crops, Expenses, Schemes, Store locator, Soil, News, Alerts, Learn, Settings, Language.
- "Call me" voice briefing card on Today (calls the farmer's phone via a separate call server, `EXPO_PUBLIC_CALLBOT_URL`).

## Capabilities and Constraints
- Expo SDK 57, React Native 0.86, expo-router, react-native-reanimated 4; Android release builds via Gradle (`--max-workers=2`, Node heap 4 GB) on a laptop with limited RAM — each build is ~8 minutes, so changes should be batched.
- Owner's design specification: `docs/DESIGN_SPEC_V1.md` (binding).
- Contributor works in a fork (`Aarav241020/agent-farmer-mobile`); changes go to the owner by pull request.

## Brand Commitments
- From `docs/DESIGN_SPEC_V1.md`: "Do not replace this visual identity" — warm ivory background, deep forest green primary, sage supporting surfaces, mustard agricultural accent, rounded cards, quiet typography, minimal decoration, bottom navigation.
- Name: FasalSaarthi. Voice: simple language, trust over hype, no AI-heavy terminology.

## Evidence on Hand
- Owner's spec: `docs/DESIGN_SPEC_V1.md`.
- No real user testimonials, usage statistics or field-study data are on hand; do not fabricate them.

## Product Principles
- Action first: show what matters now, with details on demand.
- Farm context everywhere: every recommendation names the farm, crop or field it applies to.
- Trust over hype: explain important recommendations; AI stays in the background.
- Works in the field: offline resilience, native mobile behaviour, simple language.
- Consistency: shared components, no screen-specific visual inventions.

## Accessibility & Inclusion
- Accessible touch targets usable in real field conditions (spec requirement).
- Nine-language UI, with Hindi a primary language; voice input and spoken output for farmers who prefer listening.
- Must run acceptably on low-end Android phones.
