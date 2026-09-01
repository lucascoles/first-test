import SwiftUI

struct PantryView: View {
    @Environment(AppState.self) private var state
    let onScan: () -> Void
    let onOpenProfile: () -> Void

    @State private var query = ""
    @State private var isAddingIngredient = false
    @State private var editingItem: PantryIngredient?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                ScreenHeader(
                    eyebrow: "Your kitchen",
                    title: "Pantry",
                    trailing: AnyView(ProfileButton(action: onOpenProfile))
                )

                SearchField(placeholder: "Search your ingredients", text: $query)

                if state.pantry.isEmpty {
                    EmptyStateView(
                        systemImage: "refrigerator",
                        title: "Your pantry is empty",
                        message: "Scan the fridge and we'll fill this in for you. You can always add things by hand.",
                        actionTitle: "Scan my fridge",
                        action: onScan
                    )
                } else {
                    statsRow

                    if !state.expiringSoon.isEmpty, query.isEmpty {
                        expiringSection
                    }

                    ForEach(filteredSections, id: \.category) { section in
                        VStack(alignment: .leading, spacing: 10) {
                            SectionHeader(
                                title: section.category.title,
                                subtitle: "\(section.items.count) item\(section.items.count == 1 ? "" : "s")"
                            )
                            VStack(spacing: 8) {
                                ForEach(section.items) { item in
                                    PantryRow(item: item) {
                                        editingItem = item
                                    } onDelete: {
                                        withAnimation { state.removeIngredient(item) }
                                    }
                                }
                            }
                        }
                    }

                    if filteredSections.isEmpty {
                        EmptyStateView(
                            systemImage: "magnifyingglass",
                            title: "Nothing matches",
                            message: "No ingredient called “\(query)” in your pantry yet."
                        )
                    }
                }
            }
            .padding(.horizontal, Metrics.screenPadding)
            .padding(.top, 12)
            .padding(.bottom, Metrics.tabBarInset)
        }
        .screenBackground()
        .overlay(alignment: .bottomTrailing) {
            addButton
        }
        .sheet(isPresented: $isAddingIngredient) {
            AddIngredientSheet()
        }
        .sheet(item: $editingItem) { item in
            EditIngredientSheet(item: item)
        }
    }

    // MARK: Pieces

    private var filteredSections: [(category: IngredientCategory, items: [PantryIngredient])] {
        let trimmed = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !trimmed.isEmpty else { return state.pantryByCategory }
        return state.pantryByCategory.compactMap { section in
            let matches = section.items.filter { $0.name.lowercased().contains(trimmed) }
            return matches.isEmpty ? nil : (category: section.category, items: matches)
        }
    }

    private var statsRow: some View {
        HStack(spacing: 12) {
            statCard(value: "\(state.pantry.count)", label: "ingredients", tint: Palette.primary, symbol: "basket")
            statCard(
                value: "\(state.expiringSoon.count)",
                label: "to use up",
                tint: state.expiringSoon.isEmpty ? Palette.textSecondary : Palette.warning,
                symbol: "clock"
            )
            statCard(
                value: "\(state.pantryByCategory.count)",
                label: "categories",
                tint: Palette.carbs,
                symbol: "square.grid.2x2"
            )
        }
    }

    private func statCard(value: String, label: String, tint: Color, symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(tint)
            Text(value)
                .font(AppFont.display(22))
                .foregroundStyle(Palette.textPrimary)
            Text(label)
                .font(AppFont.body(11, weight: .medium))
                .foregroundStyle(Palette.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle(radius: 18, padding: 14)
    }

    private var expiringSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Use these first", subtitle: "Going off in the next couple of days")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(state.expiringSoon) { item in
                        VStack(alignment: .leading, spacing: 8) {
                            Image(systemName: item.category.symbol)
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(item.category.tint)
                            Text(item.name)
                                .font(AppFont.body(14, weight: .semibold))
                                .foregroundStyle(Palette.textPrimary)
                                .lineLimit(1)
                            if let label = item.expiryState.label {
                                Text(label)
                                    .font(AppFont.body(11, weight: .bold))
                                    .foregroundStyle(item.expiryState.tint)
                            }
                        }
                        .frame(width: 128, alignment: .leading)
                        .cardStyle(radius: 18, padding: 14)
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private var addButton: some View {
        Button {
            Haptics.tap()
            isAddingIngredient = true
        } label: {
            HStack(spacing: 7) {
                Image(systemName: "plus")
                    .font(.system(size: 15, weight: .bold))
                Text("Add")
                    .font(AppFont.body(15, weight: .semibold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 18)
            .padding(.vertical, 13)
            .background(Capsule().fill(Palette.textPrimary))
            .shadow(color: Palette.shadow.opacity(0.22), radius: 12, y: 6)
        }
        .buttonStyle(.plain)
        .padding(.trailing, Metrics.screenPadding)
        .padding(.bottom, Metrics.tabBarInset - 8)
    }
}

struct ProfileButton: View {
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            ZStack {
                Circle()
                    .fill(Palette.surface)
                    .frame(width: 42, height: 42)
                    .shadow(color: Palette.shadow.opacity(0.08), radius: 8, y: 3)
                Image(systemName: "person.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Palette.textSecondary)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Profile and settings")
    }
}

private struct PantryRow: View {
    let item: PantryIngredient
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        Button(action: onEdit) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .fill(item.category.tint.opacity(0.16))
                        .frame(width: 38, height: 38)
                    Image(systemName: item.category.symbol)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(item.category.tint)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name)
                        .font(AppFont.body(15, weight: .semibold))
                        .foregroundStyle(Palette.textPrimary)
                    HStack(spacing: 6) {
                        if let quantity = item.displayQuantity {
                            Text(quantity)
                                .font(AppFont.caption)
                                .foregroundStyle(Palette.textSecondary)
                        }
                        if let expiry = item.expiryState.label {
                            if item.displayQuantity != nil {
                                Text("·").foregroundStyle(Palette.textTertiary)
                            }
                            Text(expiry)
                                .font(AppFont.body(11, weight: .bold))
                                .foregroundStyle(item.expiryState.tint)
                        }
                    }
                }

                Spacer(minLength: 0)

                if item.source == .scan {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.textTertiary)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Palette.textTertiary)
            }
            .padding(13)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Palette.surface)
            )
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(action: onEdit) {
                Label("Edit", systemImage: "pencil")
            }
            Button(role: .destructive, action: onDelete) {
                Label("Remove", systemImage: "trash")
            }
        }
    }
}

#Preview {
    PantryView(onScan: {}, onOpenProfile: {})
        .environment(SampleData.previewState())
}
