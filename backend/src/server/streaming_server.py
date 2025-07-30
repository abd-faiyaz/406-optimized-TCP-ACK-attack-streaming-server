import os
import threading
import time
from flask import Flask, request, send_file, Response, jsonify, abort, g
from flask_cors import CORS

from monitoring.system_monitor import SystemMonitor
from monitoring.analyzers.connection_analyzer import ConnectionAnalyzer
from security.security_middleware import SecurityMiddleware

class StreamingServerConfig:
    def __init__(self, enableDefense=True, defenseMode='medium', customConfig=None):
        self.enableDefense = enableDefense
        self.defenseMode = defenseMode
        self.customConfig = customConfig or {}

class StreamingServer:
    def __init__(self, config: StreamingServerConfig = StreamingServerConfig()):
        self.config = config
        self.app = Flask(__name__)
        
        # Enable CORS for all routes
        CORS(self.app, resources={
            r"/stream/*": {"origins": "*"},
            r"/download/*": {"origins": "*"},
            r"/security/*": {"origins": "*"},
            r"/health": {"origins": "*"}
        })
        
        self.systemMonitor = SystemMonitor()
        self.connectionAnalyzer = ConnectionAnalyzer()
        self.securityMiddleware = None
        self.isRunning = False

        if self.config.enableDefense:
            self.initialize_defense_system()
        self.setup_routes()

    def initialize_defense_system(self):
        defenseConfig = self.get_defense_config()
        self.securityMiddleware = SecurityMiddleware(self.app, defenseConfig)
        print(f"🛡️ Defense system initialized in {self.config.defenseMode} mode")

    def get_defense_config(self):
        baseConfig = {
            "enableSecurityHeaders": True,
            "enableConnectionThrottling": True,
            "blocklistEnabled": True,
            **self.config.customConfig
        }
        mode = self.config.defenseMode
        if mode == "high":
            return {**baseConfig, **{
                "ackValidationEnabled": True,
                "rateLimitingEnabled": False,
                "sequenceTrackingEnabled": False,
                "adaptiveWindowEnabled": False,
                "anomalyDetectionEnabled": True,
                "quarantineEnabled": True,
                "maxACKsPerSecond": 1000,
                "maxSequenceGap": 10485760,
                "suspiciousPatternThreshold": 0.95,
                "quarantineDuration": 1800000,
                "maxConnectionsPerIP": 50
            }}
        elif mode == "medium":
            return {**baseConfig, **{
                "ackValidationEnabled": True,
                "rateLimitingEnabled": False,
                "sequenceTrackingEnabled": False,
                "adaptiveWindowEnabled": False,
                "anomalyDetectionEnabled": True,
                "quarantineEnabled": True,
                "maxACKsPerSecond": 1000,
                "maxSequenceGap": 10485760,
                "suspiciousPatternThreshold": 0.9,
                "quarantineDuration": 600000,
                "maxConnectionsPerIP": 100
            }}
        elif mode == "low":
            return {**baseConfig, **{
                "ackValidationEnabled": False,
                "rateLimitingEnabled": False,
                "sequenceTrackingEnabled": False,
                "adaptiveWindowEnabled": False,
                "anomalyDetectionEnabled": True,
                "quarantineEnabled": False,
                "maxACKsPerSecond": 10000,
                "maxSequenceGap": 104857600,
                "suspiciousPatternThreshold": 0.99,
                "quarantineDuration": 300000,
                "maxConnectionsPerIP": 200
            }}
        else:  # off
            return {**baseConfig, **{
                "ackValidationEnabled": False,
                "rateLimitingEnabled": False,
                "sequenceTrackingEnabled": False,
                "adaptiveWindowEnabled": False,
                "anomalyDetectionEnabled": False,
                "quarantineEnabled": False,
                "maxACKsPerSecond": 100000,
                "maxSequenceGap": 1048576000,
                "suspiciousPatternThreshold": 1.0,
                "quarantineDuration": 0,
                "maxConnectionsPerIP": 1000
            }}

    def setup_routes(self):
        DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../data'))

        # Debug endpoint for frontend connection testing
        @self.app.route('/debug/cors')
        def debug_cors():
            return jsonify({
                "status": "OK",
                "message": "CORS is working",
                "server": "Optimistic ACK Attack Backend",
                "timestamp": time.time(),
                "origin": request.headers.get('Origin', 'None'),
                "user_agent": request.headers.get('User-Agent', 'None')
            })

        @self.app.route('/download/<filename>')
        def download(filename):
            print(f"🔍 Download request received: {request.path} from {request.remote_addr}")
            print(f"🔍 Headers: {dict(request.headers)}")
            if self.securityMiddleware:
                # download_protection decorator logic
                result = self.securityMiddleware.download_protection(lambda: None)()
                if result: return result

            file_path = os.path.join(DATA_DIR, 'files', filename)
            self.connectionAnalyzer.log_connection(request.remote_addr or 'unknown', 'file_download', filename)

            if not os.path.exists(file_path):
                print(f"File not found: {file_path}")
                abort(404, "File not found")

            # Range support
            range_header = request.headers.get('Range', None)
            stat = os.stat(file_path)
            if range_header:
                start, end = 0, stat.st_size - 1
                match = range_header.replace("bytes=", "").split("-")
                if match[0]:
                    start = int(match[0])
                if len(match) > 1 and match[1]:
                    end = int(match[1])
                chunk_size = end - start + 1
                def generate():
                    with open(file_path, "rb") as f:
                        f.seek(start)
                        remaining = chunk_size
                        while remaining > 0:
                            data = f.read(min(4096, remaining))
                            if not data:
                                break
                            remaining -= len(data)
                            yield data
                rv = Response(generate(), 206, mimetype="application/octet-stream", direct_passthrough=True)
                rv.headers.add('Content-Range', f'bytes {start}-{end}/{stat.st_size}')
                rv.headers.add('Accept-Ranges', 'bytes')
                rv.headers.add('Content-Length', str(chunk_size))
                rv.headers.add('Content-Disposition', f'attachment; filename="{filename}"')
                return rv
            else:
                return send_file(file_path, as_attachment=True)

        @self.app.route('/stream/<streamId>/playlist.m3u8')
        def playlist(streamId):
            if self.securityMiddleware:
                result = self.securityMiddleware.stream_protection(lambda: None)()
                if result: return result
            self.connectionAnalyzer.log_connection(request.remote_addr or 'unknown', 'stream_request', f"playlist-{streamId}")
            playlist = self.generate_hls_playlist(streamId, DATA_DIR)
            return Response(playlist, mimetype="application/vnd.apple.mpegurl")

        @self.app.route('/stream/<streamId>/<segment>')
        def segment(streamId, segment):
            if self.securityMiddleware:
                result = self.securityMiddleware.stream_protection(lambda: None)()
                if result: return result
            self.connectionAnalyzer.log_connection(request.remote_addr or 'unknown', 'stream_request', f"{streamId}/{segment}")
            segment_path = os.path.join(DATA_DIR, 'streams', streamId, segment)
            if os.path.exists(segment_path):
                return send_file(segment_path, mimetype="video/MP2T")
            else:
                abort(404, "Segment not found")

        @self.app.route('/security/metrics')
        def security_metrics():
            if self.securityMiddleware:
                metrics = self.securityMiddleware.get_security_metrics()
                return jsonify(metrics)
            return jsonify({"defenseActive": False})

        @self.app.route('/security/status')
        def security_status():
            return jsonify({
                "defenseActive": self.config.enableDefense,
                "defenseMode": self.config.defenseMode,
                "protectedEndpoints": [
                    '/download/<filename>', '/stream/<streamId>/*'
                ] if self.config.enableDefense else [],
                "lastUpdate": time.strftime("%Y-%m-%dT%H:%M:%S"),
                **({
                    "warning": "Defense system is disabled - server is vulnerable to attacks"
                } if not self.config.enableDefense else {})
            })

    def generate_hls_playlist(self, streamId, DATA_DIR):
        stream_dir = os.path.join(DATA_DIR, 'streams', streamId)
        if not os.path.exists(stream_dir):
            return """#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-ENDLIST"""
        segments = sorted([
            f for f in os.listdir(stream_dir) if f.endswith(".ts")
        ])
        playlist = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n"
        for segment in segments:
            playlist += f"#EXTINF:10.0,\n{segment}\n"
        playlist += "#EXT-X-ENDLIST"
        return playlist

    def start(self, port=8000):
        if not self.isRunning:
            self.isRunning = True
            self.systemMonitor.start()
            if self.config.enableDefense:
                print('🚀 Streaming server started with optimistic ACK attack protection')
                print('🛡️ Defense mechanisms active:')
                print('  ✓ ACK validation (prevents optimistic ACK attacks)')
                print('  ✓ Rate limiting (prevents ACK flooding)')
                print('  ✓ Sequence tracking (detects sequence anomalies)')
                print('  ✓ Window size monitoring (detects abnormal growth)')
                print('  ✓ Anomaly detection (pattern-based detection)')
                print('  ✓ IP quarantine system (automatic blocking)')
                print('  ✓ Connection throttling (prevents resource exhaustion)')
                print(f'  ✓ Defense mode: {self.config.defenseMode.upper()}')
            else:
                print('🚀 Streaming server started WITHOUT PROTECTION')
                print('⚠️  WARNING: Server is vulnerable to attacks!')
                print('   - No ACK validation')
                print('   - No rate limiting')
                print('   - No anomaly detection')
                print('   - No IP blocking')
                print('   Use --defense true to enable protection')
            self.app.run(host="0.0.0.0", port=port, threaded=True)

    def stop(self):
        if self.isRunning:
            self.isRunning = False
            self.systemMonitor.stop()
            if self.securityMiddleware:
                self.securityMiddleware.destroy()
            print('🛑 Streaming server stopped, defense systems deactivated')

    def get_metrics(self):
        base_metrics = {
            "systemMetrics": self.systemMonitor.get_metrics(),
            "connectionMetrics": self.connectionAnalyzer.get_metrics(),
            "isRunning": self.isRunning,
            "defenseEnabled": self.config.enableDefense,
            "defenseMode": self.config.defenseMode
        }
        if self.securityMiddleware:
            return {
                **base_metrics,
                "securityMetrics": self.securityMiddleware.get_security_metrics(),
                "defenseActive": True
            }
        return {
            **base_metrics,
            "securityMetrics": None,
            "defenseActive": False
        }
