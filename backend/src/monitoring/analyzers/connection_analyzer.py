import threading
import time
from collections import defaultdict
from typing import List, Dict, Optional, Callable, Any

# Data structures

class ConnectionData:
    def __init__(self, ip: str, timestamp: float, type: str, resource=None, userAgent=None, bytesTransferred=0, duration=None):
        self.ip = ip
        self.timestamp = timestamp
        self.type = type
        self.resource = resource
        self.userAgent = userAgent
        self.bytesTransferred = bytesTransferred
        self.duration = duration

class SuspiciousActivity:
    def __init__(self, ip: str, type: str, timestamp: float, details: str, severity: str):
        self.ip = ip
        self.type = type
        self.timestamp = timestamp
        self.details = details
        self.severity = severity

class ConnectionMetrics:
    def __init__(self):
        self.totalConnections = 0
        self.activeConnections = 0
        self.connectionsByType = {}
        self.averageConnectionDuration = 0
        self.totalBytesTransferred = 0
        self.uniqueIPs = 0
        self.suspiciousActivity: List[SuspiciousActivity] = []

class ConnectionAnalyzer:
    def __init__(self):
        self.connections: Dict[str, List[ConnectionData]] = defaultdict(list)
        self.activeConnections: set = set()
        self.metrics = ConnectionMetrics()
        self.maxConnectionHistory = 1000
        self.suspiciousThresholds = {
            'rapidRequests': 10,
            'largeDownload': 100 * 1024 * 1024,
            'connectionDuration': 300000  # 5 minutes in ms
        }
        self.suspicious_callbacks: List[Callable[[SuspiciousActivity], Any]] = []
        self.analysisInterval: Optional[threading.Timer] = None
        self._start_analysis()

    def initialize_metrics(self):
        return ConnectionMetrics()

    def log_connection(self, ip: str, type: str, resource=None, userAgent=None) -> str:
        connectionId = self._generate_connection_id()
        connectionData = ConnectionData(
            ip=ip,
            timestamp=time.time() * 1000,
            type=type,
            resource=resource,
            userAgent=userAgent
        )
        self.connections[ip].append(connectionData)
        if len(self.connections[ip]) > self.maxConnectionHistory:
            self.connections[ip].pop(0)
        self.activeConnections.add(connectionId)
        self._update_metrics()
        self._check_suspicious_activity(ip, connectionData)
        return connectionId

    def update_connection_bytes(self, connectionId: str, bytes_: int):
        for ip, connections in self.connections.items():
            for connection in connections:
                if self._generate_connection_id_from(connection) == connectionId:
                    connection.bytesTransferred = bytes_
                    self._update_metrics()
                    if bytes_ > self.suspiciousThresholds['largeDownload']:
                        self._flag_suspicious_activity(ip, 'large_download',
                            f"Large download detected: {self._format_bytes(bytes_)}", 'medium')
                    return

    def close_connection(self, connectionId: str):
        self.activeConnections.discard(connectionId)
        for connections in self.connections.values():
            for connection in connections:
                if self._generate_connection_id_from(connection) == connectionId:
                    connection.duration = time.time() * 1000 - connection.timestamp
                    break
        self._update_metrics()

    def _generate_connection_id(self):
        return f"{int(time.time() * 1000)}_{hex(int(time.time() * 1000000) % 0xffffff)[2:]}"

    def _generate_connection_id_from(self, connection: ConnectionData):
        return f"{connection.ip}_{int(connection.timestamp)}_{connection.type}"

    def _update_metrics(self):
        allConnections = []
        uniqueIPs = set()
        for ip, connections in self.connections.items():
            uniqueIPs.add(ip)
            allConnections.extend(connections)
        self.metrics.totalConnections = len(allConnections)
        self.metrics.activeConnections = len(self.activeConnections)
        self.metrics.uniqueIPs = len(uniqueIPs)
        # Connection types
        self.metrics.connectionsByType = {}
        for connection in allConnections:
            self.metrics.connectionsByType[connection.type] = self.metrics.connectionsByType.get(connection.type, 0) + 1
        # Average duration and total bytes
        completedConnections = [c for c in allConnections if c.duration]
        if completedConnections:
            self.metrics.averageConnectionDuration = sum(c.duration for c in completedConnections) / len(completedConnections)
        else:
            self.metrics.averageConnectionDuration = 0
        self.metrics.totalBytesTransferred = sum(c.bytesTransferred or 0 for c in allConnections)

    def _check_suspicious_activity(self, ip: str, newConnection: ConnectionData):
        ipConnections = self.connections.get(ip, [])
        now = time.time() * 1000
        recentConnections = [c for c in ipConnections if now - c.timestamp < 60000]
        # rapid requests
        if len(recentConnections) >= self.suspiciousThresholds['rapidRequests']:
            self._flag_suspicious_activity(ip, 'rapid_requests',
                f"{len(recentConnections)} requests in the last minute", 'high')
        # repeated file downloads
        typeCount = sum(1 for c in recentConnections if c.type == newConnection.type)
        if typeCount > 5 and newConnection.type == 'file_download':
            self._flag_suspicious_activity(ip, 'unusual_pattern',
                f"Repeated {newConnection.type} requests", 'medium')

    def _flag_suspicious_activity(self, ip: str, type_: str, details: str, severity: str):
        activity = SuspiciousActivity(
            ip=ip,
            type=type_,
            timestamp=time.time() * 1000,
            details=details,
            severity=severity
        )
        self.metrics.suspiciousActivity.append(activity)
        if len(self.metrics.suspiciousActivity) > 100:
            self.metrics.suspiciousActivity.pop(0)
        # Emit event via callback
        for cb in self.suspicious_callbacks:
            cb(activity)

    def add_suspicious_callback(self, callback: Callable[[SuspiciousActivity], Any]):
        self.suspicious_callbacks.append(callback)

    def _start_analysis(self):
        def periodic():
            self._cleanup_old_connections()
            self._perform_security_analysis()
            self.analysisInterval = threading.Timer(30, periodic)
            self.analysisInterval.daemon = True
            self.analysisInterval.start()
        periodic()

    def _cleanup_old_connections(self):
        cutoffTime = time.time() * 1000 - 24 * 60 * 60 * 1000
        for ip in list(self.connections.keys()):
            filtered = [c for c in self.connections[ip] if c.timestamp > cutoffTime]
            if not filtered:
                del self.connections[ip]
            else:
                self.connections[ip] = filtered
        self.metrics.suspiciousActivity = [
            a for a in self.metrics.suspiciousActivity if time.time() * 1000 - a.timestamp < 24 * 60 * 60 * 1000
        ]

    def _perform_security_analysis(self):
        now = time.time() * 1000
        for ip, connections in self.connections.items():
            recentConnections = [c for c in connections if now - c.timestamp < 300000]
            # potential DDoS
            if len(recentConnections) > 20:
                self._flag_suspicious_activity(ip, 'unusual_pattern',
                    'Potential DDoS pattern detected', 'high')
            # data exfiltration
            totalBytes = sum(c.bytesTransferred or 0 for c in recentConnections)
            if totalBytes > 500 * 1024 * 1024:
                self._flag_suspicious_activity(ip, 'large_download',
                    'Potential data exfiltration detected', 'high')

    def _format_bytes(self, bytes_):
        if bytes_ >= 1024 ** 3:
            return f"{bytes_ / 1024 ** 3:.2f} GB"
        elif bytes_ >= 1024 ** 2:
            return f"{bytes_ / 1024 ** 2:.2f} MB"
        elif bytes_ >= 1024:
            return f"{bytes_ / 1024:.2f} KB"
        return f"{bytes_} B"

    def get_metrics(self):
        return self.metrics

    def get_connection_history(self, ip=None):
        if ip:
            return self.connections.get(ip, [])
        allConnections = []
        for connections in self.connections.values():
            allConnections.extend(connections)
        return sorted(allConnections, key=lambda c: -c.timestamp)

    def destroy(self):
        if self.analysisInterval:
            self.analysisInterval.cancel()
            self.analysisInterval = None
        self.connections.clear()
        self.activeConnections.clear()
        self.suspicious_callbacks.clear()

# Example usage (no Flask endpoints here yet):
# analyzer = ConnectionAnalyzer()
# connection_id = analyzer.log_connection('127.0.0.1', 'file_download')
# analyzer.update_connection_bytes(connection_id, 150000000)
# analyzer.close_connection(connection_id)
# print(analyzer.get_metrics().__dict__)

