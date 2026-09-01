import SwiftUI

/// The "what are we cooking?" brief. Defaults come from the user's profile so
/// the fastest path is: open, tap Generate.
struct GenerateSheet: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss

    let onGenerate: (RecipeRequest) -> Void

    @State private var mealType: MealType = .dinner
    @State private var servings: Int = 2
    @State private var maxMinutes: Double = 45
    @State private var recipeCount: Int = 4
    @State private var craving: String = ""
    @State private var strictPantryOnly = false
    @State private var didLoadDefaults = false

    private let cravingIdeas = [
        "Something comforting", "Light and fresh", "Spicy", "One pan only",
        "High protein", "Kid friendly", "Use up the leftovers", "Impress someone"
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    pantrySummary

                    block("What meal?") {
                        FlowLayout(spacing: 8) {
                            ForEach(MealType.allCases) { type in
                                SelectableChip(title: type.title, isSelected: mealType == type, systemImage: type.symbol) {
                                    mealType = type
                                }
                            }
                        }
                    }

                    block("How many servings?") {
                        HStack(spacing: 10) {
                            ForEach([1, 2, 3, 4, 6, 8], id: \.self) { count in
                                SelectableChip(title: "\(count)", isSelected: servings == count) {
                                    servings = count
                                }
                            }
                        }
                    }

                    block("Time budget") {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("\(Int(maxMinutes)) minutes or less")
                                    .font(AppFont.body(15, weight: .semibold))
                                    .foregroundStyle(Palette.textPrimary)
                                Spacer()
                                Text(timeMood)
                                    .font(AppFont.caption)
                                    .foregroundStyle(Palette.textSecondary)
                            }
                            Slider(value: $maxMinutes, in: 10...120, step: 5)
                                .tint(Palette.primary)
                        }
                    }

                    block("How many ideas?") {
                        HStack(spacing: 10) {
                            ForEach([2, 3, 4, 6], id: \.self) { count in
                                SelectableChip(title: "\(count)", isSelected: recipeCount == count) {
                                    recipeCount = count
                                }
                            }
                        }
                    }

                    block("Anything in mind?") {
                        VStack(alignment: .leading, spacing: 10) {
                            TextField("Optional — e.g. “nothing too heavy”", text: $craving, axis: .vertical)
                                .font(AppFont.body(15))
                                .lineLimit(2...4)
                                .padding(13)
                                .background(
                                    RoundedRectangle(cornerRadius: Metrics.smallRadius, style: .continuous)
                                        .fill(Palette.surface)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: Metrics.smallRadius, style: .continuous)
                                        .stroke(Palette.separator, lineWidth: 1)
                                )
                            FlowLayout(spacing: 8) {
                                ForEach(cravingIdeas, id: \.self) { idea in
                                    SelectableChip(title: idea, isSelected: craving == idea) {
                                        craving = craving == idea ? "" : idea
                                    }
                                }
                            }
                        }
                    }

                    shoppingToggle

                    if !state.preferences.diets.isEmpty || !state.preferences.allergies.isEmpty {
                        preferencesNote
                    }
                }
                .padding(.horizontal, Metrics.screenPadding)
                .padding(.top, 8)
                .padding(.bottom, 110)
            }
            .screenBackground()
            .safeAreaInset(edge: .bottom) {
                PrimaryButton(title: "Generate \(recipeCount) recipes", systemImage: "sparkles") {
                    onGenerate(
                        RecipeRequest(
                            mealType: mealType,
                            servings: servings,
                            maxMinutes: Int(maxMinutes),
                            recipeCount: recipeCount,
                            craving: craving,
                            strictPantryOnly: strictPantryOnly,
                            allowedMissingItems: state.preferences.allowedMissingItems
                        )
                    )
                    dismiss()
                }
                .padding(.horizontal, Metrics.screenPadding)
                .padding(.vertical, 14)
                .background(.regularMaterial)
            }
            .navigationTitle("What are we cooking?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            .onAppear(perform: loadDefaults)
        }
    }

    // MARK: Pieces

    private var timeMood: String {
        switch Int(maxMinutes) {
        case ..<20: return "Quick fix"
        case 20..<40: return "Weeknight"
        case 40..<75: return "Proper cooking"
        default: return "Weekend project"
        }
    }

    private var pantrySummary: some View {
        HStack(spacing: 12) {
            Image(systemName: "refrigerator.fill")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Palette.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text("Cooking with \(state.pantry.count) ingredients")
                    .font(AppFont.body(14, weight: .semibold))
                    .foregroundStyle(Palette.textPrimary)
                if !state.expiringSoon.isEmpty {
                    Text("We'll prioritise the \(state.expiringSoon.count) that need using up")
                        .font(AppFont.caption)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            Spacer(minLength: 0)
        }
        .cardStyle(radius: 18, padding: 14)
    }

    private var shoppingToggle: some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle(isOn: $strictPantryOnly.animation()) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Only what I already have")
                        .font(AppFont.body(15, weight: .semibold))
                        .foregroundStyle(Palette.textPrimary)
                    Text(strictPantryOnly
                         ? "No shopping — pantry and basic staples only."
                         : "We can suggest up to \(state.preferences.allowedMissingItems) easy extras per recipe.")
                        .font(AppFont.caption)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            .tint(Palette.primary)
        }
        .cardStyle(radius: 18, padding: 14)
    }

    private var preferencesNote: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: 14))
                .foregroundStyle(Palette.primary)
            VStack(alignment: .leading, spacing: 3) {
                if !state.preferences.diets.isEmpty {
                    Text("Diet: \(state.preferences.diets.joined(separator: ", "))")
                        .font(AppFont.caption)
                        .foregroundStyle(Palette.textSecondary)
                }
                if !state.preferences.allergies.isEmpty {
                    Text("Avoiding: \(state.preferences.allergies.joined(separator: ", "))")
                        .font(AppFont.caption)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(13)
        .background(
            RoundedRectangle(cornerRadius: Metrics.smallRadius, style: .continuous)
                .fill(Palette.primarySoft)
        )
    }

    private func block<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(AppFont.sectionTitle)
                .foregroundStyle(Palette.textPrimary)
            content()
        }
    }

    private func loadDefaults() {
        guard !didLoadDefaults else { return }
        didLoadDefaults = true
        servings = state.preferences.defaultServings
        maxMinutes = Double(state.preferences.maxCookMinutes)
        strictPantryOnly = state.preferences.strictPantryOnly
        mealType = Self.suggestedMealType()
    }

    /// Opens on the meal you're most likely cooking right now.
    private static func suggestedMealType() -> MealType {
        switch Calendar.current.component(.hour, from: Date()) {
        case 0..<11: return .breakfast
        case 11..<15: return .lunch
        case 15..<17: return .snack
        default: return .dinner
        }
    }
}

#Preview {
    GenerateSheet { _ in }
        .environment(SampleData.previewState())
}
