# FasalSaarthi Mobile — V1 Design & UX Requirements

Document type: Production design specification
Product: FasalSaarthi Mobile
Scope: Native mobile application V1
Design basis: Current FasalSaarthi mobile MVP screens and product
plan supplied in the conversation
Primary goal: Evolve the current MVP from a polished prototype into
a professional, trustworthy, farmer-first daily operating tool.

## 1. Executive Design Direction

### 1.1 Product principle

FasalSaarthi should feel like:

A farmer's daily operating tool — not an AI demo, analytics
dashboard, or generic agricultural portal.

The current visual foundation is strong:

- Warm ivory background
- Deep forest green primary colour
- Sage supporting surfaces
- Mustard as an agricultural accent
- Rounded cards
- Quiet typography
- Minimal decorative UI
- Bottom navigation
- Clear mobile-first information hierarchy

Do not replace this visual identity.

The next iteration should improve the product's usability, trust,
information architecture, and real-world field workflow rather than
simply adding more visual decoration.

## 2. Design Goals

Every screen must satisfy at least one of these principles:

- Action first — tell the farmer what matters now.
- Farm context everywhere — recommendations must identify the
  farm/crop/field they apply to.
- Explain important recommendations — farmers should understand
  why the system recommends something.
- Trust over hype — AI is the engine, not the product's visual
  identity.
- Offline resilience — poor connectivity must not make the app
  unusable.
- Simple language — avoid technical or unnecessarily AI-heavy
  terminology.
- Native interaction — use native mobile behaviour for camera,
  keyboard, permissions, sheets, dates, etc.
- Consistent components — no screen-specific visual inventions
  unless genuinely necessary.
- Accessible touch targets — the application must be usable in
  real field conditions.
- Progressive disclosure — show the most important information
  first and details on demand.

## 3. Current Product Architecture

The current V1 navigation is:

- Home
- Scan
- Market
- Assistant
- More

The More section currently contains:

- Crops
- Expenses
- Schemes
- Store Locator
- Settings

Current V1 scope includes:

