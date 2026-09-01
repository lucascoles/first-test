import SwiftUI

/// The home screen: a week strip, the day's meals by slot, and how the day is
/// tracking against the user's macro goals.
struct PlanView: View {
    @Environment(AppState.self) private var state
    let onOpenProfile: () -> Void

    @State private var selectedDay = Calendar.current.startOfDay(for: Date())
    @State private var slotToFill: MealType?
    @State private var toast: String?

    private var days: [Date] {
        let today = Calendar.current.startOfDay(for: Date())
        return (-1..<13).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: today) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    ScreenHeader(
                        eyebrow: greeting,
                        title: "Your plan",
                        trailing: AnyView(ProfileButton(action: onOpenProfile))
                    )

                    weekStrip
                    dayNutrition

                    if !state.expiringSoon.isEmpty {
                        useItUpBanner
                    }

                    ForEach(MealType.planSlots) { slot in
                        slotSection(slot)
                    }

                    if !missingForDay.isEmpty {
                        SecondaryButton(
                            title: "Add \(missingForDay.count) missing items to shopping",
                            systemImage: "cart.badge.plus"
                        ) {
                            var added = 0
                            for meal in state.meals(on: selectedDay) {
                                if let recipe = state.recipe(with: meal.recipeID) {
                                    added += state.addMissingToGrocery(from: recipe)
                                }
                            }
                            showToast(added == 0 ? "Already on your list" : "Added \(added) items")
                        }
                    }
                }
                .padding(.horizontal, Metrics.screenPadding)
                .padding(.top, 12)
                .padding(.bottom, Metrics.tabBarInset)
            }
            .screenBackground()
            .toolbar(.hidden, for: .navigationBar)
        }
        .sheet(item: $slotToFill) { slot in
            PickRecipeSheet(slot: slot, day: selectedDay) { message in
                showToast(message)
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
                    .padding(.bottom, Metrics.tabBarInset)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    // MARK: Pieces

    private var greeting: String {
        switch Calendar.current.component(.hour, from: Date()) {
        case 0..<12: return "Good morning"
        case 12..<18: return "Good afternoon"
        default: return "Good evening"
        }
    }

    private var weekStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 9) {
                ForEach(days, id: \.self) { day in
                    DayChip(date: day, isSelected: Calendar.current.isDate(day, inSameDayAs: selectedDay)) {
                        withAnimation(.easeInOut(duration: 0.15)) { selectedDay = day }
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }

    private var dayNutrition: some View {
        let totals = state.nutrition(on: selectedDay)
        let goals = state.preferences

        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(dayTitle)
                        .font(AppFont.sectionTitle)
                        .foregroundStyle(Palette.textPrimary)
                    Text("\(Int(totals.calories)) of \(Int(goals.dailyCalorieGoal)) kcal planned")
                        .font(AppFont.caption)
                        .foregroundStyle(Palette.textSecondary)
                }
                Spacer()
                if !state.meals(on: selectedDay).isEmpty {
                    Menu {
                        Button(role: .destructive) {
                            withAnimation { state.clearPlan(on: selectedDay) }
                        } label: {
                            Label("Clear this day", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.system(size: 18))
                            .foregroundStyle(Palette.textTertiary)
                    }
                }
            }

            HStack(spacing: 14) {
                MacroRing(value: totals.calories, goal: goals.dailyCalorieGoal, tint: Palette.primary,
                          label: "Calories", unit: "kcal", size: 58)
                MacroRing(value: totals.proteinGrams, goal: goals.proteinGoalGrams, tint: Palette.protein,
                          label: "Protein", size: 58)
                MacroRing(value: totals.carbsGrams, goal: goals.carbGoalGrams, tint: Palette.carbs,
                          label: "Carbs", size: 58)
                MacroRing(value: totals.fatGrams, goal: goals.fatGoalGrams, tint: Palette.fat,
                          label: "Fat", size: 58)
                Spacer(minLength: 0)
            }
        }
        .cardStyle()
    }

    private var dayTitle: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(selectedDay) { return "Today" }
        if calendar.isDateInTomorrow(selectedDay) { return "Tomorrow" }
        if calendar.isDateInYesterday(selectedDay) { return "Yesterday" }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE d MMMM"
        return formatter.string(from: selectedDay)
    }

    private var useItUpBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "clock.badge.exclamationmark")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Palette.warning)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(state.expiringSoon.count) items need using up")
                    .font(AppFont.body(14, weight: .semibold))
                    .foregroundStyle(Palette.textPrimary)
                Text(state.expiringSoon.prefix(3).map(\.name).joined(separator: ", "))
                    .font(AppFont.caption)
                    .foregroundStyle(Palette.textSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: Metrics.smallRadius, style: .continuous)
                .fill(Palette.warning.opacity(0.12))
        )
    }

    private var missingForDay: [RecipeIngredient] {
        state.meals(on: selectedDay).flatMap { meal -> [RecipeIngredient] in
            guard let recipe = state.recipe(with: meal.recipeID) else { return [] }
            return recipe.coverage(against: state.pantry).missing
        }
    }

    private func slotSection(_ slot: MealType) -> some View {
        let meals = state.meals(on: selectedDay, slot: slot)

        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(slot.title, systemImage: slot.symbol)
                    .font(AppFont.body(15, weight: .semibold))
                    .foregroundStyle(Palette.textSecondary)
                Spacer()
                Button {
                    Haptics.tap()
                    slotToFill = slot
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 19))
                        .foregroundStyle(Palette.primary)
                }
                .buttonStyle(.plain)
            }

            if meals.isEmpty {
                Button {
                    Haptics.tap()
                    slotToFill = slot
                } label: {
                    HStack {
                        Text("Nothing planned")
                            .font(AppFont.body(14))
                            .foregroundStyle(Palette.textTertiary)
                        Spacer()
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity)
                    .background(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))
                            .foregroundStyle(Palette.separator)
                    )
                }
                .buttonStyle(.plain)
            } else {
                ForEach(meals) { meal in
                    if let recipe = state.recipe(with: meal.recipeID) {
                        NavigationLink {
                            RecipeDetailView(recipeID: recipe.id)
                        } label: {
                            PlannedMealRow(recipe: recipe, meal: meal)
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button(role: .destructive) {
                                withAnimation { state.removePlannedMeal(meal) }
                            } label: {
                                Label("Remove from plan", systemImage: "trash")
                            }
                        }
                    }
                }
            }
        }
    }

    private func showToast(_ message: String) {
        withAnimation { toast = message }
        Task {
            try? await Task.sleep(for: .seconds(1.8))
            withAnimation { toast = nil }
        }
    }
}

