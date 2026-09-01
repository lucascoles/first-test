import Foundation

/// Hand-written content used for SwiftUI previews and for the "see how it
/// works" path before an API key is entered.
enum SampleData {
    static let pantry: [PantryIngredient] = [
        PantryIngredient(name: "Chicken thighs", quantity: "6", unit: "pcs", category: .protein,
                         expiresOn: Calendar.current.date(byAdding: .day, value: 2, to: Date()), source: .scan),
        PantryIngredient(name: "Cherry tomatoes", quantity: "250", unit: "g", category: .produce, source: .scan),
        PantryIngredient(name: "Spinach", quantity: "1", unit: "bag", category: .produce,
                         expiresOn: Calendar.current.date(byAdding: .day, value: 1, to: Date()), source: .scan),
        PantryIngredient(name: "Greek yoghurt", quantity: "500", unit: "g", category: .dairy, source: .scan),
        PantryIngredient(name: "Feta", quantity: "200", unit: "g", category: .dairy, source: .scan),
        PantryIngredient(name: "Lemon", quantity: "2", category: .produce, source: .scan),
        PantryIngredient(name: "Garlic", quantity: "1", unit: "bulb", category: .produce, isStaple: true, source: .manual),
        PantryIngredient(name: "Orzo", quantity: "500", unit: "g", category: .grains, source: .manual),
        PantryIngredient(name: "Olive oil", category: .pantry, isStaple: true, source: .staple),
        PantryIngredient(name: "Smoked paprika", category: .condiments, isStaple: true, source: .staple),
        PantryIngredient(name: "Eggs", quantity: "8", category: .dairy, source: .scan),
        PantryIngredient(name: "Chickpeas", quantity: "1", unit: "tin", category: .pantry, source: .manual)
    ]

    static let detected: [DetectedIngredient] = [
        DetectedIngredient(name: "Cherry tomatoes", quantity: "250", unit: "g", category: .produce, confidence: 0.94),
        DetectedIngredient(name: "Greek yoghurt", quantity: "1", unit: "tub", category: .dairy, confidence: 0.91),
        DetectedIngredient(name: "Chicken thighs", quantity: "6", unit: "pcs", category: .protein, confidence: 0.88),
        DetectedIngredient(name: "Spinach", quantity: "1", unit: "bag", category: .produce, confidence: 0.82),
        DetectedIngredient(name: "Feta", category: .dairy, confidence: 0.74),
        DetectedIngredient(name: "Spring onion", category: .produce, confidence: 0.52)
    ]

