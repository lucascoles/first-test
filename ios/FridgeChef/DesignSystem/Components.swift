import SwiftUI

// MARK: - Buttons

struct PrimaryButton: View {
    let title: String
    var systemImage: String? = nil
    var isLoading: Bool = false
    var isEnabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.white)
                } else if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 16, weight: .semibold))
                }
                Text(title)
                    .font(AppFont.body(17, weight: .semibold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [Palette.primary, Palette.primaryDeep],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            )
            .shadow(color: Palette.primary.opacity(0.28), radius: 14, x: 0, y: 8)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled || isLoading)
        .opacity(isEnabled ? 1 : 0.45)
    }
}

struct SecondaryButton: View {
    let title: String
    var systemImage: String? = nil
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 15, weight: .semibold))
                }
                Text(title)
                    .font(AppFont.body(16, weight: .semibold))
            }
            .foregroundStyle(Palette.primaryDeep)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Palette.primarySoft)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Pills & chips

struct MetaPill: View {
    let systemImage: String
    let text: String
    var tint: Color = Palette.textSecondary

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: systemImage)
                .font(.system(size: 11, weight: .semibold))
            Text(text)
                .font(AppFont.caption)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule().fill(Palette.surfaceMuted)
        )
    }
}

struct SelectableChip: View {
    let title: String
    let isSelected: Bool
    var systemImage: String? = nil
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 6) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 12, weight: .semibold))
                }
                Text(title)
                    .font(AppFont.body(14, weight: .medium))
            }
            .foregroundStyle(isSelected ? .white : Palette.textPrimary)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(
                Capsule()
                    .fill(isSelected ? Palette.primary : Palette.surface)
            )
            .overlay(
                Capsule()
                    .stroke(isSelected ? Color.clear : Palette.separator, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Headers

struct SectionHeader: View {
    let title: String
    var subtitle: String? = nil
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AppFont.sectionTitle)
                    .foregroundStyle(Palette.textPrimary)
                if let subtitle {
                    Text(subtitle)
                        .font(AppFont.caption)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            Spacer()
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(AppFont.body(14, weight: .semibold))
                    .foregroundStyle(Palette.primary)
            }
        }
    }
}

struct ScreenHeader: View {
    let eyebrow: String
    let title: String
    var trailing: AnyView? = nil

    var body: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text(eyebrow.uppercased())
                    .font(AppFont.body(11, weight: .bold))
                    .tracking(1.1)
                    .foregroundStyle(Palette.primary)
                Text(title)
                    .font(AppFont.screenTitle)
                    .foregroundStyle(Palette.textPrimary)
            }
            Spacer()
            if let trailing {
                trailing
            }
        }
    }
}

// MARK: - Macros

struct MacroRing: View {
    let value: Double
    let goal: Double
    let tint: Color
    let label: String
    var unit: String = "g"
    var size: CGFloat = 62

    private var progress: Double {
        guard goal > 0 else { return 0 }
        return min(value / goal, 1)
    }

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Circle()
                    .stroke(tint.opacity(0.18), lineWidth: 7)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(tint, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 0) {
                    Text("\(Int(value.rounded()))")
                        .font(AppFont.body(15, weight: .bold))
                        .foregroundStyle(Palette.textPrimary)
                    Text(unit)
                        .font(AppFont.body(9, weight: .semibold))
                        .foregroundStyle(Palette.textTertiary)
                }
            }
            .frame(width: size, height: size)
            Text(label)
                .font(AppFont.body(11, weight: .semibold))
                .foregroundStyle(Palette.textSecondary)
        }
    }
}

struct MacroBarRow: View {
    let nutrition: Nutrition

    var body: some View {
        let total = max(nutrition.proteinGrams + nutrition.carbsGrams + nutrition.fatGrams, 1)
        return VStack(alignment: .leading, spacing: 10) {
            GeometryReader { geo in
                HStack(spacing: 3) {
                    Capsule().fill(Palette.protein)
                        .frame(width: geo.size.width * nutrition.proteinGrams / total)
                    Capsule().fill(Palette.carbs)
                        .frame(width: geo.size.width * nutrition.carbsGrams / total)
                    Capsule().fill(Palette.fat)
                        .frame(width: geo.size.width * nutrition.fatGrams / total)
                }
            }
            .frame(height: 8)

            HStack(spacing: 16) {
                macroLegend("Protein", nutrition.proteinGrams, Palette.protein)
                macroLegend("Carbs", nutrition.carbsGrams, Palette.carbs)
                macroLegend("Fat", nutrition.fatGrams, Palette.fat)
                Spacer()
            }
        }
    }

