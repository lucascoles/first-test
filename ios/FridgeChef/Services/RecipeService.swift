import Foundation

/// Describes one "cook something for me" request.
struct RecipeRequest {
    var mealType: MealType = .dinner
    var servings: Int = 2
    var maxMinutes: Int = 45
    var recipeCount: Int = 4
    /// Free text from the user: "something spicy", "using up the spinach".
    var craving: String = ""
    var strictPantryOnly: Bool = false
    var allowedMissingItems: Int = 3
}

/// Generates recipes from whatever is currently in the pantry.
struct RecipeService {
    let client: AnthropicClient

    private static let systemPrompt = """
    You are a head chef who writes recipes people actually want to cook tonight, built around the \
    ingredients someone already has at home.

    Non-negotiables:
    - Build every recipe around the user's pantry list. Do not invent pantry items.
    - Respect diets and allergies absolutely. An allergen must not appear anywhere in a recipe, \
    including garnishes, and there is no "or substitute" hedge — just do not use it.
    - Stay inside the stated time budget, counting prep and cooking together.
    - Mark an ingredient `is_staple: true` only for things nearly every kitchen has: salt, pepper, \
    water, cooking oil, plain flour, sugar.
    - Every recipe must be genuinely different from the others in the batch: different protein, \
    technique or cuisine — not the same dish with a swapped herb.

    Writing style:
    - Titles read like a good restaurant menu, not a search result: "Charred Lemon Chicken with \
    Garlic Butter Orzo", never "Chicken and Pasta Recipe".
    - `summary` is one appetising sentence describing how it tastes and eats.
    - Steps are specific and sensory. Give pan temperatures, visual doneness cues and timings. \
    Each step is one action the cook performs; 4-9 steps for most dishes.
    - `chef_tips` are 1-3 short notes: make-ahead, swaps, or the one thing that goes wrong.
    - Nutrition is a good-faith per-serving estimate.
    - hero_symbol must be one of the listed SF Symbol names, chosen to suit the dish.
    """

    private static let nutritionSchema: [String: Any] = JSONSchema.object(
        properties: [
            "calories": JSONSchema.number,
            "protein_grams": JSONSchema.number,
            "carbs_grams": JSONSchema.number,
            "fat_grams": JSONSchema.number,
            "fiber_grams": JSONSchema.number
        ],
        required: ["calories", "protein_grams", "carbs_grams", "fat_grams", "fiber_grams"]
    )

    private static let ingredientSchema: [String: Any] = JSONSchema.object(
        properties: [
            "name": JSONSchema.string(),
            "amount": JSONSchema.string(),
            "note": JSONSchema.string(),
            "is_staple": JSONSchema.boolean
        ],
        required: ["name", "amount", "note", "is_staple"]
    )

    private static let stepSchema: [String: Any] = JSONSchema.object(
        properties: [
            "instruction": JSONSchema.string(),
            "minutes": JSONSchema.integer
        ],
        required: ["instruction", "minutes"]
    )

    private static let recipeSchema: [String: Any] = JSONSchema.object(
        properties: [
            "title": JSONSchema.string(),
            "summary": JSONSchema.string(),
            "cuisine": JSONSchema.string(),
            "meal_type": JSONSchema.string(enumValues: MealType.allCases.map(\.rawValue)),
            "difficulty": JSONSchema.string(enumValues: Difficulty.allCases.map(\.rawValue)),
            "prep_minutes": JSONSchema.integer,
            "cook_minutes": JSONSchema.integer,
            "servings": JSONSchema.integer,
            "hero_symbol": JSONSchema.string(enumValues: Recipe.allowedSymbols.sorted()),
            "tags": JSONSchema.stringArray,
            "nutrition": nutritionSchema,
            "ingredients": JSONSchema.array(of: ingredientSchema),
            "steps": JSONSchema.array(of: stepSchema),
            "chef_tips": JSONSchema.stringArray
        ],
        required: [
            "title", "summary", "cuisine", "meal_type", "difficulty", "prep_minutes",
            "cook_minutes", "servings", "hero_symbol", "tags", "nutrition",
            "ingredients", "steps", "chef_tips"
        ]
    )

    private static let schema: [String: Any] = JSONSchema.object(
        properties: ["recipes": JSONSchema.array(of: recipeSchema)],
        required: ["recipes"]
    )

