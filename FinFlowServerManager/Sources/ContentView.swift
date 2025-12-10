import SwiftUI

struct ContentView: View {
    @EnvironmentObject var serverManager: ServerManager
    
    var body: some View {
        ZStack {
            // Background
            Color(hex: "1a1a2e")
                .ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Title Bar
                TitleBar()
                
                // Main Content
                ScrollView {
                    VStack(spacing: 16) {
                        // Server Sections
                        ServerSection(type: .backend)
                        ServerSection(type: .frontend)
                        
                        // Logs Section
                        LogsSection()
                        
                        // Quick Actions
                        QuickActionsBar()
                    }
                    .padding(20)
                }
            }
        }
        .onDisappear {
            serverManager.shutdown()
        }
    }
}

// MARK: - Title Bar

struct TitleBar: View {
    var body: some View {
        VStack(spacing: 4) {
            Text("💰 FinFlow Server Manager")
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(Color(hex: "6ee7b7"))
            
            Text("Manage your Finance Tracker servers")
                .font(.system(size: 13))
                .foregroundColor(Color(hex: "9aa5b1"))
        }
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity)
        .background(Color(hex: "1a1a2e"))
    }
}

// MARK: - Server Section

struct ServerSection: View {
    @EnvironmentObject var serverManager: ServerManager
    let type: ServerType
    
    var isRunning: Bool {
        switch type {
        case .backend: return serverManager.backendRunning
        case .frontend: return serverManager.frontendRunning
        }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            Text(type.displayName)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(Color(hex: "e6eef6"))
            
            // Status Row
            HStack {
                Text("Status:")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Color(hex: "9aa5b1"))
                
                HStack(spacing: 4) {
                    Circle()
                        .fill(isRunning ? Color(hex: "4ade80") : Color(hex: "ef4444"))
                        .frame(width: 8, height: 8)
                    
                    Text(isRunning ? "Running" : "Stopped")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(isRunning ? Color(hex: "4ade80") : Color(hex: "ef4444"))
                }
                
                Spacer()
                
                Text("URL: \(type.url)")
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "60a5fa"))
            }
            
            // Buttons Row
            HStack(spacing: 8) {
                ActionButton(
                    title: "▶️ Start",
                    color: Color(hex: "4ade80")
                ) {
                    serverManager.startServer(type)
                }
                
                ActionButton(
                    title: "⏹️ Stop",
                    color: Color(hex: "ef4444")
                ) {
                    serverManager.stopServer(type)
                }
                
                ActionButton(
                    title: "🔄 Restart",
                    color: Color(hex: "60a5fa")
                ) {
                    serverManager.restartServer(type)
                }
                
                ActionButton(
                    title: "🌐 Open",
                    color: Color(hex: "a78bfa")
                ) {
                    serverManager.openInBrowser(type.url)
                }
            }
        }
        .padding(16)
        .background(Color(hex: "16213e"))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.white.opacity(0.1), lineWidth: 1)
        )
    }
}

// MARK: - Logs Section

struct LogsSection: View {
    @EnvironmentObject var serverManager: ServerManager
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Server Logs")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(Color(hex: "e6eef6"))
            
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(serverManager.logs) { entry in
                            LogEntryView(entry: entry)
                                .id(entry.id)
                        }
                    }
                    .padding(12)
                }
                .frame(height: 250)
                .background(Color(hex: "0f1724"))
                .cornerRadius(8)
                .onChange(of: serverManager.logs.count) { _ in
                    if let lastLog = serverManager.logs.last {
                        withAnimation {
                            proxy.scrollTo(lastLog.id, anchor: .bottom)
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(Color(hex: "16213e"))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.white.opacity(0.1), lineWidth: 1)
        )
    }
}

struct LogEntryView: View {
    let entry: LogEntry
    
    var levelColor: Color {
        switch entry.level {
        case .info: return Color(hex: "9aa5b1")
        case .success: return Color(hex: "4ade80")
        case .error: return Color(hex: "ef4444")
        case .warning: return Color(hex: "fbbf24")
        }
    }
    
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text("[\(entry.formattedTimestamp)]")
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundColor(Color(hex: "6b7280"))
            
            Text("[\(entry.level.rawValue)]")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundColor(levelColor)
            
            Text(entry.message)
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(levelColor)
        }
    }
}

// MARK: - Quick Actions Bar

struct QuickActionsBar: View {
    @EnvironmentObject var serverManager: ServerManager
    
    var body: some View {
        HStack(spacing: 12) {
            ActionButton(
                title: "🚀 Start All",
                color: Color(hex: "4ade80")
            ) {
                serverManager.startAllServers()
            }
            
            ActionButton(
                title: "⏹️ Stop All",
                color: Color(hex: "ef4444")
            ) {
                serverManager.stopAllServers()
            }
            
            ActionButton(
                title: "🔄 Restart All",
                color: Color(hex: "60a5fa")
            ) {
                serverManager.restartAllServers()
            }
            
            ActionButton(
                title: "🧹 Clear Logs",
                color: Color(hex: "9aa5b1")
            ) {
                serverManager.clearLogs()
            }
        }
        .padding(.vertical, 8)
    }
}

// MARK: - Action Button

struct ActionButton: View {
    let title: String
    let color: Color
    let action: () -> Void
    
    @State private var isHovering = false
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(Color(hex: "0f1724"))
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(isHovering ? color.opacity(0.8) : color)
                .cornerRadius(8)
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            isHovering = hovering
        }
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

#Preview {
    ContentView()
        .environmentObject(ServerManager())
        .frame(width: 900, height: 750)
}
