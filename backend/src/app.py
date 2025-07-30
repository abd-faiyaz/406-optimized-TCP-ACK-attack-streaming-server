import os
import sys
import argparse
import signal
from flask import Flask, jsonify, request, send_from_directory
from flask_socketio import SocketIO, emit
from server.streaming_server import StreamingServer, StreamingServerConfig

# ----- CLI ARGUMENT PARSING -----

def parse_args():
    parser = argparse.ArgumentParser(
        description="🛡️ Optimistic ACK Attack - Backend Server",
        formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument('--defense', '-d', type=str, default="true",
                        help="Enable/disable defense system (true/false) [default: true]")
    parser.add_argument('--defense-mode', '-dm', type=str, default="medium",
                        help="Defense mode (high/medium/low/off) [default: medium]")
    parser.add_argument('--no-defense', action='store_true',
                        help="Disable defense system completely")
    parser.add_argument('--port', '-p', type=int, default=3001,
                        help="Server port [default: 3001]")

    args = parser.parse_args()

    defense_enabled = not args.no_defense and (args.defense.lower() not in ['false', 'off', 'disabled'])
    defense_mode = args.defense_mode if not args.no_defense else 'off'

    return {
        'defense': defense_enabled,
        'defenseMode': defense_mode,
        'port': args.port
    }

def show_help():
    print("""
🛡️ Optimistic ACK Attack - Backend Server

Usage: python app.py [options]

Options:
  --defense, -d <enabled>      Enable/disable defense system (true/false) [default: true]
  --defense-mode, -dm <mode>   Defense mode (high/medium/low/off) [default: medium]
  --no-defense                 Disable defense system completely
  --port, -p <port>            Server port [default: 3001]
  --help, -h                   Show this help message

Defense Modes:
  high     - Maximum protection, aggressive thresholds
  medium   - Balanced protection and performance
  low      - Minimal protection, performance optimized  
  off      - No protection (vulnerable to attacks)

Examples:
  python app.py                                    # Default: defense enabled, medium mode
  python app.py --defense true --defense-mode high # High security mode
  python app.py --no-defense                       # No protection (testing)
  python app.py -d false                           # Disable defense
  python app.py -dm low -p 8080                    # Low defense mode on port 8080

🎯 Test the defense system:
  curl -H "X-Simulate-Attack: optimistic-ack" http://localhost:3001/download/xl.dat
""")

# ----- MAIN APP -----

class App:
    def __init__(self, config: StreamingServerConfig, port: int):
        self.port = port
        self.streaming_server = StreamingServer(config)
        self.app = self.streaming_server.app  # Flask app
        self.socketio = SocketIO(self.app, cors_allowed_origins="*")
        self.is_running = False

        # Static/public serving (match Express static)
        @self.app.route('/public/<path:filename>')
        def serve_public(filename):
            return send_from_directory('public', filename)

        self.initialize_routes()
        self.initialize_socketio()

        # Logging
        print('🚀 Server initialized with configuration:')
        print(f'   Defense System: {"✅ ENABLED" if config.enableDefense else "❌ DISABLED"}')
        print(f'   Defense Mode: {config.defenseMode.upper()}')
        if not config.enableDefense:
            print('⚠️  WARNING: Server is vulnerable to optimistic ACK attacks!')

    def initialize_routes(self):
        # Control endpoints for monitoring
        @self.app.route('/api/server/start', methods=['POST'])
        def start_server():
            self.start_metrics_emission()
            self.socketio.emit('server-status', True)
            return jsonify({'status': 'started'})

        @self.app.route('/api/server/stop', methods=['POST'])
        def stop_server():
            self.stop_metrics_emission()
            self.socketio.emit('server-status', False)
            return jsonify({'status': 'stopped'})

        @self.app.route('/health')
        def health():
            return jsonify({'status': 'OK', 'timestamp': time_now_iso()})

    def initialize_socketio(self):
        @self.socketio.on('connect')
        def handle_connect():
            print("Client connected")
            emit('server-status', True)
            try:
                metrics = self.get_system_metrics()
                emit('metrics-update', metrics)
            except Exception as e:
                print('Error getting initial metrics:', e)

        @self.socketio.on('disconnect')
        def handle_disconnect():
            print("Client disconnected")

        @self.socketio.on('request-metrics')
        def handle_request_metrics():
            try:
                metrics = self.get_system_metrics()
                emit('metrics-update', metrics)
            except Exception as e:
                print('Error sending metrics:', e)

        @self.socketio.on('request-server-status')
        def handle_request_status():
            emit('server-status', True)

    def start_metrics_emission(self):
        metrics = self.get_system_metrics()
        self.socketio.emit('metrics-update', metrics)
        # For real periodic: use a background thread/timer if desired

    def stop_metrics_emission(self):
        pass  # No periodic emission unless you add it

    def start_status_emission(self):
        self.socketio.emit('server-status', True)

    def stop_status_emission(self):
        pass  # As above

    def get_system_metrics(self):
        # Replace with actual monitored metrics from streaming server
        return self.streaming_server.get_metrics()

    def start(self):
        self.is_running = True
        print(f'🚀 Server running on http://localhost:{self.port}')
        print('📡 WebSocket server ready')
        print('📥 Available endpoints:')
        print('  - GET /health - Health check')
        print('  - GET /download/<filename> - Download files')
        print('  - GET /stream/<streamId>/playlist.m3u8 - HLS playlist')
        print('  - GET /stream/<streamId>/<segment> - HLS segments')
        if self.streaming_server.config.enableDefense:
            print('  - GET /security/metrics - Defense metrics')
            print('  - GET /security/status - Defense status')
            print('')
            print('🛡️ Defense System Status:')
            print(f'   Mode: {self.streaming_server.config.defenseMode.upper()}')
            print('   Protection: ACTIVE')
            print('')
            print('🧪 Test defense system:')
            print(f'   curl -H "X-Simulate-Attack: optimistic-ack" http://localhost:{self.port}/download/xl.dat')
        else:
            print('')
            print('⚠️  SECURITY WARNING:')
            print('   Defense system is DISABLED')
            print('   Server is vulnerable to optimistic ACK attacks')
            print('   Use --defense true to enable protection')
        print('  - POST /api/server/start - Start monitoring')
        print('  - POST /api/server/stop - Stop monitoring')
        self.socketio.run(self.app, host='0.0.0.0', port=self.port)

    def stop(self):
        # Graceful shutdown handled below
        pass

def time_now_iso():
    import datetime
    return datetime.datetime.utcnow().isoformat() + "Z"

# ----- ENTRY POINT -----

if __name__ == '__main__':
    cliArgs = parse_args()

    serverConfig = StreamingServerConfig(
        enableDefense=cliArgs['defense'],
        defenseMode=cliArgs['defenseMode']
    )
    app = App(serverConfig, cliArgs['port'])

    def handle_shutdown(signum, frame):
        print("Shutting down...")
        app.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    app.start()