    func generate(
        request: RecipeRequest,
        pantry: [PantryIngredient],
        preferences: UserPreferences
    ) async throws -> [Recipe] {
        let prompt = Self.buildPrompt(request: request, pantry: pantry, preferences: preferences)

        let payload = try await client.requestDecodable(
            RecipesPayload.self,
            system: Self.systemPrompt,
            content: [.text(prompt)],
            jsonSchema: Self.schema,
            maxTokens: 16000,
            effort: "high"
        )

        return payload.recipes.map { dto in
            Recipe(
                title: dto.title,
                summary: dto.summary,
                cuisine: dto.cuisine,
                mealType: MealType(rawValue: dto.mealType) ?? request.mealType,
                difficulty: Difficulty(rawValue: dto.difficulty) ?? .medium,
                prepMinutes: max(dto.prepMinutes, 0),
                cookMinutes: max(dto.cookMinutes, 0),
                servings: max(dto.servings, 1),
                nutrition: Nutrition(
                    calories: dto.nutrition.calories,
                    proteinGrams: dto.nutrition.proteinGrams,
                    carbsGrams: dto.nutrition.carbsGrams,
                    fatGrams: dto.nutrition.fatGrams,
                    fiberGrams: dto.nutrition.fiberGrams
                ),
                ingredients: dto.ingredients.map {
                    RecipeIngredient(
                        name: $0.name,
                        amount: $0.amount.isEmpty ? nil : $0.amount,
                        note: $0.note.isEmpty ? nil : $0.note,
                        isStaple: $0.isStaple
                    )
                },
                steps: dto.steps.map {
                    RecipeStep(instruction: $0.instruction, minutes: $0.minutes > 0 ? $0.minutes : nil)
                },
                chefTips: dto.chefTips,
                tags: dto.tags,
                heroSymbol: dto.heroSymbol
            )
        }
    }

    // MARK: Prompt

    private static func buildPrompt(
        request: RecipeRequest,
        pantry: [PantryIngredient],
        preferences: UserPreferences
    ) -> String {
        var lines: [String] = []

        lines.append("## What I have")
        if pantry.isEmpty {
            lines.append("(nothing recorded — assume a bare kitchen and keep shopping to a minimum)")
        } else {
            let grouped = Dictionary(grouping: pantry, by: \.category)
            for category in IngredientCategory.allCases.sorted(by: { $0.sortOrder < $1.sortOrder }) {
                guard let items = grouped[category], !items.isEmpty else { continue }
                let rendered = items.map { item -> String in
                    if let quantity = item.displayQuantity { return "\(item.name) (\(quantity))" }
                    return item.name
                }
                lines.append("- \(category.title): \(rendered.joined(separator: ", "))")
            }
        }

        let expiringSoon = pantry.filter {
            if case .soon = $0.expiryState { return true }
            return false
        }
        if !expiringSoon.isEmpty {
            lines.append("")
            lines.append("Use these up first — they go off within two days: " +
                         expiringSoon.map(\.name).joined(separator: ", ") + ".")
        }

        lines.append("")
        lines.append("## What I want")
        lines.append("- \(request.recipeCount) \(request.mealType.rawValue) recipes")
        lines.append("- \(request.servings) serving(s) each")
        lines.append("- Ready in \(request.maxMinutes) minutes or less, prep included")
        lines.append("- Cooking confidence: \(preferences.skill.title)")
        lines.append("- Measurements in \(preferences.units == .metric ? "metric (g, ml, °C)" : "imperial (oz, cups, °F)")")

        if request.strictPantryOnly {
            lines.append("- Use ONLY the ingredients listed above plus basic staples (salt, pepper, oil, water). Shopping is not an option.")
        } else {
            lines.append("- I can buy up to \(request.allowedMissingItems) extra ingredient(s) per recipe. Keep them cheap and easy to find, and make them count.")
        }

        if !preferences.diets.isEmpty {
            lines.append("- Diet: \(preferences.diets.joined(separator: ", "))")
        }
        if !preferences.allergies.isEmpty {
            lines.append("- ALLERGIES (must never appear): \(preferences.allergies.joined(separator: ", "))")
        }
        if !preferences.dislikes.isEmpty {
            lines.append("- Dislikes, avoid if you can: \(preferences.dislikes.joined(separator: ", "))")
        }

        let craving = request.craving.trimmingCharacters(in: .whitespacesAndNewlines)
        if !craving.isEmpty {
            lines.append("")
            lines.append("## Tonight's mood")
            lines.append(craving)
        }

        lines.append("")
        lines.append("Give me \(request.recipeCount) recipes I'd be excited to cook.")

        return lines.joined(separator: "\n")
    }

    // MARK: Wire format

    private struct RecipesPayload: Decodable {
        struct NutritionDTO: Decodable {
            let calories: Double
            let proteinGrams: Double
            let carbsGrams: Double
            let fatGrams: Double
            let fiberGrams: Double
        }

        struct IngredientDTO: Decodable {
            let name: String
            let amount: String
            let note: String
            let isStaple: Bool
        }

        struct StepDTO: Decodable {
            let instruction: String
            let minutes: Int
        }

        struct RecipeDTO: Decodable {
            let title: String
            let summary: String
            let cuisine: String
            let mealType: String
            let difficulty: String
            let prepMinutes: Int
            let cookMinutes: Int
            let servings: Int
            let heroSymbol: String
            let tags: [String]
            let nutrition: NutritionDTO
            let ingredients: [IngredientDTO]
            let steps: [StepDTO]
            let chefTips: [String]
        }

        let recipes: [RecipeDTO]
    }
}
