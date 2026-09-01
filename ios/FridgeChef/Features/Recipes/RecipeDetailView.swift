import SwiftUI

struct RecipeDetailView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss

    let recipeID: UUID

    @State private var completedSteps: Set<UUID> = []
    @State private var isShowingPlanner = false
    @State private var toast: String?

    private var recipe: Recipe? { state.recipe(with: recipeID) }

    var body: some View {
        Group {
            if let recipe {
                content(recipe)
            } else {
                EmptyStateView(
                    systemImage: "questionmark.folder",
                    title: "Recipe gone",
                    message: "This recipe is no longer in your collection."
                )
            }
        }
        .screenBackground()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let recipe {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        state.toggleFavorite(recipe)
                    } label: {
                        Image(systemName: recipe.isFavorite ? "heart.fill" : "heart")
                            .foregroundStyle(recipe.isFavorite ? Palette.danger : Palette.textSecondary)
                    }
                }
            }
        }
        .sheet(isPresented: $isShowingPlanner) {
            if let recipe {
                AddToPlanSheet(recipe: recipe) { message in
                    showToast(message)
                }
            }
        }
        .overlay(alignment: .bottom) {
            if let toast {
                Text(toast)
                    .font(AppFont.body(14, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .background(Capsule().fill(Palette.textPrimary.opacity(0.92)))
                    .padding(.bottom, 96)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    // MARK: Content

    private func content(_ recipe: Recipe) -> some View {
        let coverage = recipe.coverage(against: state.pantry)

        return ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                hero(recipe)

                VStack(alignment: .leading, spacing: 22) {
                    intro(recipe)
                    macros(recipe)
                    ingredients(recipe, coverage: coverage)
                    method(recipe)
                    if !recipe.chefTips.isEmpty { tips(recipe) }
                }
                .padding(.horizontal, Metrics.screenPadding)
            }
            .padding(.bottom, 130)
        }
        .safeAreaInset(edge: .bottom) {
            actionBar(recipe, coverage: coverage)
        }
    }

    private func hero(_ recipe: Recipe) -> some View {
        ZStack(alignment: .bottomLeading) {
            RecipeHeroArt(seed: recipe.title, symbol: recipe.safeSymbol, cornerRadius: 0)
                .frame(height: 230)

            LinearGradient(
                colors: [.clear, .black.opacity(0.45)],
                startPoint: .center,
                endPoint: .bottom
            )
            .frame(height: 230)

            HStack(spacing: 8) {
                ForEach(recipe.tags.prefix(3), id: \.self) { tag in
                    Text(tag)
                        .font(AppFont.body(11, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(.white.opacity(0.22)))
                }
            }
            .padding(16)
        }
        .frame(height: 230)
        .clipped()
    }

    private func intro(_ recipe: Recipe) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(recipe.cuisine.uppercased())
                .font(AppFont.body(11, weight: .bold))
                .tracking(1.1)
                .foregroundStyle(Palette.primary)

            Text(recipe.title)
                .font(AppFont.display(26))
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)

            Text(recipe.summary)
                .font(AppFont.body(15))
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                MetaPill(systemImage: "clock", text: recipe.timeLabel)
                MetaPill(systemImage: "person.2", text: "\(recipe.servings) servings")
                MetaPill(systemImage: "chart.bar", text: recipe.difficulty.title, tint: recipe.difficulty.tint)
            }
            .padding(.top, 2)
        }
        .padding(.top, 4)
    }

    private func macros(_ recipe: Recipe) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "Per serving", subtitle: "\(Int(recipe.nutrition.calories)) calories")
            HStack(spacing: 16) {
                MacroRing(value: recipe.nutrition.proteinGrams, goal: 60, tint: Palette.protein, label: "Protein")
                MacroRing(value: recipe.nutrition.carbsGrams, goal: 90, tint: Palette.carbs, label: "Carbs")
                MacroRing(value: recipe.nutrition.fatGrams, goal: 40, tint: Palette.fat, label: "Fat")
                if let fiber = recipe.nutrition.fiberGrams {
                    MacroRing(value: fiber, goal: 12, tint: Palette.primary, label: "Fibre")
                }
                Spacer(minLength: 0)
            }
        }
        .cardStyle()
    }

    private func ingredients(_ recipe: Recipe, coverage: Recipe.Coverage) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "Ingredients", subtitle: coverage.label)

            VStack(spacing: 0) {
                ForEach(recipe.ingredients) { item in
                    let isMissing = coverage.missing.contains { $0.id == item.id }
                    HStack(spacing: 12) {
                        Image(systemName: isMissing ? "cart.badge.plus" : "checkmark.circle.fill")
                            .font(.system(size: 16))
                            .foregroundStyle(isMissing ? Palette.warning : Palette.primary)
                            .frame(width: 22)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.displayLine)
                                .font(AppFont.body(15, weight: .medium))
                                .foregroundStyle(Palette.textPrimary)
                            if let note = item.note, !note.isEmpty {
                                Text(note)
                                    .font(AppFont.caption)
                                    .foregroundStyle(Palette.textSecondary)
                            }
                        }
                        Spacer(minLength: 0)
                        if isMissing {
                            Text("Need")
                                .font(AppFont.body(11, weight: .bold))
                                .foregroundStyle(Palette.warning)
                        }
                    }
                    .padding(.vertical, 11)

                    if item.id != recipe.ingredients.last?.id {
                        Divider().background(Palette.separator)
                    }
                }
            }

            if !coverage.missing.isEmpty {
                SecondaryButton(
                    title: "Add \(coverage.missing.count) missing to shopping list",
                    systemImage: "cart.badge.plus"
                ) {
                    let added = state.addMissingToGrocery(from: recipe)
                    showToast(added == 0 ? "Already on your list" : "Added \(added) to your list")
                }
            }
        }
        .cardStyle()
    }

    private func method(_ recipe: Recipe) -> some View {
        let resetAction: (() -> Void)? = completedSteps.isEmpty ? nil : { completedSteps.removeAll() }

        return VStack(alignment: .leading, spacing: 14) {
            SectionHeader(
                title: "Method",
                subtitle: "\(completedSteps.count)/\(recipe.steps.count) done",
                actionTitle: completedSteps.isEmpty ? nil : "Reset",
                action: resetAction
            )

            VStack(spacing: 10) {
                ForEach(Array(recipe.steps.enumerated()), id: \.element.id) { index, step in
                    StepRow(
                        number: index + 1,
                        step: step,
                        isDone: completedSteps.contains(step.id)
                    ) {
                        if completedSteps.contains(step.id) {
                            completedSteps.remove(step.id)
                        } else {
                            completedSteps.insert(step.id)
                            Haptics.tap()
                        }
                    }
                }
            }
        }
    }

    private func tips(_ recipe: Recipe) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Chef's notes")
            VStack(alignment: .leading, spacing: 10) {
                ForEach(recipe.chefTips, id: \.self) { tip in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "sparkle")
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.primary)
                            .padding(.top, 2)
                        Text(tip)
                            .font(AppFont.body(14))
                            .foregroundStyle(Palette.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardStyle()
        }
    }

    private func actionBar(_ recipe: Recipe, coverage: Recipe.Coverage) -> some View {
        HStack(spacing: 12) {
            Button {
                state.toggleFavorite(recipe)
            } label: {
                Image(systemName: recipe.isFavorite ? "heart.fill" : "heart")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(recipe.isFavorite ? .white : Palette.primaryDeep)
                    .frame(width: 54, height: 54)
                    .background(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(recipe.isFavorite ? Palette.danger : Palette.primarySoft)
                    )
            }
            .buttonStyle(.plain)

            PrimaryButton(title: "Add to my plan", systemImage: "calendar.badge.plus") {
                isShowingPlanner = true
            }
        }
        .padding(.horizontal, Metrics.screenPadding)
        .padding(.vertical, 12)
        .background(.regularMaterial)
    }

    private func showToast(_ message: String) {
        withAnimation { toast = message }
        Task {
            try? await Task.sleep(for: .seconds(1.8))
            withAnimation { toast = nil }
        }
    }
}

private struct StepRow: View {
    let number: Int
    let step: RecipeStep
    let isDone: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(alignment: .top, spacing: 13) {
                ZStack {
                    Circle()
                        .fill(isDone ? Palette.primary : Palette.primarySoft)
                        .frame(width: 30, height: 30)
                    if isDone {
                        Image(systemName: "checkmark")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.white)
                    } else {
                        Text("\(number)")
                            .font(AppFont.body(14, weight: .bold))
                            .foregroundStyle(Palette.primaryDeep)
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text(step.instruction)
                        .font(AppFont.body(15))
                        .foregroundStyle(isDone ? Palette.textTertiary : Palette.textPrimary)
                        .strikethrough(isDone, color: Palette.textTertiary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    if let minutes = step.minutes {
                        MetaPill(systemImage: "timer", text: "\(minutes) min")
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Palette.surface)
            )
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    let state = SampleData.previewState()
    return NavigationStack {
        RecipeDetailView(recipeID: state.recipes[0].id)
            .environment(state)
    }
}
