# FinFlow Server Manager

A beautiful GUI application to manage and monitor your Finance Tracker servers with ease.

## Features

✨ **Visual Server Management**
- Monitor backend (Flask) and frontend (HTTP) servers in real-time
- See server status with color-coded indicators (🟢 Running / 🔴 Stopped)
- Live status updates every 2 seconds

🎮 **Easy Controls**
- Start, Stop, and Restart individual servers
- Quick actions to control all servers at once
- Open servers directly in your browser

📊 **Live Logging**
- Real-time log viewer with color-coded messages
- INFO (gray), SUCCESS (green), ERROR (red), WARNING (yellow)
- Clear logs functionality

🎨 **Modern Dark UI**
- Beautiful dark theme matching FinFlow's design
- Clean and intuitive interface
- Responsive layout

## Installation

The server manager uses Python's built-in `tkinter` for the GUI, which comes pre-installed with Python on macOS.

Install the required dependency:
```bash
cd /Users/konradkunkel/Documents/GitHub/finance-tracker
source .venv/bin/activate
pip install requests
```

## Usage

### Quick Start

Simply run the server manager:
```bash
cd /Users/konradkunkel/Documents/GitHub/finance-tracker
.venv/bin/python server_manager.py
```

Or make it executable and run directly:
```bash
./server_manager.py
```

### Controls

**Individual Server Controls:**
- ▶️ **Start** - Start the server
- ⏹️ **Stop** - Stop the server gracefully
- 🔄 **Restart** - Stop and start the server
- 🌐 **Open in Browser** - Open the server URL in your default browser

**Quick Actions:**
- 🚀 **Start All** - Start both backend and frontend servers
- ⏹️ **Stop All** - Stop all running servers
- 🔄 **Restart All** - Restart all servers
- 🧹 **Clear Logs** - Clear the log viewer

### Server Information

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

## Status Indicators

- 🟢 **● Running** - Server is active and responding
- 🔴 **● Stopped** - Server is not running

The status updates automatically every 2 seconds by checking if the ports are in use.

## Log Messages

The log viewer shows timestamped messages with different severity levels:

- **[INFO]** - General information (gray)
- **[SUCCESS]** - Successful operations (green)
- **[ERROR]** - Errors and failures (red)
- **[WARNING]** - Warnings and alerts (yellow)

## Tips

1. **Always start the backend before the frontend** - The frontend needs the backend API to function
2. **Use "Start All"** for the quickest setup - It starts servers in the correct order
3. **Check the logs** if servers don't start - Error messages will appear in red
4. **Closing the app** automatically stops all running servers for clean shutdown

## Troubleshooting

**Server won't start:**
- Check if the port is already in use
- Look at the error messages in the log viewer
- Make sure you're in the correct directory

**Status shows stopped but server is running:**
- The app checks ports; if a server was started outside the app, use "Stop All" to kill processes on those ports

**Backend fails to start:**
- Ensure the virtual environment is set up: `.venv/bin/python`
- Check that `server/app.py` exists
- Verify database is initialized

## Architecture

The server manager:
- Uses `subprocess` to start servers as child processes
- Monitors ports 5000 and 8000 using `lsof`
- Tracks process IDs for clean shutdown
- Runs status checks in a background thread
- Uses tkinter for the native GUI

## Requirements

- Python 3.x
- tkinter (included with Python on macOS)
- requests library
- Virtual environment with Flask and dependencies

Enjoy managing your servers with style! 💰✨
