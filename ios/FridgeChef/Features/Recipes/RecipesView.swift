import SwiftUI

struct RecipesView: View {
    @Environment(AppState.self) private var state
    let onOpenProfile: () -> Void

    enum Filter: String, CaseIterable, Identifiable {
        case forYou = "For you"
        case saved = "Saved"
        var id: String { rawValue }
    }

    @State private var filter: Filter = .forYou
    @State private var isShowingGenerator = false
    @State private var isGenerating = false
    @State private var errorMessage: String?
    @State private var statusLine = "Reading your pantry…"
    @State private var statusTask: Task<Void, Never>?

    private var displayed: [Recipe] {
        filter == .saved ? state.savedRecipes : state.recentRecipes
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ScreenHeader(
                        eyebrow: "Cook tonight",
                        title: "Recipes",
                        trailing: AnyView(ProfileButton(action: onOpenProfile))
                    )

                    generateCard

                    Picker("Filter", selection: $filter) {
                        ForEach(Filter.allCases) { option in
                            Text(option.rawValue).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)

                    if isGenerating {
                        generatingBlock
                    }

                    if let errorMessage {
                        ErrorBanner(message: errorMessage) {
                            self.errorMessage = nil
                        }
                    }

                    if displayed.isEmpty, !isGenerating {
                        if filter == .saved {
                            EmptyStateView(
                                systemImage: "heart",
                                title: "Nothing saved yet",
                                message: "Tap the heart on a recipe you like and it will wait for you here."
                            )
                        } else {
                            EmptyStateView(
                                systemImage: "sparkles",
                                title: "No recipes yet",
                                message: "Tell us what you fancy and we'll build something around what's in your pantry.",
                                actionTitle: "Generate recipes",
                                action: { isShowingGenerator = true }
                            )
                        }
                    }

                    LazyVStack(spacing: Metrics.cardSpacing) {
                        ForEach(displayed) { recipe in
                            NavigationLink {
                                RecipeDetailView(recipeID: recipe.id)
                            } label: {
                                RecipeCard(
                                    recipe: recipe,
                                    coverage: recipe.coverage(against: state.pantry),
                                    onFavorite: { state.toggleFavorite(recipe) }
                                )
                            }
                            .buttonStyle(.plain)
                            .contextMenu {
                                Button {
                                    state.toggleFavorite(recipe)
                                } label: {
                                    Label(
                                        recipe.isFavorite ? "Remove from saved" : "Save recipe",
                                        systemImage: recipe.isFavorite ? "heart.slash" : "heart"
                                    )
                                }
                                Button(role: .destructive) {
                                    state.deleteRecipe(recipe)
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
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
        .sheet(isPresented: $isShowingGenerator) {
            GenerateSheet { request in
                Task { await generate(request) }
            }
        }
    }

    // MARK: Pieces

    private var generateCard: some View {
        Button {
            Haptics.tap()
            isShowingGenerator = true
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [Palette.primary, Palette.primaryDeep],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 52, height: 52)
                    Image(systemName: "sparkles")
                        .font(.system(size: 21, weight: .semibold))
                        .foregroundStyle(.white)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text("Generate from my pantry")
                        .font(AppFont.cardTitle)
                        .foregroundStyle(Palette.textPrimary)
                    Text(state.pantry.isEmpty
                         ? "Add ingredients first for the best results"
                         : "\(state.pantry.count) ingredients ready to cook with")
                        .font(AppFont.body(13))
                        .foregroundStyle(Palette.textSecondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Palette.textTertiary)
            }
            .cardStyle()
        }
        .buttonStyle(.plain)
    }

    private var generatingBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                ProgressView().tint(Palette.primary)
                Text(statusLine)
                    .font(AppFont.body(14, weight: .semibold))
                    .foregroundStyle(Palette.textPrimary)
                    .animation(.easeInOut, value: statusLine)
                Spacer()
            }
            ShimmerCard()
            ShimmerCard()
        }
    }

    // MARK: Generation

    private func generate(_ request: RecipeRequest) async {
        guard state.isConfigured else {
            errorMessage = AnthropicError.missingAPIKey.localizedDescription
            return
        }

        errorMessage = nil
        isGenerating = true
        filter = .forYou
        startStatusRotation()
        defer {
            statusTask?.cancel()
            isGenerating = false
        }

        do {
            let recipes = try await state.recipeService.generate(
                request: request,
                pantry: state.pantry,
                preferences: state.preferences
            )
            guard !recipes.isEmpty else {
                errorMessage = "The model didn't return any recipes. Try again with a looser time limit."
                return
            }
            withAnimation { state.addRecipes(recipes) }
            Haptics.success()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func startStatusRotation() {
        let lines = [
            "Reading your pantry…",
            "Pairing flavours…",
            "Balancing the macros…",
            "Writing the method…"
        ]
        statusTask?.cancel()
        statusLine = lines[0]
        statusTask = Task {
            var index = 1
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                guard !Task.isCancelled else { return }
                statusLine = lines[index % lines.count]
                index += 1
            }
        }
    }
}

struct ErrorBanner: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 15))
                .foregroundStyle(Palette.danger)
            Text(message)
                .font(AppFont.body(13))
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Palette.textTertiary)
            }
            .buttonStyle(.plain)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: Metrics.smallRadius, style: .continuous)
                .fill(Palette.danger.opacity(0.10))
        )
    }
}

#Preview {
    RecipesView(onOpenProfile: {})
        .environment(SampleData.previewState())
}
