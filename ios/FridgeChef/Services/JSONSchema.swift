import Foundation

/// Small builders for the JSON Schema we hand to `output_config.format`.
/// Every helper returns an explicitly typed `[String: Any]`, which keeps the
/// nested schema literals readable and unambiguous to the type checker.
enum JSONSchema {
    static func object(properties: [String: Any], required: [String]) -> [String: Any] {
        [
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": false
        ]
    }

    static func array(of items: [String: Any]) -> [String: Any] {
        ["type": "array", "items": items]
    }

    static func string(enumValues: [String]? = nil) -> [String: Any] {
        guard let enumValues else { return ["type": "string"] }
        return ["type": "string", "enum": enumValues]
    }

    static let integer: [String: Any] = ["type": "integer"]
    static let number: [String: Any] = ["type": "number"]
    static let boolean: [String: Any] = ["type": "boolean"]
    static let stringArray: [String: Any] = ["type": "array", "items": ["type": "string"]]
}
