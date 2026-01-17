#!/bin/bash

# Finance Tracker Startup Script
# Starts both the Flask backend server and serves the frontend

echo "Starting Finance Tracker servers..."

# Check if virtual environment exists for Python server
if [ ! -d "server/venv" ]; then
    echo "Virtual environment not found. Creating one..."
    cd server
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    cd ..
fi

# Start Flask backend server
echo "Starting Flask backend server on port 5000..."
cd server
source venv/bin/activate
python3 app.py &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 2

# Start frontend server
echo "Starting frontend server on port 8000..."
python3 -m http.server 8000 &
FRONTEND_PID=$!

echo ""
echo "✓ Backend server running on http://127.0.0.1:5000 (PID: $BACKEND_PID)"
echo "✓ Frontend server running on http://127.0.0.1:8000 (PID: $FRONTEND_PID)"
echo ""
echo "Press Ctrl+C to stop both servers"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Stopping servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    echo "Servers stopped."
    exit 0
}

# Trap Ctrl+C and call cleanup
trap cleanup INT

# Keep script running
wait
