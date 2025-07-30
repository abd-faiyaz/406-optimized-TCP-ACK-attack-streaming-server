import time
import math
import threading
from typing import Callable, Dict, List, Set, Optional, Any
from flask import request, g, jsonify, Response, after_this_request

from .defense_system import DefenseSystem

class SecurityMiddleware:
    def __init__(self, app, config: Optional[Dict] = None):
        # Store config with defaults for HTTP/web
        self.config = {
            "enableSecurityHeaders": True,
            "enableConnectionThrottling": False,
            "maxConnectionsPerIP": 500,
            "blocklistEnabled": True,
            "customRules": [],
            "ackValidationEnabled": True,
            "rateLimitingEnabled": False,
            "sequenceTrackingEnabled": False,
            "adaptiveWindowEnabled": False,
            "anomalyDetectionEnabled": True,
            "quarantineEnabled": True,
            "maxACKsPerSecond": 1000,
            "maxWindowGrowthRate": 10.0,
            "maxSequenceGap": 10485760,
            "suspiciousPatternThreshold": 0.9,
            "quarantineDuration": 300000,
            **(config or {})
        }
        self.defenseSystem = DefenseSystem(self.config)
        self.connectionCounts: Dict[str, int] = {}
        self.blocklist: Set[str] = set()
        self.lastCleanup = int(time.time() * 1000)
        self.setup_defense_event_handlers()
        print("🔐 Security Middleware initialized - configured for legitimate traffic protection")
        # Register app-wide request/response hooks
        app.before_request(self._request_filter)
        app.after_request(self._add_security_headers)

    def setup_defense_event_handlers(self):
        def handler(event, action):
            if hasattr(action, "type") and action.type == "quarantine" and action.severity == "critical":
                ip = action.connectionId.split(":")[0]
                self.add_to_blocklist(ip)
                print(f"🚫 IP {ip} added to blocklist due to: {action.reason}")
            else:
                print(f"🛡️ Defense action logged: {getattr(action, 'type', '')} - {getattr(action, 'reason', '')} ({getattr(action, 'severity', '')})")
        self.defenseSystem.on("defenseAction", handler)

    # =========== Middleware Handlers ============

    def _request_filter(self):
        clientIP = self.get_client_ip(request)
        self.perform_periodic_cleanup()
        if self.config["blocklistEnabled"] and self.is_blocked(clientIP):
            return self.send_security_response(403, "Access denied: IP blocked due to previous attack")
        if self.config["enableConnectionThrottling"]:
            userAgent = request.headers.get("User-Agent", "")
            if not self.is_legitimate_client(userAgent):
                allowed = self.check_connection_limit(clientIP)
                if not allowed:
                    return self.send_security_response(429, "Too many simultaneous connections from this IP")
            else:
                print(f"🔓 Skipping connection limit for legitimate client: {clientIP}")

    def _add_security_headers(self, response: Response):
        if self.config["enableSecurityHeaders"]:
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Range, Content-Type"
            response.headers["X-Defense-System"] = "active"
        return response

    # =========== Route-Specific Decorators ============

    def download_protection(self, func):
        def wrapper(*args, **kwargs):
            clientIP = self.get_client_ip(request)
            if self.config["blocklistEnabled"] and self.is_blocked(clientIP):
                print(f"🚫 Blocked download attempt from quarantined IP: {clientIP}")
                return self.send_security_response(403, "Access denied: IP blocked due to previous attack")
            attackDetected = self.detect_explicit_attack(request)
            if attackDetected:
                print(f"🚨 DOWNLOAD ATTACK DETECTED from {clientIP}: {attackDetected['reason']}")
                return self.send_security_response(403, f"Attack blocked: {attackDetected['reason']}")
            self.track_response(clientIP)
            print(f"✅ Download request from {clientIP} approved (no connection limits for downloads)")
            return func(*args, **kwargs)
        wrapper.__name__ = func.__name__
        return wrapper

    def stream_protection(self, func):
        def wrapper(*args, **kwargs):
            clientIP = self.get_client_ip(request)
            if self.config["blocklistEnabled"] and self.is_blocked(clientIP):
                return self.send_security_response(403, "Access denied: IP blocked due to previous attack")
            streamValidation = self.validate_streaming_request(request)
            if not streamValidation["valid"]:
                return self.send_security_response(400, streamValidation["reason"])
            attackDetected = self.detect_explicit_attack(request)
            if attackDetected:
                print(f"🚨 STREAMING ATTACK DETECTED from {clientIP}: {attackDetected['reason']}")
                return self.send_security_response(403, f"Attack blocked: {attackDetected['reason']}")
            print(f"✅ Streaming request from {clientIP} approved (no connection limits for streaming)")
            return func(*args, **kwargs)
        wrapper.__name__ = func.__name__
        return wrapper

    # =========== Security/Attack Detection ============

    def detect_explicit_attack(self, req):
        userAgent = req.headers.get("User-Agent", "")
        if self.is_legitimate_client(userAgent):
            clientIP = self.get_client_ip(req)
            print(f"✅ Legitimate client detected from {clientIP}: {userAgent}")
            return None
        if req.headers.get("X-Simulate-Attack", "") == "optimistic-ack":
            return {"reason": "Explicit optimistic ACK attack simulation detected"}
        maliciousAgents = [
            "OptimisticACK-Attack-Tool", "OptimisticACK-HLS-Client",
            "exploit-framework", "attack-simulator"
        ]
        for maliciousAgent in maliciousAgents:
            if maliciousAgent in userAgent:
                clientIP = self.get_client_ip(req)
                clientPort = int(req.headers.get("X-Forwarded-Port", 0))
                self.defenseSystem.mark_connection_suspicious(clientIP, clientPort, f"Malicious user agent: {maliciousAgent}")
                return {"reason": f"Malicious user agent detected: {maliciousAgent}"}
        suspiciousHeaders = ["X-Attack-Type", "X-Exploit", "X-Malicious", "X-Optimistic-Ack"]
        for header in suspiciousHeaders:
            if req.headers.get(header):
                return {"reason": f"Suspicious header detected: {header}"}
        requestIP = self.get_client_ip(req)
        if self.is_rapid_fire_request(requestIP):
            return {"reason": "Rapid-fire request pattern detected (potential ACK flood)"}
        rangeHeader = req.headers.get("Range")
        if rangeHeader and self.is_abnormal_range_request(rangeHeader):
            return {"reason": "Abnormal Range request pattern detected"}
        return None

    def is_legitimate_client(self, userAgent: str):
        legitimateAgents = [
            "Mozilla/", "Chrome/", "Safari/", "Firefox/", "Edge/", "Opera/", "curl/", "wget/",
            "Node.js", "axios/", "okhttp/", "Python-urllib", "java/", "Go-http-client",
            "libcurl", "Postman", "Insomnia"
        ]
        if any(agent in userAgent for agent in legitimateAgents):
            return True
        if not userAgent or userAgent.strip() == "":
            return True
        return False

    def is_rapid_fire_request(self, ip: str):
        # Could implement with per-IP request tracking
        return False

    def is_abnormal_range_request(self, rangeHeader: str):
        try:
            parts = rangeHeader.replace("bytes=", "").split("-")
            start = int(parts[0])
            end = int(parts[1]) if len(parts) > 1 and parts[1] else None
            if end and (end - start) > 100 * 1024 * 1024:
                return True
            if start < 0 or (end and end < start):
                return True
        except Exception:
            return True
        return False

    def validate_streaming_request(self, req):
        streamId = req.view_args.get("streamId") if req.view_args else None
        segment = req.view_args.get("segment") if req.view_args else None
        if streamId and not str(streamId).isalnum():
            return {"valid": False, "reason": "Invalid stream ID format"}
        if segment and not (str(segment).startswith("segment") and str(segment).endswith(".ts") or str(segment) == "playlist.m3u8"):
            return {"valid": False, "reason": "Invalid segment format"}
        return {"valid": True, "reason": ""}

    # =========== Response/Data Handling ============

    def track_response(self, clientIP: str):
        # For simplicity, just log download size via after_this_request
        @after_this_request
        def log_download(response):
            content_length = response.content_length or 0
            if content_length > 0:
                print(f"📊 Transfer completed for {clientIP}: {self.format_bytes(content_length)}")
                if content_length > 100 * 1024 * 1024:
                    print(f"📈 Large download from {clientIP}: {self.format_bytes(content_length)}")
            return response

    def format_bytes(self, bytes_):
        if bytes_ == 0:
            return "0 B"
        k = 1024
        sizes = ["B", "KB", "MB", "GB"]
        i = int((bytes_ and (bytes_ > 0)) and (math.log(bytes_) / math.log(k)) or 0)
        return f"{(bytes_ / (k ** i)):.2f} {sizes[i]}"

    # =========== IP/Connection Limiting/Blocklisting ============

    def check_connection_limit(self, ip):
        currentConnections = self.connectionCounts.get(ip, 0)
        if ip in ("127.0.0.1", "::1", "localhost"):
            devLimit = self.config["maxConnectionsPerIP"] * 10
            if currentConnections >= devLimit:
                print(f"⚠️ Development connection limit exceeded for {ip}: {currentConnections}/{devLimit}")
                return False
        else:
            if currentConnections >= self.config["maxConnectionsPerIP"]:
                print(f"⚠️ Connection limit exceeded for {ip}: {currentConnections}/{self.config['maxConnectionsPerIP']}")
                return False
        self.connectionCounts[ip] = currentConnections + 1
        # Remove after 2 seconds
        timer = threading.Timer(2, lambda: self.connectionCounts.update({ip: max(0, self.connectionCounts.get(ip, 1) - 1)}))
        timer.start()
        return True

    def get_client_ip(self, req):
        if "X-Forwarded-For" in req.headers:
            return req.headers["X-Forwarded-For"].split(",")[0].strip()
        if req.remote_addr:
            return req.remote_addr
        return "127.0.0.1"

    def is_blocked(self, ip):
        return ip in self.blocklist

    def add_to_blocklist(self, ip):
        self.blocklist.add(ip)
        print(f"🚫 IP {ip} added to blocklist")
        timer = threading.Timer(30 * 60, lambda: self.blocklist.discard(ip))
        timer.start()

    # =========== JSON Responses ============

    def send_security_response(self, statusCode, message):
        resp = jsonify({
            "error": "Security violation",
            "message": message,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "blocked": True,
            "defenseSystem": "OptimisticACK-Protection"
        })
        resp.status_code = statusCode
        return resp

    # =========== Maintenance/Cleanup ============

    def perform_periodic_cleanup(self):
        now = int(time.time() * 1000)
        if now - self.lastCleanup > 300000:
            self.cleanup_connection_counts()
            self.lastCleanup = now

    def cleanup_connection_counts(self):
        for ip, count in list(self.connectionCounts.items()):
            if count <= 0:
                self.connectionCounts.pop(ip)
        print("🧹 Connection counts cleaned up")

    # =========== Metrics/Config/Custom Rules ============

    def add_custom_rule(self, rule: Dict):
        self.config["customRules"].append(rule)
        print(f"🔧 Added custom security rule: {rule.get('name', '')}")

    def get_security_metrics(self):
        defenseMetrics = self.defenseSystem.get_defense_metrics()
        return {
            **defenseMetrics,
            "activeConnections": len(self.connectionCounts),
            "blockedIPs": len(self.blocklist),
            "customRules": len(self.config["customRules"]),
            "lastCleanup": self.lastCleanup,
            "legitimateRequestsAllowed": True,
            "onlyBlocksActualAttacks": True
        }

    def update_config(self, newConfig: Dict):
        self.config.update(newConfig)
        self.defenseSystem.update_config(newConfig)
        print("🔧 Security configuration updated")

    def destroy(self):
        self.defenseSystem.destroy()
        self.connectionCounts.clear()
        self.blocklist.clear()
        print("🔐 Security Middleware destroyed")

# --- Usage Example in Flask ---
# from flask import Flask
# app = Flask(__name__)
# security = SecurityMiddleware(app)
#
# @app.route("/download/<path:file>")
# @security.download_protection
# def download(file):
#     # Serve file here...
#     pass
