import SwiftUI

@main
struct FridgeChefApp: App {
    @State private var state = AppState()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(state)
                .tint(Palette.primary)
        }
        .onChange(of: scenePhase) { _, phase in
            // Flush anything the debounced writer has not committed yet.
            if phase != .active { state.saveNow() }
        }
    }
}

struct RootView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        Group {
            if state.hasOnboarded {
                RootTabView()
            } else {
                OnboardingView()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: state.hasOnboarded)
    }
}
