# Fridge Chef

An iOS app that turns a photo of your fridge into recipes worth cooking.

Photograph the shelves → Claude reads the ingredients → you correct anything it
got wrong or add what the camera couldn't see → it writes recipes built around
what you actually have, with the shopping list for whatever's missing.

Built with SwiftUI, targeting **iOS 17+**, and following the interaction and
visual language of MealPrepPro Planner & Recipes: a floating tab bar with a
raised camera action, rounded white cards on a warm off-white canvas, a fresh
green accent, macro rings, and a weekly meal planner as the home screen.

## Getting started

1. Open `ios/FridgeChef.xcodeproj` in Xcode 16 or later.
2. Select your development team under **Signing & Capabilities** (the bundle id
   is `com.fridgechef.app` — change it to your own).
3. Run on a device. The camera path needs real hardware; in the simulator use
   **From library** instead.
4. On first launch go to **Profile → Anthropic API key** and paste a key from
   [console.anthropic.com](https://console.anthropic.com). Scanning and recipe
   generation both need it.

> **Before shipping this**: the key is stored in the iOS keychain, but it still
> lives on the device and is sent straight to Anthropic from the app. For a
> public release, put a small backend in front of the API and point
> `AnthropicConfiguration.baseURL` at it, so no user ever holds your key.

## What's in the app

| Tab | What it does |
| --- | --- |
| **Plan** | Weekly planner with breakfast/lunch/dinner/snack slots, per-day macro rings against your goals, and a "use these up" nudge for anything about to go off. |
| **Recipes** | Generate a batch from your pantry (meal, servings, time budget, cravings, strict-pantry mode), browse and save results, and open the full recipe. |
| **Scan** (centre button) | Up to four photos of the fridge, freezer or cupboard, read in one call. Every detection is reviewed by you before it reaches the pantry. |
| **Pantry** | Everything you have, grouped by aisle, with quantities, use-by dates and manual entry with autocomplete. |
| **Shop** | Missing ingredients from any recipe, grouped by aisle, tickable, and movable straight into the pantry when you get home. |

## How it's put together

```
FridgeChef/
  App/            Entry point, root tab bar, onboarding
  DesignSystem/   Palette, typography, buttons, chips, macro rings, flow layout
  Models/         Ingredient, Recipe, plan, grocery, preferences + matching
  Store/          AppState (@Observable) and the JSON snapshot on disk
  Services/       Anthropic client, fridge vision, recipe generation, keychain
  Data/           Ingredient catalogue and sample content for previews
  Features/       Scan · Pantry · Recipes · Plan · Grocery · Profile
```

**State** lives in a single `@Observable AppState` injected through the SwiftUI
environment and persisted to one debounced JSON document in Application
Support. Nothing leaves the device except the photos you choose to scan.

**The Claude calls** go through `AnthropicClient`, a thin URLSession wrapper
over `POST /v1/messages` (there is no official Swift SDK). Both calls use
`output_config.format` with a JSON Schema, so the reply is always valid JSON in
the shape the app expects, and the system prompt carries a cache breakpoint.

- `FridgeVisionService` sends the compressed photos plus a prompt that asks for
  only what is actually visible, with a confidence per item. Anything under 0.6
  arrives unticked.
- `RecipeService` sends the pantry grouped by aisle, expiring items first, plus
  your diet, allergies, time budget and how much shopping you'll tolerate.

**Ingredient matching** (`IngredientMatcher`) is deliberately forgiving about
plurals, casing and descriptive words, so "2 ripe avocados, sliced" in a recipe
matches "Avocado" in your pantry.

Model defaults to `claude-opus-5`; Sonnet 5 and Haiku 4.5 are selectable in
Profile.
