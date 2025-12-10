# FinFlow Server Manager (Swift/SwiftUI)

A native macOS application built with Swift and SwiftUI to manage and monitor the Finance Tracker servers.

## Features

✨ **Native macOS Experience**
- Built with SwiftUI for a modern, native look and feel
- Dark theme matching FinFlow's design
- Smooth animations and hover effects

🖥️ **Visual Server Management**
- Monitor backend (Flask) and frontend (HTTP) servers in real-time
- Color-coded status indicators (🟢 Running / 🔴 Stopped)
- Live status updates every 2 seconds

🎮 **Easy Controls**
- Start, Stop, and Restart individual servers
- Quick actions to control all servers at once
- Open servers directly in your default browser

📊 **Live Logging**
- Real-time log viewer with color-coded messages
- Auto-scroll to latest logs
- Clear logs functionality

## Requirements

- macOS 13.0 (Ventura) or later
- Swift 5.9 or later
- Xcode Command Line Tools

## Building & Running

### Option 1: Using the Build Script

```bash
cd /Users/konradkunkel/Documents/GitHub/finance-tracker/FinFlowServerManager
chmod +x build_and_run.sh
./build_and_run.sh
```

### Option 2: Using Swift Package Manager

```bash
cd /Users/konradkunkel/Documents/GitHub/finance-tracker/FinFlowServerManager

# Build
swift build -c release

# Run (from the finance-tracker directory)
cd ..
./FinFlowServerManager/.build/release/FinFlowServerManager
```

### Option 3: Open in Xcode

```bash
cd /Users/konradkunkel/Documents/GitHub/finance-tracker/FinFlowServerManager
open Package.swift
```

Then press ⌘+R to build and run.

## Project Structure

```
FinFlowServerManager/
├── Package.swift                 # Swift Package Manager config
├── build_and_run.sh             # Build and run script
├── README.md                    # This file
└── Sources/
    ├── FinFlowServerManagerApp.swift  # App entry point
    ├── ServerManager.swift            # Server management logic
    └── ContentView.swift              # SwiftUI views
```

## Server Information

**Backend Server (Flask)**
- URL: http://127.0.0.1:5000
- Port: 5000
- Location: `server/app.py`
- Provides: REST API, Authentication, Database

**Frontend Server (HTTP)**
- URL: http://127.0.0.1:8000
- Port: 8000
- Location: Root directory
- Provides: Static file serving for HTML/CSS/JS

## Controls

### Individual Server Controls
- **▶️ Start** - Start the server
- **⏹️ Stop** - Stop the server gracefully
- **🔄 Restart** - Stop and start the server
- **🌐 Open** - Open the server URL in your default browser

### Quick Actions
- **🚀 Start All** - Start both backend and frontend servers
- **⏹️ Stop All** - Stop all running servers
- **🔄 Restart All** - Restart all servers
- **🧹 Clear Logs** - Clear the log viewer

## Log Levels

- **[INFO]** - General information (gray)
- **[SUCCESS]** - Successful operations (green)
- **[ERROR]** - Errors and failures (red)
- **[WARNING]** - Warnings and alerts (yellow)

## Tips

1. **Always start the backend before the frontend** - The frontend needs the backend API to function
2. **Use "Start All"** for the quickest setup - It starts servers in the correct order with proper delays
3. **Run from the finance-tracker directory** - The app needs to be run from the parent directory to find the server files

## Comparison with Python Version

| Feature | Python (tkinter) | Swift (SwiftUI) |
|---------|-----------------|-----------------|
| UI Framework | tkinter | SwiftUI |
| Native Look | Cross-platform | macOS native |
| Performance | Good | Excellent |
| Dependencies | requests | None (uses Foundation) |
| Binary Size | Requires Python | Standalone app |
| Dark Mode | Custom theme | System integrated |

## Troubleshooting

**App won't start:**
- Make sure you're running from the `finance-tracker` directory
- Check that the `.venv` directory exists with Python installed

**Servers won't start:**
- Ensure ports 5000 and 8000 are not in use
- Check that `server/app.py` exists
- Verify Python is installed in `.venv`

**Build errors:**
- Make sure you have Xcode Command Line Tools installed: `xcode-select --install`
- Ensure you're on macOS 13.0 or later
