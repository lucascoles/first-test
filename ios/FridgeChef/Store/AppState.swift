import SwiftUI
import Observation

/// The single source of truth for pantry, recipes, plan and grocery list.
/// Views read it through `@Environment(AppState.self)`.
@MainActor
@Observable
final class AppState {
    private(set) var pantry: [PantryIngredient]
    private(set) var recipes: [Recipe]
    private(set) var plannedMeals: [PlannedMeal]
    private(set) var grocery: [GroceryItem]

    // Settings-shaped values are written through explicit accessors so that a
    // change made anywhere — including a SwiftUI binding — persists itself.
    // (`@Observable` does not support `didSet` on tracked stored properties,
    // hence the manual `access`/`withMutation` pairs.)
    @ObservationIgnored private var preferencesStorage: UserPreferences
    @ObservationIgnored private var modelStorage: AnthropicModel
    @ObservationIgnored private var hasOnboardedStorage: Bool
    @ObservationIgnored private var lastScanNoteStorage: String?
    @ObservationIgnored private var apiKeyStorage: String
    @ObservationIgnored private var saveTask: Task<Void, Never>?

    var preferences: UserPreferences {
        get {
            access(keyPath: \.preferences)
            return preferencesStorage
        }
        set {
            withMutation(keyPath: \.preferences) { preferencesStorage = newValue }
            scheduleSave()
        }
    }

    var model: AnthropicModel {
        get {
            access(keyPath: \.model)
            return modelStorage
        }
        set {
            withMutation(keyPath: \.model) { modelStorage = newValue }
            scheduleSave()
        }
    }

    var hasOnboarded: Bool {
        get {
            access(keyPath: \.hasOnboarded)
            return hasOnboardedStorage
        }
        set {
            withMutation(keyPath: \.hasOnboarded) { hasOnboardedStorage = newValue }
            scheduleSave()
        }
    }

    var lastScanNote: String? {
        get {
            access(keyPath: \.lastScanNote)
            return lastScanNoteStorage
        }
        set {
            withMutation(keyPath: \.lastScanNote) { lastScanNoteStorage = newValue }
            scheduleSave()
        }
    }

    /// Held in the keychain, never in the JSON snapshot.
    var apiKey: String {
        get {
            access(keyPath: \.apiKey)
            return apiKeyStorage
        }
        set {
            let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
            withMutation(keyPath: \.apiKey) { apiKeyStorage = trimmed }
            KeychainStore.set(trimmed, for: .anthropicAPIKey)
        }
    }

    init(snapshot: AppSnapshot = SnapshotStore.load(), apiKey: String? = nil) {
        self.pantry = snapshot.pantry
        self.recipes = snapshot.recipes
        self.plannedMeals = snapshot.plannedMeals
        self.grocery = snapshot.grocery
        self.preferencesStorage = snapshot.preferences
        self.modelStorage = snapshot.model
        self.hasOnboardedStorage = snapshot.hasOnboarded
        self.lastScanNoteStorage = snapshot.lastScanNote
        self.apiKeyStorage = apiKey ?? KeychainStore.get(.anthropicAPIKey) ?? ""
    }

    // MARK: - Derived state

    var isConfigured: Bool { !apiKey.trimmingCharacters(in: .whitespaces).isEmpty }

    var savedRecipes: [Recipe] {
        recipes.filter(\.isFavorite).sorted { $0.createdAt > $1.createdAt }
    }

    var recentRecipes: [Recipe] {
        recipes.sorted { $0.createdAt > $1.createdAt }
    }

    var pantryByCategory: [(category: IngredientCategory, items: [PantryIngredient])] {
        Dictionary(grouping: pantry, by: \.category)
            .map { (category: $0.key, items: $0.value.sorted { $0.name < $1.name }) }
            .sorted { $0.category.sortOrder < $1.category.sortOrder }
    }