- Authentication
- Home (Weather, Farm health, Today's tasks, Alerts)
- Market
- Crop disease scanning
- AI/text assistant
- Crops
- Expenses
- Government schemes
- Settings
- 9-language UI

Current V1 intentionally excludes:

- Voice mode
- Store Locator / Transport Planner as a full native feature
- New-farmer onboarding wizard
- Marketing pages
- 3D farm visuals
- Decorative motion
- Native charts

These exclusions should remain unless there is a strong product reason
to reintroduce them.

## 4. Non-Negotiable Information Architecture

### 4.1 Farm must become a first-class product concept

The current MVP has farm information, but the mobile product should make
the relationship explicit:

```
User
 └── Farm
      └── Field / Plot
           └── Crop
                └── Crop stage
                     └── Tasks / Recommendations / Scans / Yield
```

Every important piece of information should be traceable to:

- Farm
- Field, where applicable
- Crop
- Crop stage
- Date/time

Avoid generic recommendations such as: "Apply irrigation."

Prefer: "Apply irrigation — Farm 1" or "Irrigate Wheat — North Field"

This becomes essential when a farmer manages multiple farms or crops.

## 5. Farm Selector

### 5.1 Required component

Create a reusable `FarmSelector`.

Suggested display:

```
FARM 1
Wheat · 2.5 acres · Jaipur
⌄
```

Opening the selector:

```
Farm 1
Wheat · 2.5 acres

Farm 2
Mustard · 4 acres

Farm 3
Rice · 3 acres

+ Add farm
```

### 5.2 Behaviour

- Remember the farmer's last selected farm.
- Clearly show the active farm.
- Switching farms must update all farm-dependent information.
- Never silently display information from another farm.
- If a screen contains mixed-farm information, explicitly label each
  farm.

### 5.3 Required future-ready architecture

The component must support:

- Multiple farms
- Multiple fields per farm
- Multiple crops
- Different crop stages
- Different irrigation systems
- Different soil information

Do not hard-code Farm 1.

## 6. Home Screen

### 6.1 Home is the most important screen

The Home screen is the farmer's daily opening screen.

The first question it should answer is: "What do I need to know or do today?"

Recommended hierarchy:

1. Greeting
2. Farm context
3. Weather
4. Farm health
5. Today's tasks
6. Important alerts
7. Quick actions
8. Market snapshot

### 6.2 Header

Recommended:

```
Good morning, Ramesh
Farm 1 · Wheat · 2.5 acres
```

Do not make the greeting excessively large. The farm context should
remain visible.

## 7. Weather Card

Current weather card is directionally correct.

Upgrade it to include:

- Temperature
- Condition
- Rain probability
- Relevant forecast window
- Data freshness

Example:

```
WEATHER · LIVE

☁ 26°C
Light rain expected

72% chance of rain
Updated 8 min ago
```

Do not overload this card with a full weather forecast. The Home
screen only needs the information that affects today's farm decisions.

## 8. Farm Health

Current: `82` / `Good`

Keep this simple.

Recommended:

```
FARM HEALTH

82 / 100       Good
████████████░░

Based on current crop,
weather and farm conditions.

[ View details ]
```

Important:

- Do not imply that a single score is an objective scientific
  measurement unless the backend actually supports it.
- If the score is model-derived, provide an explanation.
- Use "Why?" or "View details".

## 9. Today's Tasks — P0

This is one of the most important redesigns.

The current checklist concept is correct but must become more realistic
and contextual.

### 9.1 Task model

Each task should contain: Task, Farm, Crop, Reason, Timing, Status,
Completion timestamp.

Example:

```
○ Irrigate Wheat — Farm 1

Recommended today · 6:00–8:00 AM

Soil moisture: 31%
Rain expected: 8 hrs
```

Completed state:

```
✓ Irrigate Wheat — Farm 1

Completed 7:42 AM
```

### 9.2 Checklist behaviour

- Large tappable checkbox.
- Entire task row may be tappable.
- Tap checkbox = mark complete.
- Completed tasks become visually muted but remain accessible.
- Completion timestamp should be stored.
- Undo should be available briefly after completion.
- Completion should sync when connectivity returns.

### 9.3 Task count

Example: `TODAY · 2 OF 4 DONE`

Do not show tasks without enough context to act on them.

Bad: "Inspect crop."
Good: "Inspect Wheat for pests — Farm 1."

## 10. Task Priority

Tasks should support priority: Recommended, Important, Urgent.

Do not overuse red. Use red only when there is a genuine risk.

Example:

```
URGENT
Check tomato leaves — Farm 2

Disease risk increased after recent rainfall.
```

## 11. Recommendation Explanation

Every consequential recommendation should provide a "Why?" interaction.

Example:

```
WHY THIS RECOMMENDATION?

• Soil moisture is below 35%
• No significant rainfall expected
• Wheat is currently flowering
• Last irrigation was 3 days ago
```

This is a core trust mechanism. Do not force the farmer to understand
an AI model. Explain the decision in plain agricultural language.

## 12. Quick Actions

Recommended Home quick actions:

```
[ Scan Crop ] [ Ask Assistant ] [ Market ] [ My Farms ]
```

Use a maximum of four prominent actions. Do not turn Home into a grid
of every feature in the application.

## 13. Market Snapshot

Home may show a compact market snapshot:

```
MARKET

Wheat      ₹2,340 ↑
Mustard    ₹5,120 ↓
Gram       ₹4,860 ↑

[ View market ]
```

Do not duplicate the entire Market screen.

## 14. Scan Screen — P0

The Scan screen should make the camera action immediately obvious.

Recommended hierarchy:

```
DISEASE SCANNER

Scan your crop

┌─────────────────────┐
│                     │
│       CAMERA        │
│                     │
│  Position leaf here │
│                     │
└─────────────────────┘

[ Take photo ]

Upload from gallery
```

## 15. Scan Permissions

Permission requests must explain why they are required.

Example:

```
Camera access

FasalSaarthi uses your camera to
analyze crop images for possible
disease symptoms.

[ Continue ]
```

Do not request camera/gallery permissions before the user reaches the
relevant action.

## 16. Scan Result Hierarchy

Current result: `96% confidence` / `Tomato · Late blight`

Production hierarchy should be:

```
TOMATO

Late blight

HIGH RISK

What to do now

1. Remove affected leaves
2. Avoid overhead irrigation
3. Improve airflow

Confidence: 96%
```

The farmer should see: What is wrong? How serious is it? What should
I do? How confident is the model?

Confidence should not visually dominate the diagnosis.

## 17. Scan Result Safety

Disease detection is consequential.

The UI must distinguish: Detection, Confidence, Recommendation.

Avoid presenting model output as guaranteed diagnosis.

Recommended language: "Possible late blight detected."
Rather than: "You have late blight."

If the backend has a safety/uncertainty threshold, surface it
appropriately.

## 18. Recent Scans

Keep scan history.

Each item:

```
Wheat · Healthy
2 days ago

Rice · Leaf spot
6 days ago
```

Tapping a scan should open its historical result.

## 19. Market Screen — P1

Current market screen is strong visually. Improve information depth
without making it crowded.

Each crop should support:

```
WHEAT

₹2,340 / quintal
↑ ₹85 this week

Jaipur Mandi
Updated 18 min ago

Demand
HIGH

Trend
↑ Rising

[ Sell ] [ Hold ]
```

## 20. Data Freshness

Market data must explicitly communicate freshness.

Use: `● Live · Updated 18 min ago` or `Estimated · Updated yesterday`

Never make estimated data visually indistinguishable from live data.
This is particularly important because market information may affect
financial decisions.

## 21. Market Insight

Avoid making the product feel AI-driven.

Instead of "AI ADVICE" prefer "MARKET INSIGHT".

Example:

```
MARKET INSIGHT

Wheat is 6% above the weekly average.

This may be a favourable selling window.
```

If the insight is model-generated, it may include a small secondary
label such as "FasalSaarthi recommendation". The decision should
remain the hero.

## 22. Assistant — P1

The current Assistant is good but begins with an intimidating blank
chat. Use contextual prompt cards.

Example:

```
WHAT DO YOU NEED HELP WITH?

[ My crop ] What's happening with my crop?
[ Irrigation ] Should I irrigate today?
[ Market ] Should I sell now?
[ Weather ] Will it rain this week?
```

Then open the conversation.

## 23. Assistant Must Understand Context

The Assistant should use the user's farm profile when the backend
supports it.

Example:

> User: Should I irrigate?
>
> Assistant: Your Farm 1 wheat is currently in the flowering stage.
> Soil moisture is 31% and no significant rainfall is expected in the
> next 12 hours. Irrigation is recommended today.

This is substantially better than a generic chatbot.

## 24. Assistant Conversation UI

Support: Farmer messages, Assistant messages, Suggested follow-up
prompts, Loading state, Error state, Retry, Conversation history where
appropriate.

Do not make every response a giant paragraph. Use: short answer, key
reason, recommended action.

## 25. More Screen

Current structure is functionally correct but can be organized better.

Recommended:

```
MORE

FARM
🌾 Crops
💰 Expenses
🏛 Government Schemes

SERVICES
📍 Store Locator
📄 Documents

ACCOUNT
⚙ Settings
👤 Profile
```

Keep Store Locator visibly marked as unavailable/coming soon if it is
not implemented. Never create a dead navigation item.

## 26. Crop Detail — P1

Current Crop Detail screen: `Flowering · Day 58 of 120`, `Harvest in
62 days`, Estimated yield, Field details.

Keep this foundation. Add a visual crop timeline:

```
Seed        ✓
Vegetative  ✓
Flowering   ● NOW
Grain filling ○
Harvest     ○
```

## 27. Crop Detail — Current Condition

Recommended:

```
CURRENT CONDITION

Crop stage       Flowering
Soil moisture    42%
Temperature      27°C
Rain forecast    12 mm
Disease risk     Low
```

Only display measurements that the backend actually provides. Do not
fabricate sensor data.

## 28. Crop Detail — Next Action

Add:

```
NEXT IMPORTANT ACTION

Irrigation recommended
within 24–48 hours.

[ View recommendation ]
```

This connects crop information to action.

## 29. Harvest Information

Harvest should use the estimated harvest date supplied by the user's
farm/crop data.

Show:

```
HARVEST

In 62 days
Estimated: 20 Oct 2026

Estimated yield:
2.5 tonnes
```

If the estimate is model-derived, clearly label it as estimated.

## 30. Multi-Farm Harvest Logic

If the farmer has multiple farms:

```
UPCOMING HARVEST

Farm 1 · Wheat
62 days · Est. 20 Oct

Farm 2 · Mustard
79 days · Est. 6 Nov

Farm 3 · Rice
94 days · Est. 21 Nov
```

Never duplicate Farm 1 simply because the UI currently has one data
object. The number of harvest entries should correspond to the actual
number of configured farms/crops.

## 31. Offline-First Design — P0

This is mandatory for a serious field application. The app should
remain useful when connectivity is poor.

Offline-capable data, where technically possible:

- Farm profile
- Crop details
- Saved tasks
- Previously loaded weather
- Previously loaded market data
- Previous scan history
- Assistant conversation history
- Settings

Actions such as completing tasks should be locally recorded and synced
later where supported.

## 32. Sync Status

Add a subtle global status where appropriate:

`✓ Synced 2 min ago`

Other states: `↻ Syncing...`, `⚠ 3 changes waiting to sync`

Do not interrupt the farmer with repeated modal errors.

## 33. Offline State

Use a useful message:

```
YOU'RE OFFLINE

Your saved farm information is still
available.

Last synced · 10:42 AM

[ Retry connection ]
```

Avoid: "Something went wrong."

## 34. Loading States

Every data-dependent screen needs a skeleton state. Required for: Home,
Weather, Market, Farm health, Crop details, Schemes, Scan result,
Assistant.

Avoid unnecessary full-screen spinners.

## 35. Empty States

Examples:

**No farms**
```
NO FARMS YET

Add your first farm to start receiving
crop recommendations and tasks.

[ Add farm ]
```

**No scan history**
```
NO SCANS YET

Scan a crop leaf to check for possible
disease symptoms.

[ Scan crop ]
```

**No tasks**
```
YOU'RE ALL CAUGHT UP

No important tasks for today.
```

Empty states should always tell the farmer what to do next.

## 36. Error States

Errors must be human-readable.

Bad: "API Error 500."

Good:
```
We couldn't load today's market prices.

Your last saved prices are still available.

[ Try again ]
```

For network issues, explain whether local data is still usable.

## 37. Notifications

Notifications should be action-oriented.

Good: "Rain expected in 4 hours. Irrigation may not be necessary today."
Bad: "New weather notification."

Possible notification categories: Task reminder, Weather risk, Crop
risk, Market movement, Harvest reminder, Scheme deadline.

Avoid notification spam.

## 38. AI Language Policy

FasalSaarthi should not constantly advertise AI.

Avoid excessive labels: "AI Health", "AI Advice", "AI Recommendation",
"AI Matching", "AI Everything".

Preferred language: "Farm Health", "Market Insight", "Crop
Recommendation", "Scheme Match", "Assistant".

AI can be disclosed where useful, but it should remain behind the
experience.

## 39. Trust & Explainability

Recommendations should support: Recommendation, Why, Data used, Last
updated.

Example:

```
IRRIGATION RECOMMENDED

Why?
• Soil moisture is low
• Crop is flowering
• Rain probability is low

Data updated 12 min ago

[ View details ]
```

This creates trust without exposing technical model internals.

## 40. Visual Design System

### 40.1 Colour roles

- Primary: Deep Forest Green `#24583A`
- Background: Warm Ivory `#F7F6EF`
- Surface: White `#FFFFFF`
- Supporting: Sage `#E8F0E3`
- Accent: Mustard `#D7A928`
- Use a restrained red for danger and disease states.
- Use blue for weather/information states only when semantically useful.

> Note: these hex values are close to but not identical to the
> existing mobile `colors.ts` (`primary #284D35`, `bg #F7F6F0`, `sage
> #E9EDE3`, `amber #D6A72C`). Reconcile deliberately rather than
> silently drifting the palette — see §1.1: do not replace the visual
> identity.

## 41. Colour Rules

- Forest green: Primary CTA, Active navigation, Important headings,
  Positive farm states.
- Sage: Supporting backgrounds, Secondary surfaces, Positive context.
- Mustard: Crop-stage emphasis, Market movement, Important but
  non-dangerous attention.
- Red: Disease risk, Critical warnings, Destructive actions.
- Blue: Weather, Informational states.

Do not use colour as the only way to communicate status.

## 42. Typography

Maintain a clean modern sans-serif.

- Display / Page title: 28–32 px
- Section title: 20–24 px
- Card title: 16–18 px
- Body: 14–16 px
- Secondary: 12–14 px
- Metadata: 11–12 px

Avoid excessive uppercase text. Use uppercase mainly for small metadata
labels, e.g. "FARM HEALTH" then "82 / 100". Do not make every label
stylized.

## 43. Spacing System

Use a consistent spacing scale: `4 8 12 16 24 32 40 48`

- Screen horizontal padding: 20–24 px
- Card internal padding: 16–20 px
- Section spacing: 24–32 px
- Touch target: minimum 44 × 44 px

## 44. Border Radius

- Small controls: 8 px
- Cards: 12–16 px
- Large surfaces: 20–24 px
- Pills: full radius

Do not make every element excessively rounded.

## 45. Cards

The current card system is visually attractive but risks becoming
repetitive.

Reduce "card inside card inside card". Use: borderless sections,
dividers, inline metrics, subtle backgrounds, full-width action rows.

Cards should communicate grouping, not simply decorate the screen.

## 46. Buttons

- Primary: Forest green fill, White text.
- Secondary: Transparent / ivory, Forest border or subtle surface.
- Destructive: Reserved danger treatment.

Don't create too many button styles.

## 47. Bottom Navigation

Keep: Home, Scan, Market, Assistant, More.

The active item should have both icon state and visual selected state.
Do not rely on colour alone. Navigation labels must remain visible.

## 48. Native Mobile Behaviour

Use native behaviour for: Camera, Gallery, Keyboard, Date/time picker,
Permissions, Bottom sheets, Share actions, System back, Haptics where
appropriate, Accessibility, Safe areas.

Do not imitate iOS/Android system UI unnecessarily.

## 49. Accessibility

Required:

- Minimum 44 × 44 px touch targets
- Strong text contrast
- Support dynamic text scaling where possible
- Icons should not be the only indicator
- Labels should remain understandable when translated
- Avoid tiny metadata text
- Do not rely only on green/red status

## 50. Nine-Language Support

The current product plan supports nine languages. The UI must
therefore be designed for variable string length.

Rules: Never hard-code text widths. Allow buttons to grow. Avoid
fixed-height text containers. Support wrapping where appropriate. Test
long translated strings. Keep icons independent from text. Avoid
layouts that depend on English word length.

Translation should preserve meaning, not simply perform literal
replacement.

## 51. Data Freshness System

Any dynamic data must have a freshness state. Examples: `Live ·
Updated 8 min ago`, `Estimated · Updated yesterday`, `Last synced ·
10:42 AM`, `Offline · Showing saved data`.

This should become a reusable component: `FreshnessBadge`.

## 52. Reusable Component System

Build these as shared components before implementing every screen
independently.

- **Navigation**: BottomNavigation, FarmSelector
- **Buttons**: PrimaryButton, SecondaryButton, IconButton
- **Cards**: MetricCard, TaskCard, InsightCard, CropCard, MarketCard,
  StatusCard
- **Status**: StatusBadge, RiskBadge, FreshnessBadge, SyncStatus
- **Data**: ProgressBar, CropTimeline, Checklist, PriceRow
- **Feedback**: Skeleton, EmptyState, OfflineState, ErrorState,
  Snackbar, BottomSheet

## 53. Interaction Requirements

**Checklist** — Tap checkbox: Incomplete → Complete. Store: completion
status, timestamp, user, farm, crop. Allow undo immediately after
completion.

**Farm Switching** — Switching farms should update: Home context,
Tasks, Crop information, Recommendations, Weather where farm-specific,
Farm health, Market relevance where applicable. Never mix contexts
silently.

**Scan** — Flow: Scan → Camera/Gallery → Image preview → Analyze →
Result → Recommended action → Save to scan history.

**Assistant** — Flow: Assistant → Suggested question → Context-aware
answer → Recommended action → Optional follow-up.

## 54. Microinteractions

Use subtle motion only when it communicates state.

Good: Checkbox completion animation, Progress animation, Pull-to-refresh,
Bottom sheet transition, Farm switching, Scan processing, Sync
indicator.

Avoid: Decorative 3D effects, Excessive floating animations, Constant
background motion, Motion that delays actions.

The previous web application's decorative motion should not
automatically be carried into mobile.

## 55. Security & Privacy UX

The app handles: Farmer profile information, Farm information, Crop
information, Images, Potential location information, Account
credentials, Financial/market-related information.

UX should therefore clearly communicate: Why permissions are required,
What camera/gallery data is used for, When location is needed,
Authentication state, Sign out, Account deletion/settings where
supported.

Never request permissions without contextual explanation.

## 56. Performance

Requirements: Render useful Home content as early as possible. Cache
previously loaded farm data. Lazy-load secondary screens. Compress crop
images before upload where appropriate. Avoid loading unnecessary
images on startup. Avoid large decorative assets. Avoid excessive
animation. Keep bottom navigation instant.

The farmer should not wait for every service before seeing the Home
screen.

## 57. Image Handling

Crop scans are functional data, not decorative media.

Requirements: Preview image before upload. Show upload/progress state.
Handle poor network. Allow retry. Preserve recent scan history. Avoid
unnecessarily large uploads.

## 58. Security Around Scan Uploads

The interface should make clear when an image is: local, uploading,
uploaded, analyzed, failed.

Avoid showing a successful diagnosis before the backend actually
completes analysis.

## 59. Professional UX Writing

Use short, direct agricultural language.

Prefer "Rain expected tonight." instead of "According to the latest
AI-powered meteorological analysis, rainfall is expected..."

Prefer "Irrigate tomorrow morning." instead of "The system recommends
considering irrigation during the upcoming time period."

Keep language human.

## 60. Design Anti-Patterns

Do NOT:

- Add AI labels everywhere.
- Put every feature on Home.
- Add unnecessary gradients.
- Add decorative 3D farm graphics.
- Create a separate card for every tiny metric.
- Use huge headings on operational screens.
- Use tiny metadata text.
- Hide farm context.
- Mix data from different farms.
- Make live and estimated data look identical.
- Use red for ordinary warnings.
- Depend only on colour.
- Build dead navigation routes.
- Show generic API errors.
- Require internet for basic previously loaded farm information.
- Use fake data in production screens.
- Depend only on colour.

## 61. Screen Priority

**P0 — Must improve before production**
- Home
- Today's Tasks
- Farm Selector
- Offline/Sync states
- Loading/Error/Empty states
- Scan flow
- Recommendation explanation
- Multi-farm context

**P1 — Next**
- Crop Detail
- Market
- Assistant
- Notifications
- More information architecture

**P2 — Later**
- Advanced analytics
- Native charts
- Additional animations
- Store Locator
- Voice mode
- New-farmer onboarding

## 62. Recommended Home Final Structure

```
┌──────────────────────────────┐
│ Good morning, Ramesh         │
│ Farm 1 · Wheat · 2.5 acres   │
├──────────────────────────────┤
│ WEATHER · LIVE               │
│ ☁ 26°C                       │
│ Light rain expected          │
│ 72% chance · Updated 8 min   │
├──────────────────────────────┤
│ FARM HEALTH                  │
│ 82 / 100       Good          │
│ █████████████░               │
├──────────────────────────────┤
│ TODAY · 2 OF 4 DONE          │
│ ✓ Inspect wheat               │
│ ○ Irrigate wheat              │
│ ○ Record rainfall             │
│ ○ Check pests                 │
├──────────────────────────────┤
│ QUICK ACTIONS                │
│ [Scan] [Ask] [Market] [Farm] │
├──────────────────────────────┤
│ MARKET SNAPSHOT              │
│ Wheat ₹2,340 ↑               │
│ Mustard ₹5,120 ↓             │
└──────────────────────────────┘
```

This is the target information hierarchy, not a requirement to
reproduce this exact visual arrangement.

## 63. Recommended Design Philosophy

```
DATA → UNDERSTANDING → RECOMMENDATION → ACTION → COMPLETION → HISTORY
```

Example:

```
Soil moisture = 31%
        ↓
Wheat is flowering
        ↓
Irrigation recommended
        ↓
Irrigate Farm 1
        ↓
✓ Completed 7:42 AM
        ↓
Stored in farm activity history
```

This is the core product loop.

## 64. Final Product Standard

Before a screen is considered production-ready, ask:

1. **Context** — Does the farmer know which farm/crop this refers to?
2. **Action** — Does the screen tell the farmer what they can do next?
3. **Trust** — Can the farmer understand why an important
   recommendation was made?
4. **Data** — Is freshness/estimated/live status clear?
5. **Connectivity** — What happens if the farmer is offline?
6. **Feedback** — What happens while data is loading? If it fails? If
   there is no data?
7. **Accessibility** — Can the screen be comfortably tapped? Is
   information understandable without colour alone?
8. **Localization** — Will the layout survive translation into all
   supported languages?
9. **Consistency** — Is the component already part of the design
   system?
10. **Simplicity** — Can anything be removed without reducing
    usefulness?

If the answer to these is yes, the screen is approaching production
quality.

## 65. Definition of Done

A feature is not complete when the happy-path UI works. A
production-ready feature must have:

- ✓ Happy state
- ✓ Loading state
- ✓ Empty state
- ✓ Error state
- ✓ Offline state where relevant
- ✓ Retry behaviour
- ✓ Success feedback
- ✓ Accessibility
- ✓ Localization-safe layout
- ✓ Farm context
- ✓ Data freshness
- ✓ Correct navigation
- ✓ Consistent component usage
- ✓ Backend failure handling
- ✓ No placeholder content

## 66. Final Design North Star

FasalSaarthi should not try to impress farmers with how much technology
it contains. It should impress them by making farming decisions feel
clearer, faster, and more trustworthy.

The ideal experience is:

> Open the app → immediately understand your farm → see what matters
> today → understand why → take action → mark it complete → move on.

That is the design standard for the next version of FasalSaarthi
Mobile.
