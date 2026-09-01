import SwiftUI

/// The standard recipe tile: hero art, title, meta pills and a "what you're
/// missing" bar so the pantry link is visible before you open anything.
struct RecipeCard: View {
    let recipe: Recipe
    let coverage: Recipe.Coverage
    var isCompact: Bool = false
    var onFavorite: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topTrailing) {
                RecipeHeroArt(seed: recipe.title, symbol: recipe.safeSymbol, cornerRadius: 0)
                    .frame(height: isCompact ? 110 : 148)

                if let onFavorite {
                    Button {
                        onFavorite()
                    } label: {
                        Image(systemName: recipe.isFavorite ? "heart.fill" : "heart")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(recipe.isFavorite ? Palette.danger : .white)
                            .padding(9)
                            .background(Circle().fill(.black.opacity(0.28)))
                    }
                    .buttonStyle(.plain)
                    .padding(10)
                }

                VStack {
                    Spacer()
                    HStack {
                        MetaPill(systemImage: "clock", text: recipe.timeLabel, tint: .white)
                            .background(Capsule().fill(.black.opacity(0.28)))
                        MetaPill(systemImage: "flame", text: "\(Int(recipe.nutrition.calories)) kcal", tint: .white)
                            .background(Capsule().fill(.black.opacity(0.28)))
                        Spacer()
                    }
                    .padding(10)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(recipe.title)
                    .font(AppFont.cardTitle)
                    .foregroundStyle(Palette.textPrimary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)

                if !isCompact {
                    Text(recipe.summary)
                        .font(AppFont.body(13))
                        .foregroundStyle(Palette.textSecondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                CoverageBar(coverage: coverage)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
        }
        .background(
            RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous)
                .fill(Palette.surface)
        )
        .clipShape(RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous))
        .shadow(color: Palette.shadow.opacity(0.07), radius: 14, x: 0, y: 6)
    }
}

struct CoverageBar: View {
    let coverage: Recipe.Coverage

    private var tint: Color {
        switch coverage.missing.count {
        case 0: return Palette.primary
        case 1...2: return Palette.warning
        default: return Palette.danger
        }
    }

    private var label: String {
        switch coverage.missing.count {
        case 0: return "You have everything"
        case 1: return "1 item to buy"
        default: return "\(coverage.missing.count) items to buy"
        }
    }

    var body: some View {
        HStack(spacing: 8) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Palette.surfaceMuted)
                    Capsule().fill(tint)
                        .frame(width: max(geo.size.width * coverage.fraction, 4))
                }
            }
            .frame(height: 6)

            Text(label)
                .font(AppFont.body(11, weight: .bold))
                .foregroundStyle(tint)
                .fixedSize()
        }
    }
}
