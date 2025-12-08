#!/usr/bin/env python3
"""
FinFlow Server Manager
A GUI application to manage and monitor the finance tracker servers
"""

import tkinter as tk
from tkinter import ttk, scrolledtext
import subprocess
import threading
import time
import os
import signal
import requests
from pathlib import Path

class ServerManager:
    def __init__(self, root):
        self.root = root
        self.root.title("FinFlow Server Manager")
        self.root.geometry("900x700")
        self.root.configure(bg='#1a1a2e')
        
        # Server process tracking
        self.backend_process = None
        self.frontend_process = None
        
        # Paths
        self.base_dir = Path(__file__).parent
        self.server_dir = self.base_dir / "server"
        self.venv_python = self.base_dir / ".venv" / "bin" / "python"
        
        # Status colors
        self.color_running = '#4ade80'
        self.color_stopped = '#ef4444'
        self.color_warning = '#fbbf24'
        
        self.setup_ui()
        self.start_monitoring()
    
    def setup_ui(self):
        # Title
        title_frame = tk.Frame(self.root, bg='#1a1a2e')
        title_frame.pack(fill='x', padx=20, pady=20)
        
        title_label = tk.Label(
            title_frame,
            text="💰 FinFlow Server Manager",
            font=('Arial', 24, 'bold'),
            bg='#1a1a2e',
            fg='#6ee7b7'
        )
        title_label.pack()
        
        subtitle_label = tk.Label(
            title_frame,
            text="Manage your Finance Tracker servers",
            font=('Arial', 11),
            bg='#1a1a2e',
            fg='#9aa5b1'
        )
        subtitle_label.pack()
        
        # Main container
        main_container = tk.Frame(self.root, bg='#1a1a2e')
        main_container.pack(fill='both', expand=True, padx=20, pady=10)
        
        # Backend Server Section
        self.create_server_section(
            main_container,
            "Backend Server (Flask)",
            "backend",
            "http://127.0.0.1:5000",
            0
        )
        
        # Frontend Server Section
        self.create_server_section(
            main_container,
            "Frontend Server (HTTP)",
            "frontend",
            "http://127.0.0.1:8000",
            1
        )
        
        # Logs Section
        log_frame = tk.LabelFrame(
            main_container,
            text="Server Logs",
            font=('Arial', 12, 'bold'),
            bg='#16213e',
            fg='#e6eef6',
            padx=10,
            pady=10
        )
        log_frame.grid(row=2, column=0, columnspan=2, sticky='nsew', pady=10)
        main_container.grid_rowconfigure(2, weight=1)
        
        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            height=15,
            bg='#0f1724',
            fg='#e6eef6',
            font=('Courier', 10),
            insertbackground='#6ee7b7'
        )
        self.log_text.pack(fill='both', expand=True)
        
        # Quick Actions
        actions_frame = tk.Frame(main_container, bg='#1a1a2e')
        actions_frame.grid(row=3, column=0, columnspan=2, pady=10)
        
        self.create_button(
            actions_frame,
            "🚀 Start All",
            self.start_all_servers,
            '#4ade80'
        ).pack(side='left', padx=5)
        
        self.create_button(
            actions_frame,
            "⏹️  Stop All",
            self.stop_all_servers,
            '#ef4444'
        ).pack(side='left', padx=5)
        
        self.create_button(
            actions_frame,
            "🔄 Restart All",
            self.restart_all_servers,
            '#60a5fa'
        ).pack(side='left', padx=5)
        
        self.create_button(
            actions_frame,
            "🧹 Clear Logs",
            self.clear_logs,
            '#9aa5b1'
        ).pack(side='left', padx=5)
        
        # Configure grid weights
        main_container.grid_columnconfigure(0, weight=1)
        main_container.grid_columnconfigure(1, weight=1)
    
    def create_server_section(self, parent, title, server_type, url, row):
        frame = tk.LabelFrame(
            parent,
            text=title,
            font=('Arial', 12, 'bold'),
            bg='#16213e',
            fg='#e6eef6',
            padx=15,
            pady=15
        )
        frame.grid(row=row, column=0, columnspan=2, sticky='ew', pady=5)
        
        # Status indicator
        status_frame = tk.Frame(frame, bg='#16213e')
        status_frame.pack(fill='x', pady=5)
        
        status_label = tk.Label(
            status_frame,
            text="Status:",
            font=('Arial', 10, 'bold'),
            bg='#16213e',
            fg='#9aa5b1'
        )
        status_label.pack(side='left')
        
        status_indicator = tk.Label(
            status_frame,
            text="● Stopped",
            font=('Arial', 10, 'bold'),
            bg='#16213e',
            fg=self.color_stopped
        )
        status_indicator.pack(side='left', padx=10)
        
        # URL
        url_label = tk.Label(
            status_frame,
            text=f"URL: {url}",
            font=('Arial', 9),
            bg='#16213e',
            fg='#60a5fa'
        )
        url_label.pack(side='left', padx=10)
        
        # Buttons
        button_frame = tk.Frame(frame, bg='#16213e')
        button_frame.pack(fill='x', pady=10)
        
        start_btn = self.create_button(
            button_frame,
            "▶️  Start",
            lambda: self.start_server(server_type),
            '#4ade80'
        )
        start_btn.pack(side='left', padx=5)
        
        stop_btn = self.create_button(
            button_frame,
            "⏹️  Stop",
            lambda: self.stop_server(server_type),
            '#ef4444'
        )
        stop_btn.pack(side='left', padx=5)
        
        restart_btn = self.create_button(
            button_frame,
            "🔄 Restart",
            lambda: self.restart_server(server_type),
            '#60a5fa'
        )
        restart_btn.pack(side='left', padx=5)
        
        open_btn = self.create_button(
            button_frame,
            "🌐 Open in Browser",
            lambda: self.open_browser(url),
            '#a78bfa'
        )
        open_btn.pack(side='left', padx=5)
        
        # Store references
        if server_type == 'backend':
            self.backend_status = status_indicator
            self.backend_url = url
        else:
            self.frontend_status = status_indicator
            self.frontend_url = url
    
    def create_button(self, parent, text, command, color):
        btn = tk.Button(
            parent,
            text=text,
            command=command,
            bg=color,
            fg='#0f1724',
            font=('Arial', 10, 'bold'),
            relief='flat',
            padx=15,
            pady=8,
            cursor='hand2'
        )
        btn.bind('<Enter>', lambda e: btn.config(bg=self.lighten_color(color)))
        btn.bind('<Leave>', lambda e: btn.config(bg=color))
        return btn
    
    def lighten_color(self, color):
        # Simple color lightening
        return color
    
    def log(self, message, level='INFO'):
        timestamp = time.strftime('%H:%M:%S')
        color_tag = {
            'INFO': 'info',
            'SUCCESS': 'success',
            'ERROR': 'error',
            'WARNING': 'warning'
        }.get(level, 'info')
        
        self.log_text.insert('end', f"[{timestamp}] [{level}] {message}\n", color_tag)
        self.log_text.see('end')
        
        # Configure tags
        self.log_text.tag_config('info', foreground='#9aa5b1')
        self.log_text.tag_config('success', foreground='#4ade80')
        self.log_text.tag_config('error', foreground='#ef4444')
        self.log_text.tag_config('warning', foreground='#fbbf24')
    
    def clear_logs(self):
        self.log_text.delete('1.0', 'end')
        self.log("Logs cleared", 'INFO')
    
    def check_port(self, port):
        """Check if a port is in use"""
        try:
            result = subprocess.run(
                ['lsof', '-ti', f':{port}'],
                capture_output=True,
                text=True
            )
            return result.stdout.strip() != ''
        except:
            return False
    
    def check_http_status(self, url):
        """Check if HTTP endpoint is responding"""
        try:
            response = requests.get(url, timeout=2)
            return response.status_code == 200
        except:
            return False
    
    def start_server(self, server_type):
        if server_type == 'backend':
            if self.backend_process and self.backend_process.poll() is None:
                self.log("Backend server is already running", 'WARNING')
                return
            
            self.log("Starting backend server...", 'INFO')
            try:
                self.backend_process = subprocess.Popen(
                    [str(self.venv_python), 'app.py'],
                    cwd=str(self.server_dir),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True
                )
                time.sleep(2)  # Give it time to start
                if self.check_port(5000):
                    self.log("✓ Backend server started successfully on port 5000", 'SUCCESS')
                else:
                    self.log("⚠ Backend server started but port 5000 not responding", 'WARNING')
            except Exception as e:
                self.log(f"✗ Failed to start backend server: {e}", 'ERROR')
        
        elif server_type == 'frontend':
            if self.frontend_process and self.frontend_process.poll() is None:
                self.log("Frontend server is already running", 'WARNING')
                return
            
            self.log("Starting frontend server...", 'INFO')
            try:
                self.frontend_process = subprocess.Popen(
                    ['python3', '-m', 'http.server', '8000'],
                    cwd=str(self.base_dir),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True
                )
                time.sleep(1)
                if self.check_port(8000):
                    self.log("✓ Frontend server started successfully on port 8000", 'SUCCESS')
                else:
                    self.log("⚠ Frontend server started but port 8000 not responding", 'WARNING')
            except Exception as e:
                self.log(f"✗ Failed to start frontend server: {e}", 'ERROR')
    
    def stop_server(self, server_type):
        if server_type == 'backend':
            self.log("Stopping backend server...", 'INFO')
            if self.backend_process:
                try:
                    self.backend_process.terminate()
                    self.backend_process.wait(timeout=5)
                    self.log("✓ Backend server stopped", 'SUCCESS')
                except:
                    self.backend_process.kill()
                    self.log("✓ Backend server killed (forced)", 'WARNING')
                self.backend_process = None
            
            # Also kill any process on port 5000
            try:
                subprocess.run(['lsof', '-ti:5000', '|', 'xargs', 'kill', '-9'], shell=True)
            except:
                pass
        
        elif server_type == 'frontend':
            self.log("Stopping frontend server...", 'INFO')
            if self.frontend_process:
                try:
                    self.frontend_process.terminate()
                    self.frontend_process.wait(timeout=5)
                    self.log("✓ Frontend server stopped", 'SUCCESS')
                except:
                    self.frontend_process.kill()
                    self.log("✓ Frontend server killed (forced)", 'WARNING')
                self.frontend_process = None
            
            # Also kill any process on port 8000
            try:
                subprocess.run(['lsof', '-ti:8000', '|', 'xargs', 'kill', '-9'], shell=True)
            except:
                pass
    
    def restart_server(self, server_type):
        self.stop_server(server_type)
        time.sleep(1)
        self.start_server(server_type)
    
    def start_all_servers(self):
        self.log("Starting all servers...", 'INFO')
        threading.Thread(target=self._start_all_thread, daemon=True).start()
    
    def _start_all_thread(self):
        self.start_server('backend')
        time.sleep(2)
        self.start_server('frontend')
    
    def stop_all_servers(self):
        self.log("Stopping all servers...", 'INFO')
        self.stop_server('backend')
        self.stop_server('frontend')
    
    def restart_all_servers(self):
        self.log("Restarting all servers...", 'INFO')
        threading.Thread(target=self._restart_all_thread, daemon=True).start()
    
    def _restart_all_thread(self):
        self.stop_all_servers()
        time.sleep(2)
        self.start_all_servers()
    
    def open_browser(self, url):
        import webbrowser
        self.log(f"Opening {url} in browser...", 'INFO')
        webbrowser.open(url)
    
    def update_status(self):
        """Update server status indicators"""
        # Check backend
        backend_running = self.check_port(5000) or (
            self.backend_process and self.backend_process.poll() is None
        )
        
        if backend_running:
            self.backend_status.config(
                text="● Running",
                fg=self.color_running
            )
        else:
            self.backend_status.config(
                text="● Stopped",
                fg=self.color_stopped
            )
            if self.backend_process and self.backend_process.poll() is not None:
                self.backend_process = None
        
        # Check frontend
        frontend_running = self.check_port(8000) or (
            self.frontend_process and self.frontend_process.poll() is None
        )
        
        if frontend_running:
            self.frontend_status.config(
                text="● Running",
                fg=self.color_running
            )
        else:
            self.frontend_status.config(
                text="● Stopped",
                fg=self.color_stopped
            )
            if self.frontend_process and self.frontend_process.poll() is not None:
                self.frontend_process = None
    
    def start_monitoring(self):
        """Start background monitoring thread"""
        def monitor():
            while True:
                try:
                    self.update_status()
                except:
                    pass
                time.sleep(2)
        
        thread = threading.Thread(target=monitor, daemon=True)
        thread.start()
    
    def on_closing(self):
        """Handle window close"""
        self.log("Shutting down server manager...", 'INFO')
        self.stop_all_servers()
        self.root.destroy()

def main():
    root = tk.Tk()
    app = ServerManager(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    root.mainloop()

if __name__ == '__main__':
    main()
