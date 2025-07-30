import time
import threading
from typing import Dict, List, Set, Optional, Callable, Any

class DefenseConfig:
    def __init__(self, **kwargs):
        self.ackValidationEnabled = kwargs.get("ackValidationEnabled", True)
        self.rateLimitingEnabled = kwargs.get("rateLimitingEnabled", True)
        self.sequenceTrackingEnabled = kwargs.get("sequenceTrackingEnabled", True)
        self.adaptiveWindowEnabled = kwargs.get("adaptiveWindowEnabled", True)
        self.anomalyDetectionEnabled = kwargs.get("anomalyDetectionEnabled", True)
        self.quarantineEnabled = kwargs.get("quarantineEnabled", True)
        self.maxACKsPerSecond = kwargs.get("maxACKsPerSecond", 100)
        self.maxWindowGrowthRate = kwargs.get("maxWindowGrowthRate", 2.0)
        self.maxSequenceGap = kwargs.get("maxSequenceGap", 1048576)
        self.suspiciousPatternThreshold = kwargs.get("suspiciousPatternThreshold", 0.7)
        self.quarantineDuration = kwargs.get("quarantineDuration", 300000) # ms

class ConnectionState:
    def __init__(self, ip, port):
        self.ip = ip
        self.port = port
        self.expectedSeq = 0
        self.expectedAck = 0
        self.lastValidAck = 0
        self.windowSize = 0
        self.ackCount = 0
        self.lastACKTime = int(time.time() * 1000)
        self.suspicious = False
        self.quarantined = False
        self.quarantineUntil = 0
        self.anomalyScore = 0

class DefenseAction:
    def __init__(self, type_, reason, severity, timestamp, connectionId):
        self.type = type_
        self.reason = reason
        self.severity = severity
        self.timestamp = timestamp
        self.connectionId = connectionId

class AttackSignature:
    def __init__(self, rapidACKs=False, abnormalWindowGrowth=False, sequenceGaps=False, suspiciousPattern=False):
        self.rapidACKs = rapidACKs
        self.abnormalWindowGrowth = abnormalWindowGrowth
        self.sequenceGaps = sequenceGaps
        self.suspiciousPattern = suspiciousPattern

