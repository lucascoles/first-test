import SwiftUI
import UIKit

/// Manual entry for whatever the camera could not see. Optimised for adding
/// several things in a row without dismissing the sheet.
struct AddIngredientSheet: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var quantity = ""
    @State private var unit = ""
    @State private var category: IngredientCategory = .produce
    @State private var hasExpiry = false
    @State private var expiresOn = Calendar.current.date(byAdding: .day, value: 5, to: Date()) ?? Date()
    @State private var staged: [PantryIngredient] = []
    @FocusState private var nameFocused: Bool

    private var suggestions: [IngredientCatalog.Entry] {
        IngredientCatalog.suggestions(for: name, limit: 8)
    }

    private var canAdd: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    field

                    if !suggestions.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Did you mean")
                                .font(AppFont.label)
                                .foregroundStyle(Palette.textSecondary)
                            FlowLayout(spacing: 8) {
                                ForEach(suggestions) { suggestion in
                                    SelectableChip(title: suggestion.name, isSelected: false) {
                                        name = suggestion.name
                                        category = suggestion.category
                                    }
                                }
                            }
                        }
                    }

                    amountRow
                    categoryPicker
                    expiryRow

                    if name.isEmpty, staged.isEmpty {
                        quickStaples
                    }

                    if !staged.isEmpty {
                        stagedList
                    }
                }
                .padding(.horizontal, Metrics.screenPadding)
                .padding(.top, 8)
                .padding(.bottom, 120)
            }
            .screenBackground()
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 10) {
                    PrimaryButton(
                        title: staged.isEmpty ? "Add to pantry" : "Add \(staged.count + (canAdd ? 1 : 0)) to pantry",
                        systemImage: "tray.and.arrow.down.fill",
                        isEnabled: canAdd || !staged.isEmpty
                    ) {
                        commitAll()
                    }
                    if canAdd {
                        Button("Save and add another") {
                            stageCurrent()
                        }
                        .font(AppFont.body(15, weight: .semibold))
                        .foregroundStyle(Palette.primary)
                    }
                }
                .padding(.horizontal, Metrics.screenPadding)
                .padding(.vertical, 14)
                .background(.regularMaterial)
            }
            .navigationTitle("Add ingredient")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            .onAppear { nameFocused = true }
        }
    }

    // MARK: Pieces

    private var field: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("What is it?")
                .font(AppFont.label)
                .foregroundStyle(Palette.textSecondary)
            TextField("e.g. Sweet potato", text: $name)
                .font(AppFont.body(17, weight: .medium))
                .focused($nameFocused)
                .submitLabel(.next)
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: Metrics.smallRadius, style: .continuous)
                        .fill(Palette.surface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: Metrics.smallRadius, style: .continuous)
                        .stroke(Palette.separator, lineWidth: 1)
                )
                .onChange(of: name) { _, value in
                    guard !value.isEmpty else { return }
                    category = IngredientCatalog.category(for: value)
                }
        }
    }

    private var amountRow: some View {
        HStack(spacing: 12) {
            labelledField("How much", placeholder: "2", text: $quantity, keyboard: .decimalPad)
            labelledField("Unit", placeholder: "kg, tin, bag", text: $unit, keyboard: .default)
        }
    }

    private func labelledField(
        _ title: String,
        placeholder: String,
        text: Binding<String>,
        keyboard: UIKeyboardType
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(AppFont.label)
                .foregroundStyle(Palette.textSecondary)
            TextField(placeholder, text: text)
                .font(AppFont.body(15))
                .keyboardType(keyboard)
                .padding(13)
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

    private var categoryPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Where does it live?")
                .font(AppFont.label)
                .foregroundStyle(Palette.textSecondary)
            FlowLayout(spacing: 8) {
                ForEach(IngredientCategory.allCases) { option in
                    SelectableChip(
                        title: option.title,
                        isSelected: category == option,
                        systemImage: option.symbol
                    ) {
                        category = option
                    }
                }
            }
        }
    }

    private var expiryRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(isOn: $hasExpiry.animation()) {
                Text("Track a use-by date")
                    .font(AppFont.body(15, weight: .medium))
                    .foregroundStyle(Palette.textPrimary)
            }
            .tint(Palette.primary)

            if hasExpiry {
                DatePicker("Use by", selection: $expiresOn, displayedComponents: .date)
                    .datePickerStyle(.compact)
                    .font(AppFont.body(15))
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: Metrics.smallRadius, style: .continuous)
                .fill(Palette.surface)
        )
    }

    private var quickStaples: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Kitchen staples")
                .font(AppFont.label)
                .foregroundStyle(Palette.textSecondary)
            FlowLayout(spacing: 8) {
                ForEach(IngredientCatalog.commonStaples) { staple in
                    SelectableChip(
                        title: staple.name,
                        isSelected: state.pantry.contains { $0.matchKey == IngredientMatcher.normalize(staple.name) },
                        systemImage: "plus"
                    ) {
                        state.addIngredients([
                            PantryIngredient(name: staple.name, category: staple.category, isStaple: true, source: .staple)
                        ])
                    }
                }
            }
        }
    }

    private var stagedList: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Ready to add")
                .font(AppFont.label)
                .foregroundStyle(Palette.textSecondary)
            ForEach(staged) { item in
                HStack(spacing: 10) {
                    Image(systemName: item.category.symbol)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(item.category.tint)
                    Text(item.name)
                        .font(AppFont.body(14, weight: .medium))
                        .foregroundStyle(Palette.textPrimary)
                    if let quantity = item.displayQuantity {
                        Text(quantity)
                            .font(AppFont.caption)
                            .foregroundStyle(Palette.textSecondary)
                    }
                    Spacer()
                    Button {
                        staged.removeAll { $0.id == item.id }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(Palette.textTertiary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(Palette.surfaceMuted)
                )
            }
        }
    }

    // MARK: Actions

    private func makeIngredient() -> PantryIngredient {
        PantryIngredient(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            quantity: quantity.isEmpty ? nil : quantity,
            unit: unit.isEmpty ? nil : unit,
            category: category,
            expiresOn: hasExpiry ? expiresOn : nil,
            source: .manual
        )
    }

    private func clearForm() {
        name = ""
        quantity = ""
        unit = ""
        hasExpiry = false
        nameFocused = true
    }

    private func stageCurrent() {
        guard canAdd else { return }
        staged.append(makeIngredient())
        Haptics.tap()
        clearForm()
    }

    private func commitAll() {
        var items = staged
        if canAdd { items.append(makeIngredient()) }
        guard !items.isEmpty else { return }
        state.addIngredients(items)
        Haptics.success()
        dismiss()
    }
}

