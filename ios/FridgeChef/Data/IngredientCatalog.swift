import Foundation

/// A local catalogue used for manual entry autocomplete and for guessing the
/// aisle of anything the model returns without a category.
enum IngredientCatalog {
    struct Entry: Identifiable, Hashable {
        var id: String { name }
        let name: String
        let category: IngredientCategory
    }

    static let all: [Entry] = build()

    private static func build() -> [Entry] {
        var entries: [Entry] = []
        func add(_ category: IngredientCategory, _ names: [String]) {
            entries.append(contentsOf: names.map { Entry(name: $0, category: category) })
        }

        add(.produce, [
            "Apple", "Avocado", "Banana", "Basil", "Bell pepper", "Blueberries", "Broccoli",
            "Brussels sprouts", "Cabbage", "Carrot", "Cauliflower", "Celery", "Cherry tomatoes",
            "Chilli", "Coriander", "Corn", "Courgette", "Cucumber", "Aubergine", "Garlic",
            "Ginger", "Green beans", "Kale", "Leek", "Lemon", "Lettuce", "Lime", "Mango",
            "Mushrooms", "Onion", "Orange", "Parsley", "Peas", "Potato", "Pumpkin", "Radish",
            "Red onion", "Rocket", "Spinach", "Spring onion", "Strawberries", "Sweet potato",
            "Thyme", "Tomato", "Rosemary", "Mint"
        ])

        add(.protein, [
            "Bacon", "Beef mince", "Chicken breast", "Chicken thighs", "Chorizo", "Cod",
            "Duck breast", "Ham", "Lamb chops", "Prawns", "Pork belly", "Pork mince",
            "Salmon fillet", "Sausages", "Steak", "Tofu", "Tempeh", "Tuna", "Turkey mince",
            "Whole chicken", "Anchovies", "Mussels"
        ])

        add(.dairy, [
            "Butter", "Cheddar", "Cream cheese", "Creme fraiche", "Double cream", "Eggs",
            "Feta", "Greek yoghurt", "Halloumi", "Milk", "Mozzarella", "Oat milk",
            "Parmesan", "Ricotta", "Sour cream", "Yoghurt"
        ])

        add(.grains, [
            "Basmati rice", "Bulgur wheat", "Couscous", "Egg noodles", "Farro", "Lasagne sheets",
            "Linguine", "Oats", "Orzo", "Penne", "Quinoa", "Rice noodles", "Risotto rice",
            "Spaghetti", "Sushi rice", "Tortillas", "Wraps"
        ])

        add(.pantry, [
            "Almonds", "Black beans", "Breadcrumbs", "Cashews", "Chia seeds", "Chickpeas",
            "Chopped tomatoes", "Coconut milk", "Cornflour", "Dried apricots", "Flour",
            "Honey", "Kidney beans", "Lentils", "Maple syrup", "Olive oil", "Peanut butter",
            "Pine nuts", "Plain flour", "Raisins", "Sesame seeds", "Stock cubes", "Sugar",
            "Sunflower oil", "Tahini", "Tinned tuna", "Walnuts", "Yeast"
        ])

        add(.condiments, [
            "Balsamic vinegar", "Black pepper", "Chilli flakes", "Cinnamon", "Cumin",
            "Curry powder", "Dijon mustard", "Fish sauce", "Garam masala", "Harissa",
            "Hot sauce", "Ketchup", "Mayonnaise", "Miso paste", "Oregano", "Paprika",
            "Pesto", "Rice vinegar", "Salt", "Sesame oil", "Soy sauce", "Sriracha",
            "Smoked paprika", "Sweet chilli sauce", "Tomato puree", "Turmeric", "Vanilla extract"
        ])

        add(.frozen, [
            "Frozen berries", "Frozen chips", "Frozen peas", "Frozen prawns", "Frozen spinach",
            "Ice cream", "Puff pastry"
        ])

        add(.bakery, [
            "Bagels", "Baguette", "Brioche buns", "Ciabatta", "Croissants", "Pitta bread",
            "Sourdough", "White bread", "Wholemeal bread"
        ])

        add(.drinks, [
            "Apple juice", "Coconut water", "Coffee", "Cola", "Green tea", "Orange juice",
            "Red wine", "Sparkling water", "White wine"
        ])

        return entries.sorted { $0.name < $1.name }
    }

    /// Items most kitchens always have — offered as one-tap adds on first run.
    static let commonStaples: [Entry] = [
        Entry(name: "Salt", category: .condiments),
        Entry(name: "Black pepper", category: .condiments),
        Entry(name: "Olive oil", category: .pantry),
        Entry(name: "Butter", category: .dairy),
        Entry(name: "Garlic", category: .produce),
        Entry(name: "Onion", category: .produce),
        Entry(name: "Eggs", category: .dairy),
        Entry(name: "Flour", category: .pantry),
        Entry(name: "Sugar", category: .pantry),
        Entry(name: "Rice", category: .grains),
        Entry(name: "Pasta", category: .grains),
        Entry(name: "Soy sauce", category: .condiments)
    ]

    private static let lookup: [String: IngredientCategory] = {
        var map: [String: IngredientCategory] = [:]
        for entry in all {
            map[IngredientMatcher.normalize(entry.name)] = entry.category
        }
        return map
    }()

    /// Best-effort aisle for an arbitrary ingredient name.
    static func category(for name: String) -> IngredientCategory {
        let key = IngredientMatcher.normalize(name)
        if let exact = lookup[key] { return exact }
        for (catalogKey, category) in lookup where key.contains(catalogKey) || catalogKey.contains(key) {
            return category
        }
        return .other
    }

    static func suggestions(for query: String, limit: Int = 12) -> [Entry] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return [] }
        let prefixMatches = all.filter { $0.name.lowercased().hasPrefix(trimmed) }
        let containsMatches = all.filter {
            !$0.name.lowercased().hasPrefix(trimmed) && $0.name.lowercased().contains(trimmed)
        }
        return Array((prefixMatches + containsMatches).prefix(limit))
    }
}