    var expiringSoon: [PantryIngredient] {
        pantry.filter {
            switch $0.expiryState {
            case .soon, .expired: return true
            default: return false
            }
        }
        .sorted { ($0.expiresOn ?? .distantFuture) < ($1.expiresOn ?? .distantFuture) }
    }

    var groceryByCategory: [(category: IngredientCategory, items: [GroceryItem])] {
        Dictionary(grouping: grocery, by: \.category)
            .map { (category: $0.key, items: $0.value.sorted { $0.name < $1.name }) }
            .sorted { $0.category.sortOrder < $1.category.sortOrder }
    }

    func recipe(with id: UUID) -> Recipe? { recipes.first { $0.id == id } }

    func meals(on day: Date) -> [PlannedMeal] {
        let key = Calendar.current.startOfDay(for: day)
        return plannedMeals.filter { $0.dayKey == key }
    }

    func meals(on day: Date, slot: MealType) -> [PlannedMeal] {
        meals(on: day).filter { $0.slot == slot }
    }

    /// Per-serving nutrition of everything planned for a day.
    func nutrition(on day: Date) -> Nutrition {
        meals(on: day).reduce(Nutrition.zero) { total, meal in
            guard let recipe = recipe(with: meal.recipeID) else { return total }
            let perServing = recipe.nutrition
            return total + perServing.scaled(by: Double(meal.servings))
        }
    }

    // MARK: - Pantry

    func addIngredients(_ incoming: [PantryIngredient]) {
        for item in incoming {
            if let index = pantry.firstIndex(where: { $0.matchKey == item.matchKey }) {
                // Already there — refresh quantity and expiry rather than
                // creating a duplicate row.
                var existing = pantry[index]
                existing.quantity = item.quantity ?? existing.quantity
                existing.unit = item.unit ?? existing.unit
                existing.expiresOn = item.expiresOn ?? existing.expiresOn
                existing.addedAt = Date()
                pantry[index] = existing
            } else {
                pantry.append(item)
            }
        }
        scheduleSave()
    }

    func updateIngredient(_ item: PantryIngredient) {
        guard let index = pantry.firstIndex(where: { $0.id == item.id }) else { return }
        pantry[index] = item
        scheduleSave()
    }

    func removeIngredient(_ item: PantryIngredient) {
        pantry.removeAll { $0.id == item.id }
        scheduleSave()
    }

    func removeIngredients(ids: Set<UUID>) {
        pantry.removeAll { ids.contains($0.id) }
        scheduleSave()
    }

    func clearPantry() {
        pantry.removeAll()
        scheduleSave()
    }

    // MARK: - Recipes

    func addRecipes(_ incoming: [Recipe]) {
        recipes.insert(contentsOf: incoming, at: 0)
        trimUnsavedRecipes()
        scheduleSave()
    }

    func toggleFavorite(_ recipe: Recipe) {
        guard let index = recipes.firstIndex(where: { $0.id == recipe.id }) else { return }
        recipes[index].isFavorite.toggle()
        Haptics.tap()
        scheduleSave()
    }

    func deleteRecipe(_ recipe: Recipe) {
        recipes.removeAll { $0.id == recipe.id }
        plannedMeals.removeAll { $0.recipeID == recipe.id }
        scheduleSave()
    }

    /// Generated recipes accumulate quickly. Anything the user did not save is
    /// pruned once the history gets long.
    private func trimUnsavedRecipes(keeping limit: Int = 60) {
        guard recipes.count > limit else { return }
        var kept: [Recipe] = []
        var unsavedSeen = 0
        for recipe in recipes.sorted(by: { $0.createdAt > $1.createdAt }) {
            if recipe.isFavorite {
                kept.append(recipe)
            } else if unsavedSeen < limit {
                kept.append(recipe)
                unsavedSeen += 1
            }
        }
        recipes = kept
    }

    // MARK: - Plan