/// Editing an existing pantry row.
struct EditIngredientSheet: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss

    @State private var draft: PantryIngredient
    @State private var quantity: String
    @State private var unit: String
    @State private var hasExpiry: Bool
    @State private var expiresOn: Date

    init(item: PantryIngredient) {
        _draft = State(initialValue: item)
        _quantity = State(initialValue: item.quantity ?? "")
        _unit = State(initialValue: item.unit ?? "")
        _hasExpiry = State(initialValue: item.expiresOn != nil)
        _expiresOn = State(initialValue: item.expiresOn ?? Calendar.current.date(byAdding: .day, value: 5, to: Date()) ?? Date())
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Ingredient") {
                    TextField("Name", text: $draft.name)
                    HStack {
                        TextField("Amount", text: $quantity)
                            .keyboardType(.decimalPad)
                        Divider()
                        TextField("Unit", text: $unit)
                    }
                    Picker("Category", selection: $draft.category) {
                        ForEach(IngredientCategory.allCases) { option in
                            Label(option.title, systemImage: option.symbol).tag(option)
                        }
                    }
                }

                Section("Freshness") {
                    Toggle("Track a use-by date", isOn: $hasExpiry.animation())
                    if hasExpiry {
                        DatePicker("Use by", selection: $expiresOn, displayedComponents: .date)
                    }
                }

                Section {
                    Button("Remove from pantry", role: .destructive) {
                        state.removeIngredient(draft)
                        dismiss()
                    }
                }
            }
            .navigationTitle("Edit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        draft.quantity = quantity.isEmpty ? nil : quantity
                        draft.unit = unit.isEmpty ? nil : unit
                        draft.expiresOn = hasExpiry ? expiresOn : nil
                        state.updateIngredient(draft)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

#Preview {
    AddIngredientSheet()
        .environment(SampleData.previewState())
}
