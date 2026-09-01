import Foundation

// MARK: - Meal plan

struct PlannedMeal: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var date: Date
    var slot: MealType
    var recipeID: UUID
    var servings: Int

    /// Day-normalised key so a meal always lands in exactly one planner column.
    var dayKey: Date { Calendar.current.startOfDay(for: date) }
}

// MARK: - Grocery list

struct GroceryItem: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var name: String
    var amount: String?
    var category: IngredientCategory
    var isChecked: Bool = false
    var sourceRecipe: String?
    var addedAt: Date = Date()

    var displayLine: String {
        guard let amount, !amount.isEmpty else { return name }
        return "\(name) · \(amount)"
    }
}

// MARK: - Preferences

enum UnitSystem: String, Codable, CaseIterable, Identifiable {
    case metric
    case imperial

    var id: String { rawValue }
    var title: String { rawValue.capitalized }
}

enum CookingSkill: String, Codable, CaseIterable, Identifiable {
    case beginner
    case confident
    case chef

    var id: String { rawValue }
    var title: String {
        switch self {
        case .beginner: return "Beginner"
        case .confident: return "Confident cook"
        case .chef: return "Chef mode"
        }
    }
}

struct UserPreferences: Codable, Hashable {
    var displayName: String = "there"
    var defaultServings: Int = 2
    var diets: [String] = []
    var allergies: [String] = []
    var dislikes: [String] = []
    var maxCookMinutes: Int = 45
    var skill: CookingSkill = .confident
    var units: UnitSystem = .metric
    /// When true the generator may only use what is in the pantry.
    var strictPantryOnly: Bool = false
    /// How many shoppable extras a recipe may ask for when not strict.
    var allowedMissingItems: Int = 3
    var dailyCalorieGoal: Double = 2000
    var proteinGoalGrams: Double = 140
    var carbGoalGrams: Double = 210
    var fatGoalGrams: Double = 70

    static let dietOptions = [
        "Vegetarian", "Vegan", "Pescatarian", "High protein", "Low carb",
        "Keto", "Gluten free", "Dairy free", "Mediterranean", "Halal", "Kosher"
    ]

    static let allergyOptions = [
        "Peanuts", "Tree nuts", "Shellfish", "Fish", "Eggs", "Soy", "Wheat", "Sesame", "Milk"
    ]
}
