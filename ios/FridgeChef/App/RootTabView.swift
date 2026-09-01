import SwiftUI

enum AppTab: String, CaseIterable, Identifiable {
    case plan
    case recipes
    case pantry
    case shop

    var id: String { rawValue }

    var title: String {
        switch self {
        case .plan: return "Plan"
        case .recipes: return "Recipes"
        case .pantry: return "Pantry"
        case .shop: return "Shop"
        }
    }

    var symbol: String {
        switch self {
        case .plan: return "calendar"
        case .recipes: return "book.closed"
        case .pantry: return "refrigerator"
        case .shop: return "cart"
        }
    }
}

struct RootTabView: View {
    @Environment(AppState.self) private var state
    @State private var selection: AppTab = .plan
    @State private var isScanning = false
    @State private var isShowingProfile = false

    var body: some View {
        ZStack(alignment: .bottom) {
            Palette.canvas.ignoresSafeArea()

            Group {
                switch selection {
                case .plan:
                    PlanView(onOpenProfile: { isShowingProfile = true })
                case .recipes:
                    RecipesView(onOpenProfile: { isShowingProfile = true })
                case .pantry:
                    PantryView(onScan: { isScanning = true }, onOpenProfile: { isShowingProfile = true })
                case .shop:
                    GroceryView(onOpenProfile: { isShowingProfile = true })
                }
            }
            .transition(.opacity)

            AppTabBar(selection: $selection, onScan: { isScanning = true })
        }
        .animation(.easeInOut(duration: 0.18), value: selection)
        .fullScreenCover(isPresented: $isScanning) {
            ScanFlowView()
        }
        .sheet(isPresented: $isShowingProfile) {
            ProfileView()
        }
    }
}

/// Floating tab bar with a raised camera action in the middle — scanning the
/// fridge is the app's headline gesture, so it gets the most reachable spot.
struct AppTabBar: View {
    @Binding var selection: AppTab
    let onScan: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            tabButton(.plan)
            tabButton(.recipes)
            scanButton
            tabButton(.pantry)
            tabButton(.shop)
        }
        .padding(.horizontal, 8)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Palette.surface)
                .shadow(color: Palette.shadow.opacity(0.14), radius: 22, x: 0, y: 10)
        )
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
    }

    private func tabButton(_ tab: AppTab) -> some View {
        Button {
            Haptics.tap()
            selection = tab
        } label: {
            VStack(spacing: 4) {
                Image(systemName: tab.symbol)
                    .font(.system(size: 19, weight: selection == tab ? .semibold : .regular))
                    .symbolVariant(selection == tab ? .fill : .none)
                Text(tab.title)
                    .font(AppFont.body(10, weight: .semibold))
            }
            .foregroundStyle(selection == tab ? Palette.primary : Palette.textTertiary)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tab.title)
    }

    private var scanButton: some View {
        Button {
            Haptics.tap()
            onScan()
        } label: {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Palette.primary, Palette.primaryDeep],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(width: 58, height: 58)
                    .shadow(color: Palette.primary.opacity(0.4), radius: 12, x: 0, y: 6)
                Image(systemName: "camera.viewfinder")
                    .font(.system(size: 23, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .offset(y: -14)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Scan my fridge")
    }
}

#Preview {
    RootTabView()
        .environment(SampleData.previewState())
}
