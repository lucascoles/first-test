import SwiftUI

struct AddToPlanSheet: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss

    let recipe: Recipe
    var onAdded: (String) -> Void

    @State private var selectedDay: Date = Calendar.current.startOfDay(for: Date())
    @State private var slot: MealType = .dinner
    @State private var servings: Int = 2

    private var days: [Date] {
        let today = Calendar.current.startOfDay(for: Date())
        return (0..<14).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: today) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(spacing: 12) {
                        RecipeHeroArt(seed: recipe.title, symbol: recipe.safeSymbol, cornerRadius: 14)
                            .frame(width: 58, height: 58)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(recipe.title)
                                .font(AppFont.body(15, weight: .semibold))
                                .foregroundStyle(Palette.textPrimary)
                                .lineLimit(2)
                            Text("\(recipe.timeLabel) · \(Int(recipe.nutrition.calories)) kcal per serving")
                                .font(AppFont.caption)
                                .foregroundStyle(Palette.textSecondary)
                        }
                        Spacer(minLength: 0)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Which day?")
                            .font(AppFont.sectionTitle)
                            .foregroundStyle(Palette.textPrimary)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 9) {
                                ForEach(days, id: \.self) { day in
                                    DayChip(date: day, isSelected: Calendar.current.isDate(day, inSameDayAs: selectedDay)) {
                                        selectedDay = day
                                    }
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Which meal?")
                            .font(AppFont.sectionTitle)
                            .foregroundStyle(Palette.textPrimary)
                        FlowLayout(spacing: 8) {
                            ForEach(MealType.planSlots) { option in
                                SelectableChip(title: option.title, isSelected: slot == option, systemImage: option.symbol) {
                                    slot = option
                                }
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("How many servings?")
                            .font(AppFont.sectionTitle)
                            .foregroundStyle(Palette.textPrimary)
                        HStack(spacing: 10) {
                            ForEach([1, 2, 3, 4, 6], id: \.self) { count in
                                SelectableChip(title: "\(count)", isSelected: servings == count) {
                                    servings = count
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, Metrics.screenPadding)
                .padding(.top, 8)
                .padding(.bottom, 100)
            }
            .screenBackground()
            .safeAreaInset(edge: .bottom) {
                PrimaryButton(title: "Add to plan", systemImage: "calendar.badge.plus") {
                    state.plan(recipeID: recipe.id, on: selectedDay, slot: slot, servings: servings)
                    onAdded("Added to \(Self.relativeName(for: selectedDay))")
                    dismiss()
                }
                .padding(.horizontal, Metrics.screenPadding)
                .padding(.vertical, 14)
                .background(.regularMaterial)
            }
            .navigationTitle("Add to plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            .onAppear {
                servings = state.preferences.defaultServings
                slot = recipe.mealType == .dessert ? .snack : recipe.mealType
            }
        }
        .presentationDetents([.large])
    }

    static func relativeName(for date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "today" }
        if calendar.isDateInTomorrow(date) { return "tomorrow" }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE"
        return formatter.string(from: date)
    }
}

struct DayChip: View {
    let date: Date
    let isSelected: Bool
    let action: () -> Void

    private var weekday: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE"
        return formatter.string(from: date).uppercased()
    }

    private var dayNumber: String {
        "\(Calendar.current.component(.day, from: date))"
    }

    private var isToday: Bool { Calendar.current.isDateInToday(date) }

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            VStack(spacing: 4) {
                Text(weekday)
                    .font(AppFont.body(10, weight: .bold))
                    .foregroundStyle(isSelected ? .white.opacity(0.8) : Palette.textTertiary)
                Text(dayNumber)
                    .font(AppFont.body(17, weight: .bold))
                    .foregroundStyle(isSelected ? .white : Palette.textPrimary)
                Circle()
                    .fill(isToday ? (isSelected ? Color.white : Palette.primary) : .clear)
                    .frame(width: 4, height: 4)
            }
            .frame(width: 52, height: 68)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(isSelected ? Palette.primary : Palette.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(isSelected ? Color.clear : Palette.separator, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
