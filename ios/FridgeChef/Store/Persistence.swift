import Foundation

/// Everything the app remembers between launches. Kept as one JSON document —
/// the data set is small and this avoids a migration story for a v1.
struct AppSnapshot: Codable {
    var pantry: [PantryIngredient] = []
    var recipes: [Recipe] = []
    var plannedMeals: [PlannedMeal] = []
    var grocery: [GroceryItem] = []
    var preferences: UserPreferences = UserPreferences()
    var model: AnthropicModel = .default
    var hasOnboarded: Bool = false
    var lastScanNote: String?
}

enum SnapshotStore {
    private static let filename = "fridgechef-state.json"

    private static var fileURL: URL? {
        guard let directory = try? FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ) else { return nil }
        let folder = directory.appendingPathComponent("FridgeChef", isDirectory: true)
        if !FileManager.default.fileExists(atPath: folder.path) {
            try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        }
        return folder.appendingPathComponent(filename)
    }

    static func load() -> AppSnapshot {
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else { return AppSnapshot() }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        // A snapshot written by an older build should not wipe the app; fall
        // back to a clean state instead of crashing.
        return (try? decoder.decode(AppSnapshot.self, from: data)) ?? AppSnapshot()
    }

    static func save(_ snapshot: AppSnapshot) {
        guard let fileURL else { return }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(snapshot) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    static func clear() {
        guard let fileURL else { return }
        try? FileManager.default.removeItem(at: fileURL)
    }
}
