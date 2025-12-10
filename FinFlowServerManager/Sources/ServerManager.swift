import Foundation
import Combine
import AppKit

enum ServerType: String, CaseIterable {
    case backend = "backend"
    case frontend = "frontend"
    
    var displayName: String {
        switch self {
        case .backend: return "Backend Server (Flask)"
        case .frontend: return "Frontend Server (HTTP)"
        }
    }
    
    var port: Int {
        switch self {
        case .backend: return 5000
        case .frontend: return 8000
        }
    }
    
    var url: String {
        "http://127.0.0.1:\(port)"
    }
}

enum LogLevel: String {
    case info = "INFO"
    case success = "SUCCESS"
    case error = "ERROR"
    case warning = "WARNING"
}

struct LogEntry: Identifiable {
    let id = UUID()
    let timestamp: Date
    let level: LogLevel
    let message: String
    
    var formattedTimestamp: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: timestamp)
    }
}

@MainActor
class ServerManager: ObservableObject {
    @Published var backendRunning = false
    @Published var frontendRunning = false
    @Published var logs: [LogEntry] = []
    
    private var backendProcess: Process?
    private var frontendProcess: Process?
    private var monitoringTimer: Timer?
    
    // Paths
    private let baseDir: URL
    private let serverDir: URL
    private let venvPython: URL
    
    init() {
        // Get the base directory (parent of this app or current directory)
        let currentPath = FileManager.default.currentDirectoryPath
        baseDir = URL(fileURLWithPath: currentPath)
        serverDir = baseDir.appendingPathComponent("server")
        venvPython = baseDir.appendingPathComponent(".venv/bin/python")
        
        startMonitoring()
        log("Server Manager initialized", level: .info)
        log("Base directory: \(baseDir.path)", level: .info)
    }
    
    deinit {
        monitoringTimer?.invalidate()
    }
    
    // MARK: - Logging
    
    func log(_ message: String, level: LogLevel = .info) {
        let entry = LogEntry(timestamp: Date(), level: level, message: message)
        logs.append(entry)
        
        // Keep only last 500 logs
        if logs.count > 500 {
            logs.removeFirst(logs.count - 500)
        }
    }
    
    func clearLogs() {
        logs.removeAll()
        log("Logs cleared", level: .info)
    }
    
    // MARK: - Port Checking
    
    private func checkPort(_ port: Int) -> Bool {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/sbin/lsof")
        task.arguments = ["-ti", ":\(port)"]
        
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = FileHandle.nullDevice
        
        do {
            try task.run()
            task.waitUntilExit()
            
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            return !output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        } catch {
            return false
        }
    }
    
    private func killProcessOnPort(_ port: Int) {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/sh")
        task.arguments = ["-c", "lsof -ti:\(port) | xargs kill -9 2>/dev/null"]
        
        do {
            try task.run()
            task.waitUntilExit()
        } catch {
            // Ignore errors
        }
    }
    
    // MARK: - Server Control
    
    func startServer(_ type: ServerType) {
        switch type {
        case .backend:
            startBackend()
        case .frontend:
            startFrontend()
        }
    }
    
    func stopServer(_ type: ServerType) {
        switch type {
        case .backend:
            stopBackend()
        case .frontend:
            stopFrontend()
        }
    }
    
    func restartServer(_ type: ServerType) {
        stopServer(type)
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            self?.startServer(type)
        }
    }
    
    private func startBackend() {
        if backendRunning {
            log("Backend server is already running", level: .warning)
            return
        }
        
        log("Starting backend server...", level: .info)
        
        let process = Process()
        process.executableURL = venvPython
        process.arguments = ["app.py"]
        process.currentDirectoryURL = serverDir
        
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = errorPipe
        
        do {
            try process.run()
            backendProcess = process
            
            // Check after a delay
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                if self?.checkPort(5000) == true {
                    self?.log("✓ Backend server started successfully on port 5000", level: .success)
                    self?.backendRunning = true
                } else {
                    self?.log("⚠ Backend server started but port 5000 not responding", level: .warning)
                }
            }
        } catch {
            log("✗ Failed to start backend server: \(error.localizedDescription)", level: .error)
        }
    }
    
    private func startFrontend() {
        if frontendRunning {
            log("Frontend server is already running", level: .warning)
            return
        }
        
        log("Starting frontend server...", level: .info)
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        process.arguments = ["-m", "http.server", "8000"]
        process.currentDirectoryURL = baseDir
        
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = errorPipe
        
        do {
            try process.run()
            frontendProcess = process
            
            // Check after a delay
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                if self?.checkPort(8000) == true {
                    self?.log("✓ Frontend server started successfully on port 8000", level: .success)
                    self?.frontendRunning = true
                } else {
                    self?.log("⚠ Frontend server started but port 8000 not responding", level: .warning)
                }
            }
        } catch {
            log("✗ Failed to start frontend server: \(error.localizedDescription)", level: .error)
        }
    }
    
    private func stopBackend() {
        log("Stopping backend server...", level: .info)
        
        if let process = backendProcess, process.isRunning {
            process.terminate()
            backendProcess = nil
        }
        
        // Kill any process on port 5000
        killProcessOnPort(5000)
        
        backendRunning = false
        log("✓ Backend server stopped", level: .success)
    }
    
    private func stopFrontend() {
        log("Stopping frontend server...", level: .info)
        
        if let process = frontendProcess, process.isRunning {
            process.terminate()
            frontendProcess = nil
        }
        
        // Kill any process on port 8000
        killProcessOnPort(8000)
        
        frontendRunning = false
        log("✓ Frontend server stopped", level: .success)
    }
    
    // MARK: - Bulk Operations
    
    func startAllServers() {
        log("Starting all servers...", level: .info)
        startBackend()
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.startFrontend()
        }
    }
    
    func stopAllServers() {
        log("Stopping all servers...", level: .info)
        stopBackend()
        stopFrontend()
    }
    
    func restartAllServers() {
        log("Restarting all servers...", level: .info)
        stopAllServers()
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.startAllServers()
        }
    }
    
    // MARK: - Browser
    
    func openInBrowser(_ url: String) {
        log("Opening \(url) in browser...", level: .info)
        if let url = URL(string: url) {
            NSWorkspace.shared.open(url)
        }
    }
    
    // MARK: - Monitoring
    
    private func startMonitoring() {
        monitoringTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateStatus()
            }
        }
    }
    
    private func updateStatus() {
        // Check backend
        let backendPortInUse = checkPort(5000)
        let backendProcessRunning = backendProcess?.isRunning ?? false
        backendRunning = backendPortInUse || backendProcessRunning
        
        if !backendRunning && backendProcess != nil {
            backendProcess = nil
        }
        
        // Check frontend
        let frontendPortInUse = checkPort(8000)
        let frontendProcessRunning = frontendProcess?.isRunning ?? false
        frontendRunning = frontendPortInUse || frontendProcessRunning
        
        if !frontendRunning && frontendProcess != nil {
            frontendProcess = nil
        }
    }
    
    // MARK: - Cleanup
    
    func shutdown() {
        log("Shutting down server manager...", level: .info)
        stopAllServers()
        monitoringTimer?.invalidate()
    }
}
