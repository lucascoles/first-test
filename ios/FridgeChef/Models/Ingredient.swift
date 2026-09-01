import SwiftUI

// MARK: - Categories

enum IngredientCategory: String, Codable, CaseIterable, Identifiable, Hashable {
    case produce
    case protein
    case dairy
    case grains
    case pantry
    case condiments
    case frozen
    case bakery
    case drinks
    case other

    var id: String { rawValue }

    var title: String {
        switch self {
        case .produce: return "Produce"
        case .protein: return "Meat & Fish"
        case .dairy: return "Dairy & Eggs"
        case .grains: return "Grains & Pasta"
        case .pantry: return "Pantry"
        case .condiments: return "Sauces & Spices"
        case .frozen: return "Frozen"
        case .bakery: return "Bakery"
        case .drinks: return "Drinks"
        case .other: return "Other"
        }
    }

    var symbol: String {
        switch self {
        case .produce: return "carrot"
        case .protein: return "fish"
        case .dairy: return "drop"
        case .grains: return "square.grid.3x3"
        case .pantry: return "shippingbox"
        case .condiments: return "drop.triangle"
        case .frozen: return "snowflake"
        case .bakery: return "birthday.cake"
        case .drinks: return "cup.and.saucer"
        case .other: return "basket"
        }
    }

    var tint: Color {
        switch self {
        case .produce: return Color(hex: 0x3FAE6A)
        case .protein: return Color(hex: 0xE8604C)
        case .dairy: return Color(hex: 0x4A90E2)
        case .grains: return Color(hex: 0xC08B3E)
        case .pantry: return Color(hex: 0x8A7BD8)
        case .condiments: return Color(hex: 0xE0932F)
        case .frozen: return Color(hex: 0x35B6D6)
        case .bakery: return Color(hex: 0xD98CA5)
        case .drinks: return Color(hex: 0x2CC9A8)
        case .other: return Color(hex: 0x8C9A94)
        }
    }

    /// Ordering used for pantry sections and grocery aisles.
    var sortOrder: Int {
        switch self {
        case .produce: return 0
        case .protein: return 1
        case .dairy: return 2
        case .bakery: return 3
        case .grains: return 4
        case .pantry: return 5
        case .condiments: return 6
        case .frozen: return 7
        case .drinks: return 8
        case .other: return 9
        }
    }
}

// MARK: - Pantry ingredient

struct PantryIngredient: Identifiable, Codable, Hashable {
    enum Source: String, Codable {
        case scan
        case manual
        case staple
    }

    var id: UUID = UUID()
    var name: String
    var quantity: String?
    var unit: String?
    var category: IngredientCategory
    var addedAt: Date = Date()
    var expiresOn: Date?
    var isStaple: Bool = false
    var source: Source = .manual

    var displayQuantity: String? {
        let amount = quantity?.trimmingCharacters(in: .whitespaces) ?? ""
        let unitText = unit?.trimmingCharacters(in: .whitespaces) ?? ""
        let combined = [amount, unitText].filter { !$0.isEmpty }.joined(separator: " ")
        return combined.isEmpty ? nil : combined
    }

    /// Lower-cased, singularised key used to match against recipe ingredients.
    var matchKey: String { IngredientMatcher.normalize(name) }

    var expiryState: ExpiryState {
        guard let expiresOn else { return .none }
        let days = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()),
                                                   to: Calendar.current.startOfDay(for: expiresOn)).day ?? 0
        if days < 0 { return .expired }
        if days <= 2 { return .soon(days) }
        return .fresh(days)
    }

    enum ExpiryState: Equatable {
        case none
        case expired
        case soon(Int)
        case fresh(Int)

        var label: String? {
            switch self {
            case .none: return nil
            case .expired: return "Expired"
            case .soon(let d): return d == 0 ? "Use today" : "\(d)d left"
            case .fresh(let d): return "\(d)d left"
            }
        }

        var tint: Color {
            switch self {
            case .none: return Palette.textTertiary
            case .expired: return Palette.danger
            case .soon: return Palette.warning
            case .fresh: return Palette.textSecondary
            }
        }
    }
}

// MARK: - Scan results

/// One ingredient the vision model believes it can see in the photo. The user
/// confirms or rejects each of these before anything reaches the pantry.
struct DetectedIngredient: Identifiable, Hashable {
    var id: UUID = UUID()
    var name: String
    var quantity: String?
    var unit: String?
    var category: IngredientCategory
    var confidence: Double
    var isSelected: Bool = true

    var confidenceLabel: String {
        switch confidence {
        case 0.85...: return "Confident"
        case 0.6..<0.85: return "Likely"
        default: return "Not sure"
        }
    }

    var confidenceTint: Color {
        switch confidence {
        case 0.85...: return Palette.primary
        case 0.6..<0.85: return Palette.warning
        default: return Palette.danger
        }
    }

    func asPantryIngredient() -> PantryIngredient {
        PantryIngredient(
            name: name,
            quantity: quantity,
            unit: unit,
            category: category,
            source: .scan
        )
    }
}

// MARK: - Matching

/// Ingredient names arrive from three places — the vision model, the recipe
/// model and the user's own typing — so matching has to be forgiving about
/// plurals, casing and descriptive words.
enum IngredientMatcher {
    private static let noiseWords: Set<String> = [
        "fresh", "freshly", "chopped", "diced", "sliced", "minced", "large", "small",
        "medium", "ripe", "raw", "cooked", "organic", "free", "range", "boneless",
        "skinless", "ground", "whole", "low", "fat", "reduced", "unsalted", "salted",
        "extra", "virgin", "of", "a", "the", "to", "taste", "optional", "plus", "more"
    ]

    static func normalize(_ raw: String) -> String {
        let lowered = raw.lowercased()
        let stripped = lowered.components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .filter { !noiseWords.contains($0) }
            .map(singularize)
        return stripped.joined(separator: " ")
    }

    private static func singularize(_ word: String) -> String {
        if word.count > 3, word.hasSuffix("ies") { return String(word.dropLast(3)) + "y" }
        if word.count > 3, word.hasSuffix("ses") || word.hasSuffix("hes") || word.hasSuffix("xes") {
            return String(word.dropLast(2))
        }
        if word.count > 3, word.hasSuffix("s"), !word.hasSuffix("ss") { return String(word.dropLast()) }
        return word
    }

    /// True when a recipe line such as "2 ripe avocados, sliced" is satisfied by
    /// a pantry entry called "Avocado".
    static func matches(recipeIngredient: String, pantryKey: String) -> Bool {
        let recipeKey = normalize(recipeIngredient)
        guard !recipeKey.isEmpty, !pantryKey.isEmpty else { return false }
        if recipeKey == pantryKey { return true }

        let recipeTokens = Set(recipeKey.split(separator: " ").map(String.init))
        let pantryTokens = Set(pantryKey.split(separator: " ").map(String.init))
        guard !pantryTokens.isEmpty else { return false }

        // Every word of the pantry item appears in the recipe line ("olive oil"
        // satisfies "extra virgin olive oil"), or vice versa.
        if pantryTokens.isSubset(of: recipeTokens) { return true }
        if recipeTokens.isSubset(of: pantryTokens) { return true }
        return false
    }
}
