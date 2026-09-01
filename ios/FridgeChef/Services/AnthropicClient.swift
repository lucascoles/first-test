import Foundation
import UIKit

// MARK: - Configuration

struct AnthropicConfiguration {
    /// Point this at your own backend in production. Shipping a raw Anthropic
    /// key inside an iOS binary means anybody who unpacks the app can spend
    /// your credits — the key entered in Settings is a convenience for
    /// development and TestFlight builds only.
    var baseURL: URL = URL(string: "https://api.anthropic.com")!
    var apiKey: String
    var model: String = AnthropicModel.default.rawValue
    var apiVersion: String = "2023-06-01"
}

enum AnthropicModel: String, CaseIterable, Identifiable, Codable {
    case opus5 = "claude-opus-5"
    case sonnet5 = "claude-sonnet-5"
    case haiku45 = "claude-haiku-4-5"

    var id: String { rawValue }

    static let `default` = AnthropicModel.opus5

    var title: String {
        switch self {
        case .opus5: return "Claude Opus 5"
        case .sonnet5: return "Claude Sonnet 5"
        case .haiku45: return "Claude Haiku 4.5"
        }
    }

    var blurb: String {
        switch self {
        case .opus5: return "Best recipes and the sharpest fridge reading."
        case .sonnet5: return "Faster and cheaper, still very capable."
        case .haiku45: return "Fastest. Good for quick pantry scans."
        }
    }
}

// MARK: - Errors

enum AnthropicError: LocalizedError {
    case missingAPIKey
    case invalidResponse
    case http(status: Int, message: String)
    case decoding(String)
    case refused(String)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .missingAPIKey:
            return "Add your Anthropic API key in Profile → API key to generate recipes."
        case .invalidResponse:
            return "The server sent something we couldn't read. Please try again."
        case .http(let status, let message):
            switch status {
            case 401: return "That API key was rejected. Check it in Profile → API key."
            case 429: return "Rate limited by the API. Wait a moment and try again."
            case 500...599: return "Anthropic is having trouble right now. Try again shortly."
            default: return message.isEmpty ? "Request failed (\(status))." : message
            }
        case .decoding(let detail):
            return "We couldn't understand the reply: \(detail)"
        case .refused(let detail):
            return detail.isEmpty ? "The model declined this request." : detail
        case .transport(let error):
            return error.localizedDescription
        }
    }
}

// MARK: - Message building blocks

/// A single piece of user content — text or an image the user photographed.
enum MessageContent {
    case text(String)
    case image(data: Data, mediaType: String)

    var json: [String: Any] {
        switch self {
        case .text(let value):
            return ["type": "text", "text": value]
        case .image(let data, let mediaType):
            return [
                "type": "image",
                "source": [
                    "type": "base64",
                    "media_type": mediaType,
                    "data": data.base64EncodedString()
                ]
            ]
        }
    }
}

// MARK: - Client

/// Thin, dependency-free wrapper over the Anthropic Messages API. There is no
/// official Swift SDK, so this talks to `POST /v1/messages` directly.
struct AnthropicClient {
    let configuration: AnthropicConfiguration

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    /// Sends one request and returns the JSON object the model produced.
    ///
    /// `jsonSchema` is passed as `output_config.format`, which constrains the
    /// reply to valid JSON matching the schema — the first text block is then
    /// guaranteed to parse.
    func requestJSON(
        system: String,
        content: [MessageContent],
        jsonSchema: [String: Any],
        maxTokens: Int = 16000,
        effort: String = "high"
    ) async throws -> [String: Any] {
        guard !configuration.apiKey.isEmpty else { throw AnthropicError.missingAPIKey }

        // The system prompt is identical across calls of the same kind, so it
        // carries a cache breakpoint.
        let systemBlock: [String: Any] = [
            "type": "text",
            "text": system,
            "cache_control": ["type": "ephemeral"]
        ]
        let userMessage: [String: Any] = [
            "role": "user",
            "content": content.map(\.json)
        ]
        let outputConfig: [String: Any] = [
            "effort": effort,
            "format": ["type": "json_schema", "schema": jsonSchema] as [String: Any]
        ]

        var body: [String: Any] = [
            "model": configuration.model,
            "max_tokens": maxTokens,
            "system": [systemBlock],
            "messages": [userMessage],
            "output_config": outputConfig
        ]

        // Haiku 4.5 predates adaptive thinking; only send it where it applies.
        if configuration.model != AnthropicModel.haiku45.rawValue {
            body["thinking"] = ["type": "adaptive"]
        }

        let payload = try JSONSerialization.data(withJSONObject: body, options: [])

        var request = URLRequest(url: configuration.baseURL.appendingPathComponent("/v1/messages"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(configuration.apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue(configuration.apiVersion, forHTTPHeaderField: "anthropic-version")
        request.httpBody = payload
        request.timeoutInterval = 180

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw AnthropicError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else { throw AnthropicError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw AnthropicError.http(status: http.statusCode, message: Self.errorMessage(from: data))
        }

        let message: MessagesResponse
        do {
            message = try Self.decoder.decode(MessagesResponse.self, from: data)
        } catch {
            throw AnthropicError.decoding(error.localizedDescription)
        }

        if message.stopReason == "refusal" {
            throw AnthropicError.refused(message.stopDetails?.explanation ?? "")
        }

        guard let text = message.content.first(where: { $0.type == "text" })?.text,
              let jsonData = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] else {
            throw AnthropicError.decoding("the reply was not JSON")
        }
        return object
    }

    private static func errorMessage(from data: Data) -> String {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let error = object["error"] as? [String: Any],
              let message = error["message"] as? String else { return "" }
        return message
    }
}

// MARK: - Response shapes

private struct MessagesResponse: Decodable {
    struct Block: Decodable {
        let type: String
        let text: String?
    }

    struct StopDetails: Decodable {
        let type: String?
        let category: String?
        let explanation: String?
    }

    let id: String
    let model: String
    let stopReason: String?
    let stopDetails: StopDetails?
    let content: [Block]
}

// MARK: - Image helpers

extension UIImage {
    /// Downsizes and JPEG-encodes a photo so a fridge scan stays well under the
    /// API's per-request limits and uploads quickly on cellular.
    func compressedForUpload(maxDimension: CGFloat = 1280, quality: CGFloat = 0.7) -> Data? {
        let longestSide = max(size.width, size.height)
        let scale = longestSide > maxDimension ? maxDimension / longestSide : 1
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: target, format: format)
        let resized = renderer.image { _ in
            self.draw(in: CGRect(origin: .zero, size: target))
        }
        return resized.jpegData(compressionQuality: quality)
    }
}

// MARK: - Typed convenience

extension AnthropicClient {
    /// `requestJSON` plus decoding into a `Decodable` payload. JSON keys are
    /// snake_case on the wire and camelCase in Swift.
    func requestDecodable<T: Decodable>(
        _ type: T.Type,
        system: String,
        content: [MessageContent],
        jsonSchema: [String: Any],
        maxTokens: Int = 16000,
        effort: String = "high"
    ) async throws -> T {
        let object = try await requestJSON(
            system: system,
            content: content,
            jsonSchema: jsonSchema,
            maxTokens: maxTokens,
            effort: effort
        )
        let data = try JSONSerialization.data(withJSONObject: object, options: [])
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw AnthropicError.decoding(error.localizedDescription)
        }
    }
}
