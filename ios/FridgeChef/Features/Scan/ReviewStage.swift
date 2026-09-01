import SwiftUI

/// The confirmation step. Nothing the camera "saw" reaches the pantry until the
/// user has looked at this list.
struct ReviewStage: View {
    @Environment(AppState.self) private var state
    @Bindable var viewModel: ScanViewModel
    let onCommit: (Int) -> Void

    @State private var manualName: String = ""
    @State private var manualCategory: IngredientCategory = .produce
    @State private var isAddingManually = false
    @FocusState private var manualFieldFocused: Bool

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    summary

                    if !viewModel.notes.isEmpty {
                        noteCard(viewModel.notes)
                    }

                    addManuallyCard

                    LazyVStack(spacing: 10) {
                        ForEach(viewModel.detected) { item in
                            DetectedRow(
                                item: item,
                                onToggle: { viewModel.toggle(item) },
                                onDelete: { viewModel.remove(item) },
                                onChange: { viewModel.update($0) }
                            )
                        }
                    }
                }
                .padding(.horizontal, Metrics.screenPadding)
                .padding(.bottom, 130)
            }

            footer
        }
    }

    // MARK: Pieces

    private var summary: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Found \(viewModel.detected.count) items")
                    .font(AppFont.title(20))
                    .foregroundStyle(Palette.textPrimary)
                Text("Untick anything that isn't right.")
                    .font(AppFont.body(13))
                    .foregroundStyle(Palette.textSecondary)
            }
            Spacer()
            Button(viewModel.selectedCount == viewModel.detected.count ? "None" : "All") {
                viewModel.selectAll(viewModel.selectedCount != viewModel.detected.count)
            }
            .font(AppFont.body(14, weight: .semibold))
            .foregroundStyle(Palette.primary)
        }
        .padding(.top, 6)
    }

    private func noteCard(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "lightbulb")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Palette.warning)
            Text(text)
                .font(AppFont.body(13))
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: Metrics.smallRadius, style: .continuous)
                .fill(Palette.warning.opacity(0.10))
        )
    }

    private var addManuallyCard: some View {
        VStack(spacing: 12) {
            if isAddingManually {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        TextField("e.g. Half a lemon", text: $manualName)
                            .font(AppFont.body(15))
                            .focused($manualFieldFocused)
                            .submitLabel(.done)
                            .onSubmit(commitManual)
                            .onChange(of: manualName) { _, value in
                                manualCategory = IngredientCatalog.category(for: value)
                            }
                        Button("Add", action: commitManual)
                            .font(AppFont.body(15, weight: .semibold))
                            .foregroundStyle(manualName.isEmpty ? Palette.textTertiary : Palette.primary)
                            .disabled(manualName.isEmpty)
                    }

                    let suggestions = IngredientCatalog.suggestions(for: manualName, limit: 6)
                    if !suggestions.isEmpty {
                        FlowLayout(spacing: 8) {
                            ForEach(suggestions) { suggestion in
                                SelectableChip(title: suggestion.name, isSelected: false) {
                                    viewModel.addManualItem(name: suggestion.name, category: suggestion.category)
                                    manualName = ""
                                }
                            }
                        }
                    }
                }
            } else {
                Button {
                    withAnimation { isAddingManually = true }
                    manualFieldFocused = true
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 17))
                        Text("Add something we missed")
                            .font(AppFont.body(15, weight: .semibold))
                        Spacer()
                    }
                    .foregroundStyle(Palette.primary)
                }
                .buttonStyle(.plain)
            }
        }
        .cardStyle(padding: 14)
    }

    private var footer: some View {
        VStack(spacing: 0) {
            LinearGradient(colors: [Palette.canvas.opacity(0), Palette.canvas], startPoint: .top, endPoint: .bottom)
                .frame(height: 22)
            PrimaryButton(
                title: viewModel.selectedCount == 0
                    ? "Select something to add"
                    : "Add \(viewModel.selectedCount) to pantry",
                systemImage: "tray.and.arrow.down.fill",
                isEnabled: viewModel.selectedCount > 0
            ) {
                let count = viewModel.commit(to: state)
                onCommit(count)
            }
            .padding(.horizontal, Metrics.screenPadding)
            .padding(.bottom, 22)
            .background(Palette.canvas)
        }
    }

    private func commitManual() {
        viewModel.addManualItem(name: manualName, category: manualCategory)
        manualName = ""
    }
}

/// One reviewable row: tick box, name, editable amount and a confidence badge.
private struct DetectedRow: View {
    let item: DetectedIngredient
    let onToggle: () -> Void
    let onDelete: () -> Void
    let onChange: (DetectedIngredient) -> Void

    @State private var isEditing = false
    @State private var draftQuantity: String = ""

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onToggle) {
                Image(systemName: item.isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundStyle(item.isSelected ? Palette.primary : Palette.textTertiary)
            }
            .buttonStyle(.plain)

            ZStack {
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .fill(item.category.tint.opacity(0.16))
                    .frame(width: 38, height: 38)
                Image(systemName: item.category.symbol)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(item.category.tint)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(item.name)
                    .font(AppFont.body(15, weight: .semibold))
                    .foregroundStyle(Palette.textPrimary)
                HStack(spacing: 6) {
                    if isEditing {
                        TextField("Amount", text: $draftQuantity)
                            .font(AppFont.caption)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 110)
                            .onSubmit(commitQuantity)
                    } else {
                        Text(displayDetail)
                            .font(AppFont.caption)
                            .foregroundStyle(Palette.textSecondary)
                    }
                    Text("·")
                        .foregroundStyle(Palette.textTertiary)
                    Text(item.confidenceLabel)
                        .font(AppFont.body(11, weight: .semibold))
                        .foregroundStyle(item.confidenceTint)
                }
            }

            Spacer(minLength: 0)

            Menu {
                Button(isEditing ? "Done editing" : "Edit amount") {
                    if isEditing {
                        commitQuantity()
                    } else {
                        draftQuantity = [item.quantity, item.unit].compactMap { $0 }.joined(separator: " ")
                        isEditing = true
                    }
                }
                Button("Remove", role: .destructive, action: onDelete)
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.textTertiary)
                    .frame(width: 30, height: 30)
                    .contentShape(Rectangle())
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Palette.surface)
                .opacity(item.isSelected ? 1 : 0.6)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(item.isSelected ? Palette.primary.opacity(0.35) : Palette.separator, lineWidth: 1)
        )
    }

    private var displayDetail: String {
        let amount = [item.quantity, item.unit].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
        return amount.isEmpty ? item.category.title : amount
    }

    private func commitQuantity() {
        var updated = item
        let parts = draftQuantity.split(separator: " ", maxSplits: 1).map(String.init)
        updated.quantity = parts.first
        updated.unit = parts.count > 1 ? parts[1] : nil
        onChange(updated)
        isEditing = false
    }
}
