import SwiftUI
import UIKit

// MARK: - Hex helpers

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255.0,
            green: CGFloat((hex >> 8) & 0xFF) / 255.0,
            blue: CGFloat(hex & 0xFF) / 255.0,
            alpha: alpha
        )
    }
}

extension Color {
    /// A colour that resolves differently in light and dark appearance.
    static func adaptive(light: UInt32, dark: UInt32) -> Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light)
        })
    }

    init(hex: UInt32) {
        self.init(UIColor(hex: hex))
    }
}

// MARK: - Palette

/// The app's colour system. Warm off-white canvas, white cards, a fresh
/// kitchen-green primary and three macro accents — the visual language used by
/// modern meal-prep apps.
enum Palette {
    static let canvas = Color.adaptive(light: 0xF6F6F3, dark: 0x0F1211)
    static let surface = Color.adaptive(light: 0xFFFFFF, dark: 0x1A1E1C)
    static let surfaceElevated = Color.adaptive(light: 0xFFFFFF, dark: 0x232826)
    static let surfaceMuted = Color.adaptive(light: 0xF0F1EE, dark: 0x222724)

    static let primary = Color.adaptive(light: 0x18A66E, dark: 0x2CC084)
    static let primaryDeep = Color.adaptive(light: 0x0E6B4A, dark: 0x1D8A60)
    static let primarySoft = Color.adaptive(light: 0xE4F5EC, dark: 0x14332A)

    static let textPrimary = Color.adaptive(light: 0x14181A, dark: 0xF4F6F5)
    static let textSecondary = Color.adaptive(light: 0x707B76, dark: 0x9BA6A1)
    static let textTertiary = Color.adaptive(light: 0xA3ACA8, dark: 0x6E7873)

    static let separator = Color.adaptive(light: 0xE7E9E5, dark: 0x2E3532)
    static let shadow = Color.adaptive(light: 0x0A1F17, dark: 0x000000)

    static let protein = Color.adaptive(light: 0xE8604C, dark: 0xF2705D)
    static let carbs = Color.adaptive(light: 0x3B9BE8, dark: 0x54ADF2)
    static let fat = Color.adaptive(light: 0xF0AE1F, dark: 0xF7BE41)

    static let warning = Color.adaptive(light: 0xE0932F, dark: 0xF0AE4A)
    static let danger = Color.adaptive(light: 0xD9503F, dark: 0xEA6754)

    /// Gradient pairs used to paint recipe hero art procedurally.
    static let heroGradients: [[Color]] = [
        [Color(hex: 0x16A06B), Color(hex: 0x0B6B4B)],
        [Color(hex: 0xF2994A), Color(hex: 0xE05C3E)],
        [Color(hex: 0x4A90E2), Color(hex: 0x2B5FA8)],
        [Color(hex: 0xE8604C), Color(hex: 0xA32E3C)],
        [Color(hex: 0xF5C242), Color(hex: 0xE08A22)],
        [Color(hex: 0x7B61FF), Color(hex: 0x4B33B8)],
        [Color(hex: 0x2CC9A8), Color(hex: 0x0E7C74)],
        [Color(hex: 0xFF7BA9), Color(hex: 0xC53F73)]
    ]
}

// MARK: - Typography

enum AppFont {
    static func display(_ size: CGFloat) -> Font { .system(size: size, weight: .bold, design: .rounded) }
    static func title(_ size: CGFloat) -> Font { .system(size: size, weight: .semibold, design: .rounded) }
    static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }

    static let screenTitle = display(30)
    static let sectionTitle = title(19)
    static let cardTitle = title(17)
    static let label = body(13, weight: .semibold)
    static let caption = body(12, weight: .medium)
}

// MARK: - Metrics

enum Metrics {
    static let screenPadding: CGFloat = 20
    static let cardRadius: CGFloat = 22
    static let smallRadius: CGFloat = 14
    static let cardSpacing: CGFloat = 14
    /// Height reserved at the bottom of scroll views so the floating tab bar
    /// never covers the last row.
    static let tabBarInset: CGFloat = 108
}

// MARK: - Reusable modifiers

struct CardBackground: ViewModifier {
    var radius: CGFloat = Metrics.cardRadius
    var padding: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(Palette.surface)
            )
            .shadow(color: Palette.shadow.opacity(0.06), radius: 14, x: 0, y: 6)
    }
}

extension View {
    func cardStyle(radius: CGFloat = Metrics.cardRadius, padding: CGFloat = 16) -> some View {
        modifier(CardBackground(radius: radius, padding: padding))
    }

    /// Standard screen chrome: canvas background and horizontal gutters.
    func screenBackground() -> some View {
        background(Palette.canvas.ignoresSafeArea())
    }
}

/// Light haptic used on the primary actions, matching the tactile feel of the
/// reference app.
enum Haptics {
    static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
}
