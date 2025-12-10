import SwiftUI

@main
struct FinFlowServerManagerApp: App {
    @StateObject private var serverManager = ServerManager()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(serverManager)
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 900, height: 750)
    }
}
