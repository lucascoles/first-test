import SwiftUI

struct OnboardingView: View {
    @Environment(AppState.self) private var state
    @State private var page = 0

    var body: some View {
        VStack(spacing: 0) {
            TabView(selection: $page) {
                intro
                    .tag(0)
                howItWorks
                    .tag(1)
                quickSetup(state: state)
                    .tag(2)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            HStack(spacing: 7) {
                ForEach(0..<3, id: \.self) { index in
                    Capsule()
                        .fill(index == page ? Palette.primary : Palette.separator)
                        .frame(width: index == page ? 22 : 7, height: 7)
                        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: page)
                }
            }
            .padding(.bottom, 20)

            VStack(spacing: 10) {
                PrimaryButton(title: page == 2 ? "Start cooking" : "Continue") {
                    if page == 2 {
                        state.hasOnboarded = true
                    } else {
                        withAnimation { page += 1 }
                    }
                }
                if page < 2 {
                    Button("Skip") {
                        state.hasOnboarded = true
                    }
                    .font(AppFont.body(15, weight: .medium))
                    .foregroundStyle(Palette.textSecondary)
                }
            }
            .padding(.horizontal, Metrics.screenPadding)
            .padding(.bottom, 28)
        }
        .screenBackground()
    }

    // MARK: Pages

    private var intro: some View {
        page(
            symbol: "refrigerator",
            eyebrow: "Fridge Chef",
            title: "Dinner starts with\nwhat you already have",
            body: "Point your camera at the fridge. We read the shelves, you fix anything we miss, and then we write you recipes worth cooking."
        )
    }

    private var howItWorks: some View {
        VStack(alignment: .leading, spacing: 26) {
            Spacer(minLength: 40)
            Text("Three steps")
                .font(AppFont.body(12, weight: .bold))
                .tracking(1.2)
                .foregroundStyle(Palette.primary)
            Text("How it works")
                .font(AppFont.display(32))
                .foregroundStyle(Palette.textPrimary)

            VStack(alignment: .leading, spacing: 18) {
                step(1, "camera.viewfinder", "Snap the shelves",
                     "One photo of the fridge, another of the cupboard if you like.")
                step(2, "checklist", "Confirm the list",
                     "Untick anything we got wrong, type in what the camera couldn't see.")
                step(3, "sparkles", "Cook something great",
                     "Real recipes built around your ingredients, your time and your diet.")
            }
            Spacer()
        }
        .padding(.horizontal, Metrics.screenPadding + 6)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func quickSetup(state: AppState) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Almost there")
                        .font(AppFont.body(12, weight: .bold))
                        .tracking(1.2)
                        .foregroundStyle(Palette.primary)
                    Text("A couple of details")
                        .font(AppFont.display(30))
                        .foregroundStyle(Palette.textPrimary)
                    Text("You can change all of this later in your profile.")
                        .font(AppFont.body(14))
                        .foregroundStyle(Palette.textSecondary)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("How many are you cooking for?")
                        .font(AppFont.cardTitle)
                        .foregroundStyle(Palette.textPrimary)
                    HStack(spacing: 10) {
                        ForEach([1, 2, 4, 6], id: \.self) { count in
                            SelectableChip(
                                title: count == 6 ? "6+" : "\(count)",
                                isSelected: state.preferences.defaultServings == count
                            ) {
                                state.preferences.defaultServings = count
                            }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("Anything we should work around?")
                        .font(AppFont.cardTitle)
                        .foregroundStyle(Palette.textPrimary)
                    FlowLayout(spacing: 8) {
                        ForEach(UserPreferences.dietOptions, id: \.self) { diet in
                            SelectableChip(title: diet, isSelected: state.preferences.diets.contains(diet)) {
                                toggle(diet, in: &state.preferences.diets)
                            }
                        }
                    }
                }
                Spacer(minLength: 20)
            }
            .padding(.horizontal, Metrics.screenPadding + 6)
            .padding(.top, 50)
        }
    }

    // MARK: Building blocks

    private func page(symbol: String, eyebrow: String, title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer()
            ZStack {
                RoundedRectangle(cornerRadius: 34, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [Palette.primary, Palette.primaryDeep],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 132, height: 132)
                    .shadow(color: Palette.primary.opacity(0.32), radius: 24, y: 12)
                Image(systemName: symbol)
                    .font(.system(size: 56, weight: .light))
                    .foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(eyebrow.uppercased())
                .font(AppFont.body(12, weight: .bold))
                .tracking(1.2)
                .foregroundStyle(Palette.primary)
                .padding(.top, 18)

            Text(title)
                .font(AppFont.display(34))
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)

            Text(body)
                .font(AppFont.body(16))
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer()
            Spacer()
        }
        .padding(.horizontal, Metrics.screenPadding + 6)
    }

    private func step(_ number: Int, _ symbol: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 15, style: .continuous)
                    .fill(Palette.primarySoft)
                    .frame(width: 46, height: 46)
                Image(systemName: symbol)
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(Palette.primary)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text("\(number). \(title)")
                    .font(AppFont.cardTitle)
                    .foregroundStyle(Palette.textPrimary)
                Text(detail)
                    .font(AppFont.body(14))
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func toggle(_ value: String, in list: inout [String]) {
        if let index = list.firstIndex(of: value) {
            list.remove(at: index)
        } else {
            list.append(value)
        }
    }
}

#Preview {
    OnboardingView()
        .environment(AppState(snapshot: AppSnapshot(), apiKey: ""))
}