    private func macroLegend(_ name: String, _ grams: Double, _ tint: Color) -> some View {
        HStack(spacing: 5) {
            Circle().fill(tint).frame(width: 7, height: 7)
            Text("\(name) \(Int(grams.rounded()))g")
                .font(AppFont.caption)
                .foregroundStyle(Palette.textSecondary)
        }
    }
}

// MARK: - Hero artwork

/// Recipes generated by the model do not ship with photography, so each recipe
/// gets a deterministic, appetising gradient plate derived from its title.
struct RecipeHeroArt: View {
    let seed: String
    let symbol: String
    var cornerRadius: CGFloat = Metrics.cardRadius

    private var gradient: [Color] {
        // Unsigned modulo: `abs()` would trap on Int.min.
        let index = Int(UInt(bitPattern: seed.stableHash) % UInt(Palette.heroGradients.count))
        return Palette.heroGradients[index]
    }

    var body: some View {
        ZStack {
            LinearGradient(colors: gradient, startPoint: .topLeading, endPoint: .bottomTrailing)

            // Soft plate highlights
            Circle()
                .fill(Color.white.opacity(0.14))
                .frame(width: 180, height: 180)
                .offset(x: -70, y: -60)
            Circle()
                .fill(Color.black.opacity(0.10))
                .frame(width: 220, height: 220)
                .offset(x: 90, y: 80)

            Image(systemName: symbol)
                .font(.system(size: 44, weight: .regular))
                .foregroundStyle(Color.white.opacity(0.92))
                .shadow(color: .black.opacity(0.18), radius: 8, y: 3)
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}

extension String {
    /// `hashValue` is seeded per-process, so recipe art would change between
    /// launches. This is a stable FNV-1a hash instead.
    var stableHash: Int {
        var hash: UInt64 = 0xcbf29ce484222325
        for byte in self.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 0x100000001b3
        }
        return Int(truncatingIfNeeded: hash)
    }
}

// MARK: - States

struct EmptyStateView: View {
    let systemImage: String
    let title: String
    let message: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(Palette.primarySoft)
                    .frame(width: 84, height: 84)
                Image(systemName: systemImage)
                    .font(.system(size: 32, weight: .medium))
                    .foregroundStyle(Palette.primary)
            }
            Text(title)
                .font(AppFont.title(19))
                .foregroundStyle(Palette.textPrimary)
            Text(message)
                .font(AppFont.body(14))
                .foregroundStyle(Palette.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            if let actionTitle, let action {
                Button(actionTitle) {
                    Haptics.tap()
                    action()
                }
                .font(AppFont.body(15, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 22)
                .padding(.vertical, 12)
                .background(Capsule().fill(Palette.primary))
                .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}

struct SearchField: View {
    let placeholder: String
    @Binding var text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Palette.textTertiary)
            TextField(placeholder, text: $text)
                .font(AppFont.body(15))
                .foregroundStyle(Palette.textPrimary)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(Palette.textTertiary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: Metrics.smallRadius, style: .continuous)
                .fill(Palette.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Metrics.smallRadius, style: .continuous)
                .stroke(Palette.separator, lineWidth: 1)
        )
    }
}

/// Skeleton row used while the model is thinking.
struct ShimmerCard: View {
    @State private var phase: CGFloat = -1

    var body: some View {
        RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous)
            .fill(Palette.surfaceMuted)
            .frame(height: 120)
            .overlay(
                LinearGradient(
                    colors: [.clear, Color.white.opacity(0.35), .clear],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .offset(x: phase * 320)
                .clipShape(RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous))
            )
            .onAppear {
                withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) {
                    phase = 1.6
                }
            }
    }
}
