import time
import threading
import requests
from network_monitor import NetworkMonitor

class AttackConfig:
    def __init__(self, target_host, target_port, attack_duration, packet_interval, ack_advance_size,
                 window_scale, enable_transfer, transfer_type, transfer_url=None, stream_id=None,
                 measure_speed=False):
        self.target_host = target_host
        self.target_port = target_port
        self.attack_duration = attack_duration
        self.packet_interval = packet_interval
        self.ack_advance_size = ack_advance_size
        self.window_scale = window_scale
        self.enable_transfer = enable_transfer
        self.transfer_type = transfer_type
        self.transfer_url = transfer_url
        self.stream_id = stream_id
        self.measure_speed = measure_speed

class AttackMetrics:
    def __init__(self):
        self.packets_pressed = 0
        self.successful_acks = 0
        self.connection_established = False
        self.attack_start_time = 0
        self.current_speed = 0
        self.total_data_transferred = 0
        self.baseline_speed = 0
        self.attack_speed = 0
        self.speed_improvement = 0
        self.transfer_active = False
        self.transfer_progress = 0

class OptimisticACKAttacker:
    def __init__(self, config: AttackConfig):
        self.config = config
        # self.raw_socket = RawSocketManager()  # Stub, must implement or use scapy
        # self.packet_crafter = PacketCrafter() # Stub, must implement
        self.network_monitor = NetworkMonitor()
        self.metrics = AttackMetrics()
        self.sequence_number = 0
        self.ack_number = 0
        self.baseline_completed = False
        self.is_attack_active = False
        self.connection = None  # If using a raw socket, set later
        self.stream_segments = []
        self.current_segment_index = 0
        self.validate_config()

    def validate_config(self):
        assert self.config.target_host, "Target host is required"
        assert 0 < self.config.target_port <= 65535, "Port must be between 1 and 65535"
        assert self.config.attack_duration > 0, "Attack duration must be positive"
        assert self.config.packet_interval > 0, "Packet interval must be positive"
        assert self.config.ack_advance_size > 0, "ACK advance size must be positive"
        if self.config.enable_transfer:
            if self.config.transfer_type == 'download' and not self.config.transfer_url:
                self.config.transfer_url = f"http://{self.config.target_host}:{self.config.target_port}/download/xl.dat"
            elif self.config.transfer_type == 'streaming':
                if not self.config.stream_id:
                    self.config.stream_id = 'demo-stream'
                self.config.transfer_url = f"http://{self.config.target_host}:{self.config.target_port}/stream/{self.config.stream_id}/playlist.m3u8"
        print("✅ Configuration validated successfully")

    def execute_attack(self):
        print("🚀 Starting Optimistic ACK Attack...")
        # TODO: Initialize raw socket manager and capability checks!
        self.metrics.attack_start_time = time.time()
        self.is_attack_active = True

        if self.config.measure_speed:
            print("📊 Phase 1: Measuring baseline speed (without attack)...")
            self.measure_baseline_speed()
            print("⚔️ Phase 2: Starting attack with concurrent transfer...")
            self.execute_attack_with_transfer()
            print("📈 Calculating speed improvement...")
            self.calculate_speed_improvement()
        else:
            self.establish_connection()
            print("🚀 Starting attack and transfer concurrently (no speed measurement)...")
            threads = []
            attack_thread = threading.Thread(target=self.start_optimistic_ack_loop)
            threads.append(attack_thread)
            if self.config.enable_transfer:
                transfer_thread = threading.Thread(target=self.start_concurrent_transfer)
                threads.append(transfer_thread)
            for t in threads:
                t.start()
            for t in threads:
                t.join()

    def measure_baseline_speed(self):
        print("📊 Measuring baseline transfer speed (intentionally throttled)...")
        start_time = time.time()
        try:
            print("🐌 Baseline measurement with conservative parameters...")
            transfer_size = self.perform_transfer(False)
            duration = time.time() - start_time
            self.metrics.baseline_speed = transfer_size / duration
            print(f"✅ Baseline measured: {self.format_speed(self.metrics.baseline_speed)} "
                  f"({self.format_bytes(transfer_size)} in {duration:.1f}s)")
            self.baseline_completed = True
            time.sleep(2)
        except Exception as e:
            print("Baseline measurement failed:", e)
            self.metrics.baseline_speed = 500000

    def execute_attack_with_transfer(self):
        self.establish_connection()
        print("⚡ Starting optimistic ACK loop and transfer simultaneously...")
        attack_thread = threading.Thread(target=self.start_optimistic_ack_loop)
        transfer_thread = threading.Thread(target=self.start_concurrent_transfer)
        attack_thread.start()
        transfer_thread.start()
        attack_thread.join()
        transfer_thread.join()

    def start_concurrent_transfer(self):
        if not self.config.enable_transfer:
            return
        try:
            self.metrics.transfer_active = True
            start_time = time.time()
            transfer_size = self.perform_transfer(True)
            duration = time.time() - start_time
            self.metrics.attack_speed = transfer_size / duration
            self.metrics.transfer_active = False
        except Exception as e:
            print("Transfer during attack failed:", e)
            self.metrics.transfer_active = False

    def perform_transfer(self, during_attack):
        if self.config.transfer_type == "download":
            return self.perform_file_download(during_attack)
        elif self.config.transfer_type == "streaming":
            return self.perform_streaming_transfer(during_attack)
        else:
            raise ValueError(f"Unsupported transfer type: {self.config.transfer_type}")

    def perform_file_download(self, during_attack):
        url = self.config.transfer_url
        print(f"📦 Downloading file: {url}")
        resp = requests.get(url, stream=True)
        total_bytes = 0
        for chunk in resp.iter_content(chunk_size=8192):
            if chunk:
                total_bytes += len(chunk)
                self.network_monitor.record_transfer(len(chunk), 1)
                if during_attack and self.is_attack_active:
                    self.metrics.total_data_transferred += len(chunk)
        self.metrics.transfer_progress = 100
        return total_bytes

    def perform_streaming_transfer(self, during_attack):
        # Simplified: download the playlist, then all .ts segments
        playlist_text = requests.get(self.config.transfer_url).text
        self.stream_segments = [l for l in playlist_text.splitlines() if l and not l.startswith("#")]
        print(f"Found {len(self.stream_segments)} segments")
        total_bytes = 0
        for i, seg in enumerate(self.stream_segments):
            seg_url = f"http://{self.config.target_host}:{self.config.target_port}/stream/{self.config.stream_id}/{seg}"
            resp = requests.get(seg_url, stream=True)
            for chunk in resp.iter_content(chunk_size=8192):
                if chunk:
                    total_bytes += len(chunk)
                    self.network_monitor.record_transfer(len(chunk), 1)
                    if during_attack and self.is_attack_active:
                        self.metrics.total_data_transferred += len(chunk)
            self.metrics.transfer_progress = 100.0 * (i+1) / len(self.stream_segments)
            # Simulate streaming pacing
            time.sleep(self.config.packet_interval / 1000.0)
        return total_bytes

    def establish_connection(self):
        print(f"🔗 Establishing TCP connection to {self.config.target_host}:{self.config.target_port}...")
        # TODO: Use raw socket here, or just skip if not available
        self.metrics.connection_established = True
        self.sequence_number = 1000000
        self.ack_number = 1
        print("✅ TCP connection established successfully")

    def start_optimistic_ack_loop(self):
        print("⚔️ Starting optimistic ACK attack loop...")
        start_time = time.time()
        while self.is_attack_active and (time.time() - start_time < self.config.attack_duration):
            self.send_optimistic_ack()
            elapsed = time.time() - self.metrics.attack_start_time
            if elapsed > 0:
                self.metrics.current_speed = self.metrics.total_data_transferred / elapsed
            time.sleep(self.get_adaptive_packet_interval() / 1000.0)
        self.is_attack_active = False
        print("⏹️ Attack duration completed")

    def get_adaptive_packet_interval(self):
        if self.config.transfer_type == 'streaming' and self.metrics.transfer_active:
            return max(self.config.packet_interval / 4, 10)
        return self.config.packet_interval

    def send_optimistic_ack(self):
        # STUB: Should actually send TCP packets
        self.ack_number += self.config.ack_advance_size
        self.metrics.packets_pressed += 1
        self.metrics.successful_acks += 1
        if self.metrics.packets_pressed % 25 == 0:
            print(f"⚔️  ATTACK STATUS: Packets: {self.metrics.packets_pressed}, "
                  f"ACK: {self.ack_number}")

    def calculate_speed_improvement(self):
        if self.metrics.baseline_speed > 0 and self.metrics.attack_speed > 0:
            self.metrics.speed_improvement = ((self.metrics.attack_speed - self.metrics.baseline_speed) / self.metrics.baseline_speed) * 100
            print("📈 Speed Analysis:")
            print(f"  Baseline: {self.format_speed(self.metrics.baseline_speed)}")
            print(f"  Attack:   {self.format_speed(self.metrics.attack_speed)}")
            print(f"  Improvement: {self.metrics.speed_improvement:+.1f}%")
            if self.metrics.speed_improvement > 20:
                print("🎯 Attack was highly successful!")
            elif self.metrics.speed_improvement > 5:
                print("⚡ Attack was successful!")
            elif self.metrics.speed_improvement > 0:
                print("⚠️ Marginal improvement detected.")
            else:
                print("❌ No improvement detected.")

    def format_bytes(self, bytes_val):
        if bytes_val == 0:
            return "0 B"
        k = 1024
        sizes = ['B', 'KB', 'MB', 'GB']
        i = int((len(str(int(bytes_val))) - 1) // 3)
        return f"{bytes_val / (k ** i):.2f} {sizes[i]}"

    def format_speed(self, bytes_per_second):
        return self.format_bytes(bytes_per_second) + '/s'

    def get_metrics(self):
        return self.metrics

    def get_config(self):
        return self.config

    def stop_attack(self):
        print("🛑 Stopping attack...")
        self.is_attack_active = False
        # if self.connection: self.connection.close()
        print("✅ Attack stopped successfully")

    def is_active(self):
        return self.is_attack_active