    func plan(recipeID: UUID, on day: Date, slot: MealType, servings: Int) {
        let meal = PlannedMeal(
            date: Calendar.current.startOfDay(for: day),
            slot: slot,
            recipeID: recipeID,
            servings: servings
        )
        plannedMeals.append(meal)
        Haptics.success()
        scheduleSave()
    }

    func removePlannedMeal(_ meal: PlannedMeal) {
        plannedMeals.removeAll { $0.id == meal.id }
        scheduleSave()
    }

    func clearPlan(on day: Date) {
        let key = Calendar.current.startOfDay(for: day)
        plannedMeals.removeAll { $0.dayKey == key }
        scheduleSave()
    }

    // MARK: - Grocery

    @discardableResult
    func addMissingToGrocery(from recipe: Recipe) -> Int {
        let missing = recipe.coverage(against: pantry).missing
        var added = 0
        for item in missing {
            let key = IngredientMatcher.normalize(item.name)
            guard !grocery.contains(where: { IngredientMatcher.normalize($0.name) == key }) else { continue }
            grocery.append(
                GroceryItem(
                    name: item.name,
                    amount: item.amount,
                    category: IngredientCatalog.category(for: item.name),
                    sourceRecipe: recipe.title
                )
            )
            added += 1
        }
        if added > 0 {
            Haptics.success()
            scheduleSave()
        }
        return added
    }

    func addGroceryItem(name: String, amount: String?, category: IngredientCategory) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        grocery.append(GroceryItem(name: trimmed, amount: amount, category: category))
        scheduleSave()
    }

    func toggleGroceryItem(_ item: GroceryItem) {
        guard let index = grocery.firstIndex(where: { $0.id == item.id }) else { return }
        grocery[index].isChecked.toggle()
        Haptics.tap()
        scheduleSave()
    }

    func removeGroceryItem(_ item: GroceryItem) {
        grocery.removeAll { $0.id == item.id }
        scheduleSave()
    }

    func clearCheckedGroceries() {
        grocery.removeAll(where: \.isChecked)
        scheduleSave()
    }

    /// Ticked-off shopping moves straight into the pantry.
    func moveCheckedGroceriesToPantry() {
        let checked = grocery.filter(\.isChecked)
        guard !checked.isEmpty else { return }
        addIngredients(checked.map {
            PantryIngredient(name: $0.name, quantity: $0.amount, category: $0.category, source: .manual)
        })
        grocery.removeAll(where: \.isChecked)
        Haptics.success()
        scheduleSave()
    }

    // MARK: - Persistence

    private var snapshot: AppSnapshot {
        AppSnapshot(
            pantry: pantry,
            recipes: recipes,
            plannedMeals: plannedMeals,
            grocery: grocery,
            preferences: preferences,
            model: model,
            hasOnboarded: hasOnboarded,
            lastScanNote: lastScanNote
        )
    }

    /// Coalesces the many small mutations a single gesture can produce into one
    /// disk write.
    private func scheduleSave() {
        saveTask?.cancel()
        let pending = snapshot
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            SnapshotStore.save(pending)
        }
    }

    func saveNow() {
        saveTask?.cancel()
        SnapshotStore.save(snapshot)
    }

    func resetEverything() {
        pantry = []
        recipes = []
        plannedMeals = []
        grocery = []
        preferences = UserPreferences()
        lastScanNote = nil
        hasOnboarded = false
        // Cancel the debounced write the setters above just queued, then drop
        // the file so a relaunch really does start clean.
        saveTask?.cancel()
        SnapshotStore.clear()
    }

    // MARK: - Services

    var anthropicClient: AnthropicClient {
        AnthropicClient(configuration: AnthropicConfiguration(apiKey: apiKey, model: model.rawValue))
    }

    var visionService: FridgeVisionService { FridgeVisionService(client: anthropicClient) }
    var recipeService: RecipeService { RecipeService(client: anthropicClient) }
}
