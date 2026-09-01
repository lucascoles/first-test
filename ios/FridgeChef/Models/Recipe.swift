import SwiftUI

// MARK: - Meal types

enum MealType: String, Codable, CaseIterable, Identifiable, Hashable {
    case breakfast
    case lunch
    case dinner
    case snack
    case dessert

    var id: String { rawValue }

    var title: String { rawValue.capitalized }

    var symbol: String {
        switch self {
        case .breakfast: return "sunrise"
        case .lunch: return "sun.max"
        case .dinner: return "moon.stars"
        case .snack: return "takeoutbag.and.cup.and.straw"
        case .dessert: return "birthday.cake"
        }
    }

    /// Slots shown on the weekly planner, in the order they are eaten.
    static var planSlots: [MealType] { [.breakfast, .lunch, .dinner, .snack] }
}

enum Difficulty: String, Codable, CaseIterable, Identifiable, Hashable {
    case easy
    case medium
    case hard

    var id: String { rawValue }
    var title: String { rawValue.capitalized }

    var tint: Color {
        switch self {
        case .easy: return Palette.primary
        case .medium: return Palette.warning
        case .hard: return Palette.danger
        }
    }
}

// MARK: - Nutrition

struct Nutrition: Codable, Hashable {
    var calories: Double
    var proteinGrams: Double
    var carbsGrams: Double
    var fatGrams: Double
    var fiberGrams: Double?

    static let zero = Nutrition(calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0, fiberGrams: nil)

    static func + (lhs: Nutrition, rhs: Nutrition) -> Nutrition {
        Nutrition(
            calories: lhs.calories + rhs.calories,
            proteinGrams: lhs.proteinGrams + rhs.proteinGrams,
            carbsGrams: lhs.carbsGrams + rhs.carbsGrams,
            fatGrams: lhs.fatGrams + rhs.fatGrams,
            fiberGrams: (lhs.fiberGrams ?? 0) + (rhs.fiberGrams ?? 0)
        )
    }

    func scaled(by factor: Double) -> Nutrition {
        Nutrition(
            calories: calories * factor,
            proteinGrams: proteinGrams * factor,
            carbsGrams: carbsGrams * factor,
            fatGrams: fatGrams * factor,
            fiberGrams: fiberGrams.map { $0 * factor }
        )
    }
}

// MARK: - Recipe parts

struct RecipeIngredient: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var name: String
    var amount: String?
    var note: String?
    /// Set by the model: staples like salt and water never count as "missing".
    var isStaple: Bool = false

    var displayLine: String {
        let amountText = amount?.trimmingCharacters(in: .whitespaces) ?? ""
        return amountText.isEmpty ? name : "\(amountText) \(name)"
    }
}

struct RecipeStep: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var instruction: String
    var minutes: Int?
}

// MARK: - Recipe

struct Recipe: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var title: String
    var summary: String
    var cuisine: String
    var mealType: MealType
    var difficulty: Difficulty
    var prepMinutes: Int
    var cookMinutes: Int
    var servings: Int
    var nutrition: Nutrition
    var ingredients: [RecipeIngredient]
    var steps: [RecipeStep]
    var chefTips: [String] = []
    var tags: [String] = []
    var heroSymbol: String = "fork.knife"
    var createdAt: Date = Date()
    var isFavorite: Bool = false

    var totalMinutes: Int { prepMinutes + cookMinutes }

    var timeLabel: String {
        let total = totalMinutes
        if total < 60 { return "\(total) min" }
        let hours = total / 60
        let minutes = total % 60
        return minutes == 0 ? "\(hours) hr" : "\(hours)h \(minutes)m"
    }

    /// Guards against the model inventing an SF Symbol that does not exist.
    var safeSymbol: String {
        Recipe.allowedSymbols.contains(heroSymbol) ? heroSymbol : "fork.knife"
    }

    static let allowedSymbols: Set<String> = [
        "fork.knife", "flame", "leaf", "carrot", "fish", "bird", "cup.and.saucer",
        "birthday.cake", "takeoutbag.and.cup.and.straw", "popcorn", "frying.pan",
        "mug", "wineglass", "sun.max", "sunrise", "moon.stars"
    ]

    /// Which recipe lines the pantry already covers.
    func coverage(against pantry: [PantryIngredient]) -> Coverage {
        let keys = pantry.map(\.matchKey)
        var have: [RecipeIngredient] = []
        var missing: [RecipeIngredient] = []
        for item in ingredients {
            let satisfied = item.isStaple || keys.contains { IngredientMatcher.matches(recipeIngredient: item.name, pantryKey: $0) }
            if satisfied { have.append(item) } else { missing.append(item) }
        }
        return Coverage(have: have, missing: missing)
    }

    struct Coverage {
        var have: [RecipeIngredient]
        var missing: [RecipeIngredient]

        var total: Int { have.count + missing.count }
        var fraction: Double { total == 0 ? 1 : Double(have.count) / Double(total) }
        var label: String { "\(have.count)/\(total) ingredients" }
    }
}