    static var recipes: [Recipe] {
        [
            Recipe(
                title: "Charred Lemon Chicken with Garlic Butter Orzo",
                summary: "Crisp-skinned thighs over silky orzo that drinks up the pan juices, finished with a squeeze of blistered lemon.",
                cuisine: "Mediterranean",
                mealType: .dinner,
                difficulty: .easy,
                prepMinutes: 10,
                cookMinutes: 25,
                servings: 2,
                nutrition: Nutrition(calories: 642, proteinGrams: 44, carbsGrams: 52, fatGrams: 27, fiberGrams: 4),
                ingredients: [
                    RecipeIngredient(name: "Chicken thighs", amount: "4, bone in"),
                    RecipeIngredient(name: "Orzo", amount: "180 g"),
                    RecipeIngredient(name: "Lemon", amount: "1, halved"),
                    RecipeIngredient(name: "Garlic", amount: "4 cloves, sliced"),
                    RecipeIngredient(name: "Spinach", amount: "2 large handfuls"),
                    RecipeIngredient(name: "Butter", amount: "30 g"),
                    RecipeIngredient(name: "Chicken stock", amount: "450 ml"),
                    RecipeIngredient(name: "Olive oil", amount: "1 tbsp", isStaple: true),
                    RecipeIngredient(name: "Salt and pepper", amount: "to taste", isStaple: true)
                ],
                steps: [
                    RecipeStep(instruction: "Pat the thighs bone dry and season hard on both sides. Dry skin is the whole trick — any moisture steams instead of crisps.", minutes: 3),
                    RecipeStep(instruction: "Lay them skin down in a cold, oiled oven-proof pan, then set it over medium heat. Leave them alone for 10 minutes until the skin is deep gold and releases on its own.", minutes: 10),
                    RecipeStep(instruction: "Flip, add the lemon halves cut side down, and cook 4 more minutes. Lift the chicken and lemon out onto a plate.", minutes: 4),
                    RecipeStep(instruction: "Drop the garlic into the rendered fat for 30 seconds, then stir in the orzo so every grain is coated and starts to toast.", minutes: 2),
                    RecipeStep(instruction: "Pour in the stock, sit the chicken back on top, and simmer uncovered until the orzo is just tender and the liquid is a loose sauce.", minutes: 9),
                    RecipeStep(instruction: "Fold the spinach and butter through the orzo off the heat, then squeeze the charred lemon over everything.", minutes: 2)
                ],
                chefTips: [
                    "Starting the pan cold renders the fat slowly and gives you the crispest skin.",
                    "The orzo keeps drinking liquid as it sits — pull it a splash looser than you think."
                ],
                tags: ["One pan", "High protein"],
                heroSymbol: "bird"
            ),
            Recipe(
                title: "Whipped Feta Bowls with Blistered Tomatoes",
                summary: "Cloud-light feta under tomatoes that burst into their own sweet-sour dressing — ten minutes, no cooking skill required.",
                cuisine: "Greek",
                mealType: .lunch,
                difficulty: .easy,
                prepMinutes: 5,
                cookMinutes: 8,
                servings: 2,
                nutrition: Nutrition(calories: 418, proteinGrams: 19, carbsGrams: 22, fatGrams: 29, fiberGrams: 3),
                ingredients: [
                    RecipeIngredient(name: "Feta", amount: "200 g"),
                    RecipeIngredient(name: "Greek yoghurt", amount: "4 tbsp"),
                    RecipeIngredient(name: "Cherry tomatoes", amount: "250 g"),
                    RecipeIngredient(name: "Garlic", amount: "1 clove"),
                    RecipeIngredient(name: "Lemon", amount: "half, juiced"),
                    RecipeIngredient(name: "Olive oil", amount: "3 tbsp", isStaple: true),
                    RecipeIngredient(name: "Black pepper", amount: "to taste", isStaple: true)
                ],
                steps: [
                    RecipeStep(instruction: "Blitz the feta, yoghurt, garlic and lemon juice until it is genuinely smooth — a full minute, scraping down twice.", minutes: 2),
                    RecipeStep(instruction: "Get a dry pan properly hot, add the tomatoes and leave them until the skins blacken and split.", minutes: 6),
                    RecipeStep(instruction: "Spread the whipped feta across two shallow bowls with the back of a spoon, building a well in the middle.", minutes: 1),
                    RecipeStep(instruction: "Tip the tomatoes and all their juices into the well, then finish with olive oil and cracked pepper.", minutes: 1)
                ],
                chefTips: ["Room-temperature feta whips far smoother than fridge-cold."],
                tags: ["10 minutes", "Vegetarian"],
                heroSymbol: "leaf"
            ),
            Recipe(
                title: "Crispy Chickpea and Spinach Shakshuka",
                summary: "Eggs poached into a smoky paprika sauce with chickpeas fried until they crackle — brunch that works just as well at 9pm.",
                cuisine: "North African",
                mealType: .breakfast,
                difficulty: .medium,
                prepMinutes: 8,
                cookMinutes: 22,
                servings: 2,
                nutrition: Nutrition(calories: 512, proteinGrams: 26, carbsGrams: 41, fatGrams: 26, fiberGrams: 11),
                ingredients: [
                    RecipeIngredient(name: "Chickpeas", amount: "1 tin, drained"),
                    RecipeIngredient(name: "Eggs", amount: "4"),
                    RecipeIngredient(name: "Cherry tomatoes", amount: "300 g"),
                    RecipeIngredient(name: "Spinach", amount: "1 large handful"),
                    RecipeIngredient(name: "Smoked paprika", amount: "2 tsp"),
                    RecipeIngredient(name: "Garlic", amount: "3 cloves"),
                    RecipeIngredient(name: "Feta", amount: "60 g, to finish"),
                    RecipeIngredient(name: "Olive oil", amount: "2 tbsp", isStaple: true)
                ],
                steps: [
                    RecipeStep(instruction: "Dry the chickpeas thoroughly, then fry them in hot oil until they rattle in the pan and turn deep gold. Scoop out half for the top.", minutes: 8),
                    RecipeStep(instruction: "Add garlic and paprika to the pan and stir for 30 seconds until the oil turns brick red.", minutes: 1),
                    RecipeStep(instruction: "Add the tomatoes, crush them with a spoon and simmer until they collapse into a jammy sauce.", minutes: 8),
                    RecipeStep(instruction: "Stir the spinach through, then make four wells and crack an egg into each.", minutes: 2),
                    RecipeStep(instruction: "Cover and cook on low until the whites are set but the yolks still wobble.", minutes: 5),
                    RecipeStep(instruction: "Scatter the reserved crispy chickpeas and crumbled feta over the top.", minutes: 1)
                ],
                chefTips: [
                    "Season the sauce before the eggs go in — you cannot stir it afterwards.",
                    "Lid on, heat low: rushing this scrambles the yolks."
                ],
                tags: ["Vegetarian", "High fibre"],
                heroSymbol: "sunrise"
            ),
            Recipe(
                title: "Lemon Yoghurt Flatbreads with Charred Spring Onion",
                summary: "Two-ingredient dough that puffs in a dry pan, blistered onion folded through, ready before the oven would have preheated.",
                cuisine: "Middle Eastern",
                mealType: .snack,
                difficulty: .easy,
                prepMinutes: 10,
                cookMinutes: 10,
                servings: 4,
                nutrition: Nutrition(calories: 268, proteinGrams: 9, carbsGrams: 42, fatGrams: 7, fiberGrams: 2),
                ingredients: [
                    RecipeIngredient(name: "Greek yoghurt", amount: "250 g"),
                    RecipeIngredient(name: "Self-raising flour", amount: "300 g"),
                    RecipeIngredient(name: "Spring onion", amount: "4"),
                    RecipeIngredient(name: "Lemon", amount: "zest of 1"),
                    RecipeIngredient(name: "Salt", amount: "1 tsp", isStaple: true),
                    RecipeIngredient(name: "Olive oil", amount: "for brushing", isStaple: true)
                ],
                steps: [
                    RecipeStep(instruction: "Char the spring onions whole in a dry pan until blackened in patches, then chop finely.", minutes: 4),
                    RecipeStep(instruction: "Mix yoghurt, flour, salt, lemon zest and the onion into a shaggy dough, then knead 2 minutes until smooth.", minutes: 4),
                    RecipeStep(instruction: "Divide into four and roll each to the thickness of a pound coin.", minutes: 3),
                    RecipeStep(instruction: "Cook in a screaming hot dry pan, one at a time, until they balloon and speckle — about 90 seconds a side.", minutes: 6),
                    RecipeStep(instruction: "Brush with olive oil straight off the heat and stack under a tea towel to stay soft.", minutes: 1)
                ],
                chefTips: ["Stacking them under a towel traps steam and keeps them pliable."],
                tags: ["No yeast", "Vegetarian"],
                heroSymbol: "flame"
            )
        ]
    }

    /// A fully populated state for previews.
    @MainActor
    static func previewState() -> AppState {
        var snapshot = AppSnapshot()
        snapshot.pantry = pantry
        snapshot.recipes = recipes.enumerated().map { index, recipe in
            var copy = recipe
            copy.isFavorite = index < 2
            return copy
        }
        snapshot.preferences.diets = ["High protein"]
        snapshot.hasOnboarded = true
        let state = AppState(snapshot: snapshot, apiKey: "")
        if let first = state.recipes.first {
            state.plan(recipeID: first.id, on: Date(), slot: .dinner, servings: 2)
        }
        return state
    }
}
