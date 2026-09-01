import SwiftUI

struct GroceryView: View {
    @Environment(AppState.self) private var state
    let onOpenProfile: () -> Void

    @State private var newItem = ""
    @FocusState private var addFieldFocused: Bool

    private var checkedCount: Int { state.grocery.filter(\.isChecked).count }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                ScreenHeader(
                    eyebrow: "Shopping",
                    title: "Your list",
                    trailing: AnyView(ProfileButton(action: onOpenProfile))
                )

                addRow

                if state.grocery.isEmpty {
                    EmptyStateView(
                        systemImage: "cart",
                        title: "Nothing to buy",
                        message: "Open a recipe and add whatever you're missing — it lands here, sorted by aisle."
                    )
                } else {
                    progressCard

                    ForEach(state.groceryByCategory, id: \.category) { section in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 8) {
                                Image(systemName: section.category.symbol)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(section.category.tint)
                                Text(section.category.title)
                                    .font(AppFont.body(14, weight: .bold))
                                    .foregroundStyle(Palette.textSecondary)
                                Spacer()
                            }
                            VStack(spacing: 0) {
                                ForEach(section.items) { item in
                                    GroceryRow(item: item) {
                                        state.toggleGroceryItem(item)
                                    } onDelete: {
                                        withAnimation { state.removeGroceryItem(item) }
                                    }
                                    if item.id != section.items.last?.id {
                                        Divider().padding(.leading, 46)
                                    }
                                }
                            }
                            .background(
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .fill(Palette.surface)
                            )
                        }
                    }

                    if checkedCount > 0 {
                        VStack(spacing: 10) {
                            PrimaryButton(
                                title: "Move \(checkedCount) into my pantry",
                                systemImage: "arrow.down.circle.fill"
                            ) {
                                withAnimation { state.moveCheckedGroceriesToPantry() }
                            }
                            Button("Just clear the ticked items") {
                                withAnimation { state.clearCheckedGroceries() }
                            }
                            .font(AppFont.body(14, weight: .semibold))
                            .foregroundStyle(Palette.textSecondary)
                        }
                        .padding(.top, 4)
                    }
                }
            }
            .padding(.horizontal, Metrics.screenPadding)
            .padding(.top, 12)
            .padding(.bottom, Metrics.tabBarInset)
        }
        .screenBackground()
    }

    private var addRow: some View {
        HStack(spacing: 10) {
            TextField("Add an item", text: $newItem)
                .font(AppFont.body(15))
                .focused($addFieldFocused)
                .submitLabel(.done)
                .onSubmit(commit)
                .padding(.horizontal, 14)
                .padding(.vertical, 13)
                .background(
                    RoundedRectangle(cornerRadius: Metrics.smallRadius, style: .continuous)
                        .fill(Palette.surface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: Metrics.smallRadius, style: .continuous)
                        .stroke(Palette.separator, lineWidth: 1)
                )

            Button(action: commit) {
                Image(systemName: "plus")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 46, height: 46)
                    .background(
                        RoundedRectangle(cornerRadius: Metrics.smallRadius, style: .continuous)
                            .fill(newItem.isEmpty ? Palette.textTertiary : Palette.primary)
                    )
            }
            .buttonStyle(.plain)
            .disabled(newItem.isEmpty)
        }
    }

    private var progressCard: some View {
        let total = state.grocery.count
        let progress = total == 0 ? 0 : Double(checkedCount) / Double(total)

        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("\(checkedCount) of \(total) picked up")
                    .font(AppFont.body(15, weight: .semibold))
                    .foregroundStyle(Palette.textPrimary)
                Spacer()
                Text("\(Int(progress * 100))%")
                    .font(AppFont.body(15, weight: .bold))
                    .foregroundStyle(Palette.primary)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Palette.surfaceMuted)
                    Capsule().fill(Palette.primary)
                        .frame(width: max(geo.size.width * progress, progress > 0 ? 6 : 0))
                }
            }
            .frame(height: 8)
        }
        .cardStyle(radius: 18, padding: 14)
    }

    private func commit() {
        let trimmed = newItem.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        state.addGroceryItem(name: trimmed, amount: nil, category: IngredientCatalog.category(for: trimmed))
        newItem = ""
        Haptics.tap()
    }
}

private struct GroceryRow: View {
    let item: GroceryItem
    let onToggle: () -> Void
    let onDelete: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 12) {
                Image(systemName: item.isChecked ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 21))
                    .foregroundStyle(item.isChecked ? Palette.primary : Palette.textTertiary)

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name)
                        .font(AppFont.body(15, weight: .medium))
                        .foregroundStyle(item.isChecked ? Palette.textTertiary : Palette.textPrimary)
                        .strikethrough(item.isChecked, color: Palette.textTertiary)
                    if let amount = item.amount, !amount.isEmpty {
                        Text(amount)
                            .font(AppFont.caption)
                            .foregroundStyle(Palette.textSecondary)
                    } else if let source = item.sourceRecipe {
                        Text("for \(source)")
                            .font(AppFont.caption)
                            .foregroundStyle(Palette.textTertiary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(role: .destructive, action: onDelete) {
                Label("Remove", systemImage: "trash")
            }
        }
    }
}

#Preview {
    GroceryView(onOpenProfile: {})
        .environment(SampleData.previewState())
}
