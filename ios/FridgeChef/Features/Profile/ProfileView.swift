import SwiftUI

struct ProfileView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss

    @State private var isShowingResetAlert = false
    @State private var dislikeDraft = ""

    var body: some View {
        @Bindable var state = state

        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [Palette.primary, Palette.primaryDeep],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 54, height: 54)
                            Image(systemName: "fork.knife")
                                .font(.system(size: 21, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            Text("\(state.pantry.count) ingredients")
                                .font(AppFont.body(16, weight: .semibold))
                            Text("\(state.savedRecipes.count) saved recipes · \(state.plannedMeals.count) meals planned")
                                .font(AppFont.caption)
                                .foregroundStyle(Palette.textSecondary)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section("Cooking") {
                    Stepper("Cook for \(state.preferences.defaultServings)", value: $state.preferences.defaultServings, in: 1...12)
                    Stepper("Up to \(state.preferences.maxCookMinutes) minutes", value: $state.preferences.maxCookMinutes, in: 10...180, step: 5)
                    Picker("Skill", selection: $state.preferences.skill) {
                        ForEach(CookingSkill.allCases) { skill in
                            Text(skill.title).tag(skill)
                        }
                    }
                    Picker("Units", selection: $state.preferences.units) {
                        ForEach(UnitSystem.allCases) { unit in
                            Text(unit.title).tag(unit)
                        }
                    }
                    Toggle("Only cook with what I have", isOn: $state.preferences.strictPantryOnly)
                    if !state.preferences.strictPantryOnly {
                        Stepper(
                            "Allow \(state.preferences.allowedMissingItems) items to buy",
                            value: $state.preferences.allowedMissingItems,
                            in: 1...8
                        )
                    }
                }

                Section("Diet") {
                    chipGroup(options: UserPreferences.dietOptions, selection: $state.preferences.diets)
                }

                Section {
                    chipGroup(options: UserPreferences.allergyOptions, selection: $state.preferences.allergies)
                } header: {
                    Text("Allergies")
                } footer: {
                    Text("Anything ticked here is treated as a hard exclusion — it will never appear in a generated recipe.")
                }

                Section("Dislikes") {
                    HStack {
                        TextField("e.g. coriander", text: $dislikeDraft)
                            .submitLabel(.done)
                            .onSubmit(addDislike)
                        Button("Add", action: addDislike)
                            .disabled(dislikeDraft.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    ForEach(state.preferences.dislikes, id: \.self) { item in
                        Text(item)
                    }
                    .onDelete { offsets in
                        state.preferences.dislikes.remove(atOffsets: offsets)
                    }
                }

                Section("Daily targets") {
                    goalRow("Calories", value: $state.preferences.dailyCalorieGoal, step: 50, unit: "kcal")
                    goalRow("Protein", value: $state.preferences.proteinGoalGrams, step: 5, unit: "g")
                    goalRow("Carbs", value: $state.preferences.carbGoalGrams, step: 5, unit: "g")
                    goalRow("Fat", value: $state.preferences.fatGoalGrams, step: 5, unit: "g")
                }

                Section {
                    SecureField("sk-ant-...", text: $state.apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Picker("Model", selection: $state.model) {
                        ForEach(AnthropicModel.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }
                    Text(state.model.blurb)
                        .font(AppFont.caption)
                        .foregroundStyle(Palette.textSecondary)
                } header: {
                    Text("Anthropic API key")
                } footer: {
                    Text("Stored in the iOS keychain on this device. Scanning and recipe generation both call the Claude API directly — for a shipping app, put a small backend in front of it rather than distributing a key.")
                }

                Section {
                    Button("Clear my pantry", role: .destructive) {
                        state.clearPantry()
                    }
                    Button("Reset everything", role: .destructive) {
                        isShowingResetAlert = true
                    }
                } footer: {
                    Text("Fridge Chef keeps everything on your device. Nothing is uploaded except the photos you choose to scan.")
                }
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        state.saveNow()
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .alert("Reset everything?", isPresented: $isShowingResetAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Reset", role: .destructive) {
                    state.resetEverything()
                    dismiss()
                }
            } message: {
                Text("This clears your pantry, recipes, plan and shopping list. Your API key stays.")
            }
        }
    }

    // MARK: Pieces

    private func chipGroup(options: [String], selection: Binding<[String]>) -> some View {
        FlowLayout(spacing: 8) {
            ForEach(options, id: \.self) { option in
                SelectableChip(title: option, isSelected: selection.wrappedValue.contains(option)) {
                    if let index = selection.wrappedValue.firstIndex(of: option) {
                        selection.wrappedValue.remove(at: index)
                    } else {
                        selection.wrappedValue.append(option)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func goalRow(_ title: String, value: Binding<Double>, step: Double, unit: String) -> some View {
        Stepper(value: value, in: 0...6000, step: step) {
            HStack {
                Text(title)
                Spacer()
                Text("\(Int(value.wrappedValue)) \(unit)")
                    .foregroundStyle(Palette.textSecondary)
            }
        }
    }

    private func addDislike() {
        let trimmed = dislikeDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        state.preferences.dislikes.append(trimmed)
        dislikeDraft = ""
    }
}

#Preview {
    ProfileView()
        .environment(SampleData.previewState())
}
