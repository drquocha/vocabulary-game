#!/usr/bin/env python3
"""
Quick setup and run script for the Adaptive Vocabulary Learning Game
"""

import os
import sys
import subprocess
import webbrowser
import time
from pathlib import Path

def check_python_version():
    """Check if Python version is adequate"""
    if sys.version_info < (3, 8):
        print("❌ Python 3.8 or higher is required")
        print(f"Current version: {sys.version}")
        return False
    print(f"✅ Python version: {sys.version}")
    return True

def install_requirements():
    """Install required packages"""
    print("📦 Installing required packages...")
    try:
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "-r", "requirements.txt"
        ])
        print("✅ All packages installed successfully!")
        return True
    except subprocess.CalledProcessError:
        print("❌ Failed to install packages")
        print("💡 Try running: pip install -r requirements.txt")
        return False

def setup_database():
    """Initialize the database"""
    print("🗄️  Initializing database...")
    try:
        from adaptive_learning_engine import AdaptiveLearningEngine
        engine = AdaptiveLearningEngine()
        print("✅ Database initialized!")
        return True
    except Exception as e:
        print(f"❌ Database setup failed: {e}")
        return False

def start_server():
    """Start the FastAPI server"""
    print("🚀 Starting server...")
    try:
        # Import here to ensure packages are installed
        import uvicorn
        from learning_api import app

        print("📖 Game will be available at: http://localhost:8000/game/index.html")
        print("📊 API documentation at: http://localhost:8000/docs")
        print("⏹️  Press Ctrl+C to stop the server")
        print("-" * 50)

        # Open browser after a short delay
        def open_browser():
            time.sleep(2)
            webbrowser.open('http://localhost:8000/game/index.html')

        import threading
        browser_thread = threading.Thread(target=open_browser)
        browser_thread.daemon = True
        browser_thread.start()

        # Start the server
        uvicorn.run(
            "learning_api:app",
            host="0.0.0.0",
            port=8000,
            reload=True,
            log_level="info"
        )

    except KeyboardInterrupt:
        print("\n👋 Server stopped. Thanks for using the Adaptive Vocabulary Game!")
    except Exception as e:
        print(f"❌ Server failed to start: {e}")
        return False

def main():
    """Main setup and run function"""
    print("🎯 Adaptive Vocabulary Learning Game Setup")
    print("=" * 50)

    # Check Python version
    if not check_python_version():
        return

    # Check if we're in the right directory
    if not Path("requirements.txt").exists():
        print("❌ Please run this script from the game directory")
        return

    # Install requirements
    if not install_requirements():
        return

    # Setup database
    if not setup_database():
        return

    # Start server
    start_server()

if __name__ == "__main__":
    main()