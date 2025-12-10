#!/bin/bash

# FinFlow Server Manager - Build & Run Script
# This script builds and runs the SwiftUI Server Manager app

cd "$(dirname "$0")"

echo "🔨 Building FinFlow Server Manager..."
swift build -c release

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo "🚀 Launching Server Manager..."
    
    # Run from the finance-tracker directory so paths work correctly
    cd ..
    ./FinFlowServerManager/.build/release/FinFlowServerManager
else
    echo "❌ Build failed!"
    exit 1
fi