class DefenseSystem:
    def __init__(self, config: Optional[Dict] = None):
        self.config = DefenseConfig(**(config or {}))
        self.connectionStates: Dict[str, ConnectionState] = {}
        self.quarantinedIPs: Set[str] = set()
        self.defenseActions: List[DefenseAction] = []
        self.cleanupInterval: Optional[threading.Timer] = None
        self.callbacks: List[Callable[[str, Any], None]] = []
        self._start_defense_monitoring()
        print(f'🛡️ Defense System initialized with config: {vars(self.config)}')

    def on(self, event: str, callback: Callable[[Any], None]):
        # For now only 'defenseAction' event is supported
        if event == 'defenseAction':
            self.callbacks.append(callback)

    def validate_connection(self, ip, port, seq, ack, windowSize, flags=None):
        if flags is None:
            flags = []
        connectionId = f"{ip}:{port}"
        # Quarantine check
        if self.is_quarantined(ip):
            return {
                "allowed": False,
                "action": self._create_defense_action('block', 'IP is quarantined', 'high', connectionId)
            }
        state = self._get_or_create_connection_state(ip, port)
        attackSignature = AttackSignature()
        result = self._run_defense_checks(state, seq, ack, windowSize, flags, attackSignature)
        if result["allowed"]:
            self._update_connection_state(state, seq, ack, windowSize)
        return result

    def _run_defense_checks(self, state, seq, ack, windowSize, flags, signature: AttackSignature):
        connectionId = f"{state.ip}:{state.port}"
        isLikelyAttack = state.suspicious or state.anomalyScore > 0.5
        # 1. ACK Validation
        if self.config.ackValidationEnabled and 'ACK' in flags and isLikelyAttack:
            ackValidation = self._validate_ack_number(state, ack)
            if not ackValidation["valid"]:
                self._update_anomaly_score(state, 0.3)
                return {
                    "allowed": False,
                    "action": self._create_defense_action('reject_packet', ackValidation["reason"], 'high', connectionId)
                }
        # 2. Rate Limiting
        if self.config.rateLimitingEnabled and 'ACK' in flags:
            rateLimitCheck = self._check_ack_rate_limit(state)
            if not rateLimitCheck["allowed"]:
                self._update_anomaly_score(state, 0.2)
                return {
                    "allowed": False,
                    "action": self._create_defense_action('rate_limit', rateLimitCheck["reason"], 'medium', connectionId)
                }
        # 3. Sequence Tracking
        if self.config.sequenceTrackingEnabled:
            seqValidation = self._validate_sequence_number(state, seq)
            if not seqValidation["valid"]:
                self._update_anomaly_score(state, 0.25)
                return {
                    "allowed": False,
                    "action": self._create_defense_action('reject_packet', seqValidation["reason"], 'medium', connectionId)
                }
        # 4. Window Size Validation
        if self.config.adaptiveWindowEnabled:
            windowValidation = self._validate_window_size(state, windowSize)
            if not windowValidation["valid"]:
                self._update_anomaly_score(state, 0.2)
                # Don't block, just alert
                self._create_defense_action('alert', windowValidation["reason"], 'medium', connectionId)
        # 5. Anomaly Detection
        if self.config.anomalyDetectionEnabled:
            anomalyCheck = self._detect_anomalies(state, signature)
            if anomalyCheck["anomalous"]:
                self._update_anomaly_score(state, 0.4)
                if state.anomalyScore >= self.config.suspiciousPatternThreshold:
                    self._quarantine_ip(state.ip)
                    return {
                        "allowed": False,
                        "action": self._create_defense_action('quarantine', anomalyCheck["reason"], 'critical', connectionId)
                    }
                return {
                    "allowed": False,
                    "action": self._create_defense_action('block', anomalyCheck["reason"], 'high', connectionId)
                }
        return {"allowed": True}

    def _validate_ack_number(self, state: ConnectionState, ack: int):
        ackAdvance = ack - state.lastValidAck
        suspiciousAdvanceThreshold = self.config.maxSequenceGap * 2
        if ackAdvance > suspiciousAdvanceThreshold:
            return {"valid": False,
                    "reason": f"Highly suspicious ACK detected: advancing {ackAdvance} bytes beyond expected (threshold: {suspiciousAdvanceThreshold})"}
        if ack < state.lastValidAck - 1024 and state.lastValidAck > 1024:
            return {"valid": False, "reason": f"Significant ACK regression detected: {ack} << {state.lastValidAck}"}
        return {"valid": True, "reason": ""}

    def _check_ack_rate_limit(self, state: ConnectionState):
        now = int(time.time() * 1000)
        timeSinceLastACK = now - state.lastACKTime
        if timeSinceLastACK > 1000:
            state.ackCount = 0
            state.lastACKTime = now
        state.ackCount += 1
        effectiveLimit = self.config.maxACKsPerSecond * 3
        if state.ackCount > effectiveLimit:
            return {"allowed": False,
                    "reason": f"Extreme ACK rate limit exceeded: {state.ackCount} ACKs/second (limit: {effectiveLimit})"}
        return {"allowed": True, "reason": ""}

    def _validate_sequence_number(self, state: ConnectionState, seq: int):
        maxSeqDeviation = 65536
        if state.expectedSeq > 0:
            seqDeviation = abs(seq - state.expectedSeq)
            if seqDeviation > maxSeqDeviation:
                return {"valid": False, "reason": f"Sequence number deviation too large: {seqDeviation} bytes"}
        return {"valid": True, "reason": ""}

    def _validate_window_size(self, state: ConnectionState, windowSize: int):
        if state.windowSize > 0:
            growthRate = windowSize / state.windowSize
            if growthRate > self.config.maxWindowGrowthRate:
                return {"valid": False, "reason": f"Abnormal window growth: {growthRate:.2f}x increase"}
        return {"valid": True, "reason": ""}

    def _detect_anomalies(self, state: ConnectionState, signature: AttackSignature):
        anomalies = []
        if signature.rapidACKs: anomalies.append('rapid ACK pattern')
        if signature.abnormalWindowGrowth: anomalies.append('abnormal window growth')
        if signature.sequenceGaps: anomalies.append('large sequence gaps')
        if signature.suspiciousPattern: anomalies.append('suspicious traffic pattern')
        if len(anomalies) >= 2:
            return {"anomalous": True, "reason": f"Multiple attack indicators: {', '.join(anomalies)}"}
        return {"anomalous": False, "reason": ""}

    def _get_or_create_connection_state(self, ip, port) -> ConnectionState:
        connectionId = f"{ip}:{port}"
        if connectionId not in self.connectionStates:
            self.connectionStates[connectionId] = ConnectionState(ip, port)
        return self.connectionStates[connectionId]

    def _update_connection_state(self, state, seq, ack, windowSize):
        state.expectedSeq = seq
        state.expectedAck = ack
        state.lastValidAck = max(state.lastValidAck, ack)
        state.windowSize = windowSize
        state.anomalyScore = max(0, state.anomalyScore - 0.01)

    def _update_anomaly_score(self, state, increment):
        state.anomalyScore = min(1.0, state.anomalyScore + increment)
        if state.anomalyScore > 0.5:
            state.suspicious = True

    def _quarantine_ip(self, ip):
        if not self.config.quarantineEnabled:
            return
        self.quarantinedIPs.add(ip)
        for state in self.connectionStates.values():
            if state.ip == ip:
                state.quarantined = True
                state.quarantineUntil = int(time.time() * 1000) + self.config.quarantineDuration
        print(f"🚫 IP {ip} quarantined for {self.config.quarantineDuration / 1000} seconds")
        # Schedule auto-remove from quarantine
        timer = threading.Timer(self.config.quarantineDuration / 1000, self._remove_from_quarantine, args=(ip,))
        timer.start()

    def _remove_from_quarantine(self, ip):
        self.quarantinedIPs.discard(ip)
        for state in self.connectionStates.values():
            if state.ip == ip:
                state.quarantined = False
                state.quarantineUntil = 0
                state.anomalyScore = 0
        print(f"✅ IP {ip} removed from quarantine")

    def is_quarantined(self, ip):
        return ip in self.quarantinedIPs

    def _create_defense_action(self, type_, reason, severity, connectionId):
        action = DefenseAction(type_, reason, severity, int(time.time() * 1000), connectionId)
        self.defenseActions.append(action)
        if len(self.defenseActions) > 1000:
            self.defenseActions = self.defenseActions[-500:]
        for cb in self.callbacks:
            cb('defenseAction', action)
        print(f"🛡️ Defense Action: {type_} - {reason} ({severity})")
        return vars(action)

    def _start_defense_monitoring(self):
        def periodic():
            self._cleanup_expired_states()
            self.cleanupInterval = threading.Timer(60, periodic)
            self.cleanupInterval.daemon = True
            self.cleanupInterval.start()
        periodic()

    def _cleanup_expired_states(self):
        now = int(time.time() * 1000)
        expiredConnections = []
        for connectionId, state in list(self.connectionStates.items()):
            if now - state.lastACKTime > 600000:
                expiredConnections.append(connectionId)
            if state.quarantined and now > state.quarantineUntil:
                self._remove_from_quarantine(state.ip)
        for connectionId in expiredConnections:
            del self.connectionStates[connectionId]
        if expiredConnections:
            print(f"🧹 Cleaned up {len(expiredConnections)} expired connection states")

    def get_defense_metrics(self):
        now = int(time.time() * 1000)
        recentActions = [a for a in self.defenseActions if now - a.timestamp < 300000]
        actionsByType = {}
        actionsBySeverity = {}
        for action in recentActions:
            actionsByType[action.type] = actionsByType.get(action.type, 0) + 1
            actionsBySeverity[action.severity] = actionsBySeverity.get(action.severity, 0) + 1
        return {
            "totalConnections": len(self.connectionStates),
            "quarantinedIPs": len(self.quarantinedIPs),
            "suspiciousConnections": sum(1 for s in self.connectionStates.values() if s.suspicious),
            "recentActions": len(recentActions),
            "actionsByType": actionsByType,
            "actionsBySeverity": actionsBySeverity,
            "config": vars(self.config)
        }

    def update_config(self, newConfig: Dict):
        for k, v in newConfig.items():
            setattr(self.config, k, v)
        print(f'🔧 Defense configuration updated: {newConfig}')

    def force_remove_from_quarantine(self, ip):
        if ip in self.quarantinedIPs:
            self._remove_from_quarantine(ip)
            return True
        return False

    def get_connection_state(self, ip, port):
        return self.connectionStates.get(f"{ip}:{port}")

    def mark_connection_suspicious(self, ip, port, reason):
        state = self._get_or_create_connection_state(ip, port)
        state.suspicious = True
        state.anomalyScore = min(1.0, state.anomalyScore + 0.5)
        print(f"🚨 Connection {ip}:{port} marked as suspicious: {reason}")
        self._create_defense_action('alert', f"Connection marked suspicious: {reason}", 'medium', f"{ip}:{port}")

    def is_connection_suspicious(self, ip, port):
        state = self.connectionStates.get(f"{ip}:{port}")
        return state.suspicious if state else False

    def destroy(self):
        if self.cleanupInterval:
            self.cleanupInterval.cancel()
            self.cleanupInterval = None
        self.connectionStates.clear()
        self.quarantinedIPs.clear()
        self.callbacks.clear()
        print('🛡️ Defense System destroyed')
