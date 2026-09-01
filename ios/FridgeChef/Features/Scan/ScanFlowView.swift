import SwiftUI
import PhotosUI
import UIKit

struct ScanFlowView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss

    @State private var viewModel = ScanViewModel()
    @State private var isShowingCamera = false
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var addedToast: String?

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                Palette.canvas.ignoresSafeArea()

                switch viewModel.stage {
                case .capture:
                    captureStage
                case .analyzing:
                    analyzingStage
                case .review:
                    ReviewStage(viewModel: viewModel) { count in
                        addedToast = count == 1 ? "1 ingredient added" : "\(count) ingredients added"
                        Task {
                            try? await Task.sleep(for: .seconds(1.1))
                            dismiss()
                        }
                    }
                case .failed(let message):
                    failureStage(message)
                }

                if let addedToast {
                    toast(addedToast)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(Palette.textSecondary)
                    }
                }
                if viewModel.stage == .review {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Rescan") { viewModel.reset() }
                            .font(AppFont.body(15, weight: .semibold))
                            .foregroundStyle(Palette.primary)
                    }
                }
            }
        }
        .fullScreenCover(isPresented: $isShowingCamera) {
            CameraPicker { image in
                viewModel.add(image: image)
            }
            .ignoresSafeArea()
        }
        .onChange(of: pickerItems) { _, items in
            guard !items.isEmpty else { return }
            Task { await load(items) }
        }
    }

    private var title: String {
        switch viewModel.stage {
        case .capture: return "Scan ingredients"
        case .analyzing: return "Reading your photo"
        case .review: return "Confirm the list"
        case .failed: return "Scan"
        }
    }

    // MARK: - Capture

    private var captureStage: some View {
        ScrollView {
            VStack(spacing: 20) {
                cameraFrame

                if !viewModel.images.isEmpty {
                    thumbnails
                }

                VStack(spacing: 12) {
                    PrimaryButton(
                        title: viewModel.images.isEmpty ? "Take a photo" : "Read my ingredients",
                        systemImage: viewModel.images.isEmpty ? "camera.fill" : "sparkles",
                        isEnabled: true
                    ) {
                        if viewModel.images.isEmpty {
                            openCamera()
                        } else {
                            Task { await viewModel.analyze(using: state) }
                        }
                    }

                    HStack(spacing: 12) {
                        if !viewModel.images.isEmpty, viewModel.images.count < ScanViewModel.maxImages {
                            Button {
                                openCamera()
                            } label: {
                                secondaryLabel("camera", "Another photo")
                            }
                            .buttonStyle(.plain)
                        }

                        PhotosPicker(
                            selection: $pickerItems,
                            maxSelectionCount: ScanViewModel.maxImages - viewModel.images.count,
                            matching: .images,
                            photoLibrary: .shared()
                        ) {
                            secondaryLabel("photo.on.rectangle", "From library")
                        }
                        .disabled(viewModel.images.count >= ScanViewModel.maxImages)
                    }
                }

                tipsCard
            }
            .padding(.horizontal, Metrics.screenPadding)
            .padding(.bottom, 32)
        }
    }

    private var cameraFrame: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Palette.primary.opacity(0.16), Palette.primary.opacity(0.05)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [9, 7]))
                .foregroundStyle(Palette.primary.opacity(0.45))

            VStack(spacing: 10) {
                Image(systemName: "refrigerator")
                    .font(.system(size: 46, weight: .light))
                    .foregroundStyle(Palette.primary)
                Text("Open the door, step back a little")
                    .font(AppFont.title(17))
                    .foregroundStyle(Palette.textPrimary)
                Text("One clear photo of the shelves is usually enough.\nAdd more for the door, freezer or cupboard.")
                    .font(AppFont.body(13))
                    .foregroundStyle(Palette.textSecondary)
                    .multilineTextAlignment(.center)
            }
            .padding(24)
        }
        .frame(height: 250)
        .padding(.top, 8)
    }

    private var thumbnails: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(Array(viewModel.images.enumerated()), id: \.offset) { index, image in
                    ZStack(alignment: .topTrailing) {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 92, height: 92)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        Button {
                            viewModel.removeImage(at: index)
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 19))
                                .foregroundStyle(.white, .black.opacity(0.45))
                        }
                        .buttonStyle(.plain)
                        .padding(5)
                    }
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private var tipsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("For the best read")
                .font(AppFont.label)
                .foregroundStyle(Palette.textSecondary)
            tip("Turn the light on — the fridge bulb is usually enough.")
            tip("Pull tall bottles forward so nothing hides behind them.")
            tip("Anything the camera can't see, you can type in next.")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle()
    }

    private func tip(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 13))
                .foregroundStyle(Palette.primary)
                .padding(.top, 1)
            Text(text)
                .font(AppFont.body(13))
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func secondaryLabel(_ symbol: String, _ title: String) -> some View {
        HStack(spacing: 7) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .semibold))
            Text(title)
                .font(AppFont.body(15, weight: .semibold))
        }
        .foregroundStyle(Palette.primaryDeep)
        .frame(maxWidth: .infinity)
        .frame(height: 48)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Palette.primarySoft)
        )
    }

    // MARK: - Analyzing

    private var analyzingStage: some View {
        VStack(spacing: 22) {
            Spacer()
            if let first = viewModel.images.first {
                Image(uiImage: first)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 200, height: 200)
                    .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 26, style: .continuous)
                            .stroke(Palette.primary.opacity(0.5), lineWidth: 2)
                    )
                    .overlay { ScannerBeam() }
                    .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            }
            VStack(spacing: 6) {
                Text(viewModel.statusLine)
                    .font(AppFont.title(18))
                    .foregroundStyle(Palette.textPrimary)
                    .contentTransition(.opacity)
                    .animation(.easeInOut, value: viewModel.statusLine)
                Text("This usually takes a few seconds.")
                    .font(AppFont.body(13))
                    .foregroundStyle(Palette.textSecondary)
            }
            ProgressView()
                .tint(Palette.primary)
            Spacer()
            Spacer()
        }
        .padding(.horizontal, Metrics.screenPadding)
    }

    // MARK: - Failure

    private func failureStage(_ message: String) -> some View {
        VStack(spacing: 18) {
            Spacer()
            EmptyStateView(
                systemImage: "exclamationmark.triangle",
                title: "That didn't work",
                message: message
            )
            VStack(spacing: 10) {
                PrimaryButton(title: "Try again", systemImage: "arrow.clockwise") {
                    viewModel.backToCapture()
                }
                SecondaryButton(title: "See a sample scan", systemImage: "eye") {
                    viewModel.loadSample()
                }
            }
            Spacer()
        }
        .padding(.horizontal, Metrics.screenPadding)
    }

    // MARK: - Helpers

    private func openCamera() {
        if CameraPicker.isAvailable {
            isShowingCamera = true
        } else {
            // Simulators and iPads without a camera fall back to the library.
            addedToast = "No camera here — pick a photo instead"
            Task {
                try? await Task.sleep(for: .seconds(1.6))
                addedToast = nil
            }
        }
    }

    private func load(_ items: [PhotosPickerItem]) async {
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                viewModel.add(image: image)
            }
        }
        pickerItems = []
    }

    private func toast(_ message: String) -> some View {
        Text(message)
            .font(AppFont.body(14, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(Capsule().fill(Palette.textPrimary.opacity(0.92)))
            .padding(.bottom, 30)
            .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

/// Sweeping highlight over the thumbnail while the model reads the photo.
private struct ScannerBeam: View {
    @State private var offset: CGFloat = -100

    var body: some View {
        LinearGradient(
            colors: [.clear, Palette.primary.opacity(0.55), .clear],
            startPoint: .top,
            endPoint: .bottom
        )
        .frame(height: 70)
        .offset(y: offset)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) {
                offset = 100
            }
        }
    }
}

#Preview {
    ScanFlowView()
        .environment(SampleData.previewState())
}
