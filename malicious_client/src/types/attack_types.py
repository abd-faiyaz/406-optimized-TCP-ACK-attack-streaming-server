from dataclasses import dataclass

@dataclass
class AttackConfig:
    target_host: str
    target_port: int
    attack_duration: int          # seconds (or ms, depending on original use)
    packet_interval: int          # ms (or seconds, adjust as needed)
    ack_advance_size: int
    window_scale: int

@dataclass
class AttackMetrics:
    packets_pressed: int
    successful_acks: int
    connection_established: bool
    attack_start_time: int        # unix timestamp (int)
    current_speed: float          # bytes/sec or similar
    total_data_transferred: int
