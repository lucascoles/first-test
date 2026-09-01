import SwiftUI
import Observation
import UIKit

@MainActor
@Observable
final class ScanViewModel {
    enum Stage: Equatable {
        case capture
        case analyzing
        case review
        case failed(String)
    }

    private(set) var stage: Stage = .capture
    var images: [UIImage] = []
    var detected: [DetectedIngredient] = []
    var notes: String = ""

    /// Rotating copy so a 10-20 second vision call does not feel stalled.
    private(set) var statusLine: String = "Looking at your shelves…"
    @ObservationIgnored private var statusTask: Task<Void, Never>?

    static let maxImages = 4

    var canAnalyze: Bool { !images.isEmpty && stage != .analyzing }
    var selectedCount: Int { detected.filter(\.isSelected).count }

    func add(image: UIImage) {
        guard images.count < Self.maxImages else { return }
        images.append(image)
    }

    func removeImage(at index: Int) {
        guard images.indices.contains(index) else { return }
        images.remove(at: index)
    }

    func reset() {
        statusTask?.cancel()
        stage = .capture
        images = []
        detected = []
        notes = ""
    }

    func backToCapture() {
        statusTask?.cancel()
        stage = .capture
    }

    func toggle(_ item: DetectedIngredient) {
        guard let index = detected.firstIndex(where: { $0.id == item.id }) else { return }
        detected[index].isSelected.toggle()
        Haptics.tap()
    }

    func update(_ item: DetectedIngredient) {
        guard let index = detected.firstIndex(where: { $0.id == item.id }) else { return }
        detected[index] = item
    }

    func remove(_ item: DetectedIngredient) {
        detected.removeAll { $0.id == item.id }
    }

    func addManualItem(name: String, category: IngredientCategory) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard !detected.contains(where: { IngredientMatcher.normalize($0.name) == IngredientMatcher.normalize(trimmed) }) else { return }
        detected.insert(
            DetectedIngredient(name: trimmed, category: category, confidence: 1, isSelected: true),
            at: 0
        )
        Haptics.tap()
    }

    func selectAll(_ selected: Bool) {
        for index in detected.indices { detected[index].isSelected = selected }
    }

    // MARK: - Analysis

    func analyze(using state: AppState) async {
        guard !images.isEmpty else { return }
        guard state.isConfigured else {
            stage = .failed(AnthropicError.missingAPIKey.localizedDescription)
            return
        }

        stage = .analyzing
        startStatusRotation()
        defer { statusTask?.cancel() }

        do {
            let result = try await state.visionService.detectIngredients(in: images)
            detected = result.ingredients
            notes = result.notes
            state.lastScanNote = result.notes
            if detected.isEmpty {
                stage = .failed("We couldn't spot any food in that photo. Try a brighter shot, or add items by hand.")
            } else {
                Haptics.success()
                stage = .review
            }
        } catch {
            stage = .failed((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
        }
    }

    /// Skips the API and shows what a scan looks like — used when no key is set.
    func loadSample() {
        detected = SampleData.detected
        notes = "Sample scan. Add your API key to read real photos."
        stage = .review
    }

    func commit(to state: AppState) -> Int {
        let chosen = detected.filter(\.isSelected)
        state.addIngredients(chosen.map { $0.asPantryIngredient() })
        Haptics.success()
        return chosen.count
    }

    private func startStatusRotation() {
        let lines = [
            "Looking at your shelves…",
            "Reading labels and packets…",
            "Sorting produce from dairy…",
            "Tidying up the list…"
        ]
        statusTask?.cancel()
        statusLine = lines[0]
        statusTask = Task { [weak self] in
            var index = 1
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2.6))
                guard !Task.isCancelled else { return }
                self?.statusLine = lines[index % lines.count]
                index += 1
            }
        }
    }
}
