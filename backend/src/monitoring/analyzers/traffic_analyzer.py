from typing import List, Dict, Any
import time

class TrafficPattern:
    def __init__(self, timestamp: int, sourceIP: str, destinationIP: str, sourcePort: int, destinationPort: int,
                 sequenceNumber: int, ackNumber: int, windowSize: int, flags: List[str], dataLength: int):
        self.timestamp = timestamp
        self.sourceIP = sourceIP
        self.destinationIP = destinationIP
        self.sourcePort = sourcePort
        self.destinationPort = destinationPort
        self.sequenceNumber = sequenceNumber
        self.ackNumber = ackNumber
        self.windowSize = windowSize
        self.flags = flags
        self.dataLength = dataLength

class AttackSignature:
    def __init__(self, rapidACKs: bool, abnormalWindowGrowth: bool, sequenceGaps: bool, suspiciousPattern: bool):
        self.rapidACKs = rapidACKs
        self.abnormalWindowGrowth = abnormalWindowGrowth
        self.sequenceGaps = sequenceGaps
        self.suspiciousPattern = suspiciousPattern

class TrafficAnalyzer:
    def __init__(self):
        self.trafficHistory: List[TrafficPattern] = []
        self.windowSizeHistory: Dict[str, List[int]] = {}
        self.ackFrequencyMap: Dict[str, List[int]] = {}

    def analyze_packet(self, packet: TrafficPattern) -> AttackSignature:
        self.trafficHistory.append(packet)
        self.update_window_size_history(packet)
        self.update_ack_frequency(packet)

        # Trim history to prevent memory issues
        if len(self.trafficHistory) > 10000:
            self.trafficHistory = self.trafficHistory[-5000:]

        return self.detect_attack_signatures(packet)

    def update_window_size_history(self, packet: TrafficPattern):
        connectionKey = f"{packet.sourceIP}:{packet.sourcePort}"

        if connectionKey not in self.windowSizeHistory:
            self.windowSizeHistory[connectionKey] = []
        history = self.windowSizeHistory[connectionKey]
        history.append(packet.windowSize)
        # Keep only recent history
        if len(history) > 100:
            self.windowSizeHistory[connectionKey] = history[-50:]

    def update_ack_frequency(self, packet: TrafficPattern):
        if "ACK" not in packet.flags:
            return
        connectionKey = f"{packet.sourceIP}:{packet.sourcePort}"
        currentTime = packet.timestamp

        if connectionKey not in self.ackFrequencyMap:
            self.ackFrequencyMap[connectionKey] = []
        ackTimes = self.ackFrequencyMap[connectionKey]
        ackTimes.append(currentTime)
        # Remove old entries (older than 10 seconds)
        cutoffTime = currentTime - 10000
        while ackTimes and ackTimes[0] < cutoffTime:
            ackTimes.pop(0)

    def detect_attack_signatures(self, packet: TrafficPattern) -> AttackSignature:
        connectionKey = f"{packet.sourceIP}:{packet.sourcePort}"

        return AttackSignature(
            rapidACKs=self.detect_rapid_acks(connectionKey),
            abnormalWindowGrowth=self.detect_abnormal_window_growth(connectionKey),
            sequenceGaps=self.detect_sequence_gaps(packet),
            suspiciousPattern=self.detect_suspicious_pattern(connectionKey)
        )

    def detect_rapid_acks(self, connectionKey: str) -> bool:
        ackTimes = self.ackFrequencyMap.get(connectionKey)
        if not ackTimes or len(ackTimes) < 10:
            return False
        recentTime = int(time.time() * 1000) - 5000
        recentACKs = [t for t in ackTimes if t > recentTime]
        return len(recentACKs) > 50

    def detect_abnormal_window_growth(self, connectionKey: str) -> bool:
        windowHistory = self.windowSizeHistory.get(connectionKey)
        if not windowHistory or len(windowHistory) < 5:
            return False
        recent = windowHistory[-5:]
        growthCount = 0
        for i in range(1, len(recent)):
            if recent[i] > recent[i-1] * 1.5:
                growthCount += 1
        return growthCount >= 3

    def detect_sequence_gaps(self, packet: TrafficPattern) -> bool:
        recentPackets = [p for p in self.trafficHistory
                         if p.sourceIP == packet.sourceIP and p.sourcePort == packet.sourcePort][-10:]
        if len(recentPackets) < 2:
            return False
        lastPacket = recentPackets[-2]
        ackGap = abs(packet.ackNumber - lastPacket.ackNumber)
        return ackGap > 1000000

    def detect_suspicious_pattern(self, connectionKey: str) -> bool:
        rapidACKs = self.detect_rapid_acks(connectionKey)
        abnormalWindowGrowth = self.detect_abnormal_window_growth(connectionKey)
        return rapidACKs and abnormalWindowGrowth

    def get_traffic_summary(self) -> Dict[str, Any]:
        connectionCount = len(set(f"{p.sourceIP}:{p.sourcePort}" for p in self.trafficHistory))
        totalPackets = len(self.trafficHistory)
        ackPackets = sum(1 for p in self.trafficHistory if "ACK" in p.flags)
        ackPercentage = (ackPackets / totalPackets) * 100 if totalPackets > 0 else 0
        timeRange = {
            "start": self.trafficHistory[0].timestamp if self.trafficHistory else 0,
            "end": self.trafficHistory[-1].timestamp if self.trafficHistory else 0
        }
        return {
            "connectionCount": connectionCount,
            "totalPackets": totalPackets,
            "ackPackets": ackPackets,
            "ackPercentage": ackPercentage,
            "timeRange": timeRange
        }
