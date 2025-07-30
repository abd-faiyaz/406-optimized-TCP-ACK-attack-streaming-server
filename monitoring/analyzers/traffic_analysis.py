from dataclasses import dataclass, field
from typing import List, Dict
import time

@dataclass
class TrafficPattern:
    timestamp: int
    source_ip: str
    destination_ip: str
    source_port: int
    destination_port: int
    sequence_number: int
    ack_number: int
    window_size: int
    flags: List[str]
    data_length: int

@dataclass
class AttackSignature:
    rapid_acks: bool
    abnormal_window_growth: bool
    sequence_gaps: bool
    suspicious_pattern: bool

class TrafficAnalyzer:
    def __init__(self):
        self.traffic_history: List[TrafficPattern] = []
        self.window_size_history: Dict[str, List[int]] = {}
        self.ack_frequency_map: Dict[str, List[int]] = {}

    def analyze_packet(self, packet: TrafficPattern) -> AttackSignature:
        self.traffic_history.append(packet)
        self.update_window_size_history(packet)
        self.update_ack_frequency(packet)

        # Trim history to prevent memory issues
        if len(self.traffic_history) > 10000:
            self.traffic_history = self.traffic_history[-5000:]

        return self.detect_attack_signatures(packet)

    def update_window_size_history(self, packet: TrafficPattern):
        connection_key = f"{packet.source_ip}:{packet.source_port}"
        if connection_key not in self.window_size_history:
            self.window_size_history[connection_key] = []
        history = self.window_size_history[connection_key]
        history.append(packet.window_size)
        # Keep only recent history
        if len(history) > 100:
            del history[:len(history)-50]

    def update_ack_frequency(self, packet: TrafficPattern):
        if "ACK" not in packet.flags:
            return
        connection_key = f"{packet.source_ip}:{packet.source_port}"
        current_time = packet.timestamp
        if connection_key not in self.ack_frequency_map:
            self.ack_frequency_map[connection_key] = []
        ack_times = self.ack_frequency_map[connection_key]
        ack_times.append(current_time)
        # Remove old entries (older than 10 seconds)
        cutoff_time = current_time - 10000
        while ack_times and ack_times[0] < cutoff_time:
            ack_times.pop(0)

    def detect_attack_signatures(self, packet: TrafficPattern) -> AttackSignature:
        connection_key = f"{packet.source_ip}:{packet.source_port}"
        return AttackSignature(
            rapid_acks=self.detect_rapid_acks(connection_key),
            abnormal_window_growth=self.detect_abnormal_window_growth(connection_key),
            sequence_gaps=self.detect_sequence_gaps(packet),
            suspicious_pattern=self.detect_suspicious_pattern(connection_key)
        )

    def detect_rapid_acks(self, connection_key: str) -> bool:
        ack_times = self.ack_frequency_map.get(connection_key, [])
        if len(ack_times) < 10:
            return False
        recent_time = int(time.time() * 1000) - 5000
        recent_acks = [t for t in ack_times if t > recent_time]
        return len(recent_acks) > 50

    def detect_abnormal_window_growth(self, connection_key: str) -> bool:
        window_history = self.window_size_history.get(connection_key, [])
        if len(window_history) < 5:
            return False
        recent = window_history[-5:]
        growth_count = 0
        for i in range(1, len(recent)):
            if recent[i] > recent[i-1] * 1.5:
                growth_count += 1
        return growth_count >= 3

    def detect_sequence_gaps(self, packet: TrafficPattern) -> bool:
        recent_packets = [p for p in self.traffic_history
                          if p.source_ip == packet.source_ip and p.source_port == packet.source_port][-10:]
        if len(recent_packets) < 2:
            return False
        last_packet = recent_packets[-2]
        ack_gap = abs(packet.ack_number - last_packet.ack_number)
        return ack_gap > 1000000  # 1MB gap

    def detect_suspicious_pattern(self, connection_key: str) -> bool:
        rapid = self.detect_rapid_acks(connection_key)
        abnormal = self.detect_abnormal_window_growth(connection_key)
        return rapid and abnormal

    def get_traffic_summary(self):
        connection_count = len(set(f"{p.source_ip}:{p.source_port}" for p in self.traffic_history))
        total_packets = len(self.traffic_history)
        ack_packets = len([p for p in self.traffic_history if "ACK" in p.flags])
        return {
            "connection_count": connection_count,
            "total_packets": total_packets,
            "ack_packets": ack_packets,
            "ack_percentage": (ack_packets / total_packets) * 100 if total_packets > 0 else 0,
            "time_range": {
                "start": self.traffic_history[0].timestamp if self.traffic_history else 0,
                "end": self.traffic_history[-1].timestamp if self.traffic_history else 0
            }
        }