private struct PlannedMealRow: View {
    @Environment(AppState.self) private var state
    let recipe: Recipe
    let meal: PlannedMeal

    var body: some View {
        let coverage = recipe.coverage(against: state.pantry)

        return HStack(spacing: 12) {
            RecipeHeroArt(seed: recipe.title, symbol: recipe.safeSymbol, cornerRadius: 14)
                .frame(width: 62, height: 62)

            VStack(alignment: .leading, spacing: 4) {
                Text(recipe.title)
                    .font(AppFont.body(15, weight: .semibold))
                    .foregroundStyle(Palette.textPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                HStack(spacing: 6) {
                    Text("\(meal.servings) serving\(meal.servings == 1 ? "" : "s")")
                    Text("·")
                    Text(recipe.timeLabel)
                    Text("·")
                    Text("\(Int(recipe.nutrition.calories * Double(meal.servings))) kcal")
                }
                .font(AppFont.caption)
                .foregroundStyle(Palette.textSecondary)

                if !coverage.missing.isEmpty {
                    Text("\(coverage.missing.count) to buy")
                        .font(AppFont.body(11, weight: .bold))
                        .foregroundStyle(Palette.warning)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Palette.textTertiary)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Palette.surface)
        )
    }
}

/// Picks an existing recipe for a slot, newest and saved first.
struct PickRecipeSheet: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss

    let slot: MealType
    let day: Date
    var onAdded: (String) -> Void

    @State private var query = ""

    private var candidates: [Recipe] {
        let all = state.recipes.sorted { lhs, rhs in
            if lhs.isFavorite != rhs.isFavorite { return lhs.isFavorite }
            return lhs.createdAt > rhs.createdAt
        }
        let trimmed = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !trimmed.isEmpty else { return all }
        return all.filter { $0.title.lowercased().contains(trimmed) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    SearchField(placeholder: "Search your recipes", text: $query)

                    if candidates.isEmpty {
                        EmptyStateView(
                            systemImage: "sparkles",
                            title: "No recipes yet",
                            message: "Generate a few from your pantry and they'll show up here."
                        )
                    }

                    ForEach(candidates) { recipe in
                        Button {
                            state.plan(
                                recipeID: recipe.id,
                                on: day,
                                slot: slot,
                                servings: state.preferences.defaultServings
                            )
                            onAdded("Added to \(slot.title.lowercased())")
                            dismiss()
                        } label: {
                            RecipeCard(
                                recipe: recipe,
                                coverage: recipe.coverage(against: state.pantry),
                                isCompact: true
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, Metrics.screenPadding)
                .padding(.vertical, 12)
            }
            .screenBackground()
            .navigationTitle("Add \(slot.title.lowercased())")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Palette.textSecondary)
                }
            }
        }
    }
}

#Preview {
    PlanView(onOpenProfile: {})
        .environment(SampleData.previewState())
}
