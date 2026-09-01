import Foundation
import UIKit

/// Turns one or more fridge/counter photos into a list of candidate
/// ingredients. Everything it returns is a *suggestion* — the user reviews the
/// list before it touches the pantry.
struct FridgeVisionService {
    let client: AnthropicClient

    private static let systemPrompt = """
    You identify food items in photographs of fridges, freezers, cupboards and kitchen counters.

    Rules:
    - List every distinct edible ingredient you can actually see. Do not guess at items hidden \
    behind others, and never pad the list with things a kitchen "probably" has.
    - Use short, shoppable names in singular form ("Red onion", "Greek yoghurt", "Chicken breast"), \
    not brand names or packaging descriptions.
    - Merge duplicates: three of the same pepper is one entry with quantity "3".
    - Estimate quantity and unit only when the photo makes it reasonably clear. Otherwise return \
    empty strings for both.
    - confidence is 0-1: 0.9+ when the item is unmistakable, 0.6-0.85 when the label or shape is \
    partly obscured, below 0.6 when you are genuinely unsure.
    - If a photo contains no food at all, return an empty ingredients array and say so in `notes`.
    - `notes` is one short sentence for the user, e.g. "Bottom shelf is blurry — worth a second photo."
    """

    private static let schema: [String: Any] = JSONSchema.object(
        properties: [
            "ingredients": JSONSchema.array(
                of: JSONSchema.object(
                    properties: [
                        "name": JSONSchema.string(),
                        "quantity": JSONSchema.string(),
                        "unit": JSONSchema.string(),
                        "category": JSONSchema.string(enumValues: IngredientCategory.allCases.map(\.rawValue)),
                        "confidence": JSONSchema.number
                    ],
                    required: ["name", "quantity", "unit", "category", "confidence"]
                )
            ),
            "notes": JSONSchema.string()
        ],
        required: ["ingredients", "notes"]
    )

    /// Named `Outcome` rather than `Result` so it never reads as the stdlib type.
    struct Outcome {
        var ingredients: [DetectedIngredient]
        var notes: String
    }

    func detectIngredients(in images: [UIImage]) async throws -> Outcome {
        let payloads = images.compactMap { $0.compressedForUpload() }
        guard !payloads.isEmpty else { return Outcome(ingredients: [], notes: "No photo to read.") }

        var content: [MessageContent] = payloads.map { .image(data: $0, mediaType: "image/jpeg") }
        content.append(.text(
            payloads.count == 1
                ? "What food is in this photo? Return every ingredient you can see."
                : "These \(payloads.count) photos are of the same kitchen. Return the combined ingredient list, without duplicates."
        ))

        let payload = try await client.requestDecodable(
            ScanPayload.self,
            system: Self.systemPrompt,
            content: content,
            jsonSchema: Self.schema,
            maxTokens: 4000,
            effort: "medium"
        )

        let detected = payload.ingredients
            .filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
            .map { item -> DetectedIngredient in
                let category = IngredientCategory(rawValue: item.category) ?? IngredientCatalog.category(for: item.name)
                return DetectedIngredient(
                    name: item.name.trimmingCharacters(in: .whitespaces),
                    quantity: item.quantity.isEmpty ? nil : item.quantity,
                    unit: item.unit.isEmpty ? nil : item.unit,
                    category: category,
                    confidence: min(max(item.confidence, 0), 1),
                    // Low-confidence guesses start unticked so nothing lands in
                    // the pantry that the user did not look at.
                    isSelected: item.confidence >= 0.6
                )
            }
            .sorted { $0.confidence > $1.confidence }

        return Outcome(ingredients: detected, notes: payload.notes)
    }

    // MARK: Wire format

    private struct ScanPayload: Decodable {
        struct Item: Decodable {
            let name: String
            let quantity: String
            let unit: String
            let category: String
            let confidence: Double
        }

        let ingredients: [Item]
        let notes: String
    }
}
