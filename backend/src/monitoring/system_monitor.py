import time
import threading
from typing import Callable, Optional, List, Dict
import os
import psutil

class SystemMonitor:
    def __init__(self, monitoring_interval: float = 1.0):
        self.monitoring_interval = monitoring_interval  # seconds
        self._interval_thread: Optional[threading.Thread] = None
        self._running = False
        self._metrics_callbacks: List[Callable[[Dict], None]] = []

    def start(self):
        if self._running:
            return
        self._running = True
        self._interval_thread = threading.Thread(target=self._run_monitor, daemon=True)
        self._interval_thread.start()
        print("System monitoring started")

    def stop(self):
        self._running = False
        if self._interval_thread:
            self._interval_thread.join()
            self._interval_thread = None
        print("System monitoring stopped")

    def on_metrics(self, callback: Callable[[Dict], None]):
        self._metrics_callbacks.append(callback)

    def get_metrics(self) -> Dict:
        return self._collect_metrics()

    def _run_monitor(self):
        while self._running:
            metrics = self._collect_metrics()
            for cb in self._metrics_callbacks:
                cb(metrics)
            time.sleep(self.monitoring_interval)

    def _collect_metrics(self) -> Dict:
        cpu_usage = psutil.cpu_percent(interval=None)
        load_avg = os.getloadavg() if hasattr(os, "getloadavg") else [0.0, 0.0, 0.0]
        mem = psutil.virtual_memory()
        net_io = psutil.net_io_counters()
        # psutil does not provide per-interval packet deltas natively (advanced: track previous values if needed)
        metrics = {
            "timestamp": int(time.time() * 1000),
            "cpu": {
                "usage": cpu_usage,
                "loadAverage": list(load_avg)
            },
            "memory": {
                "total": mem.total,
                "used": mem.used,
                "free": mem.available,
                "percentage": mem.percent
            },
            "network": {
                "bytesReceived": net_io.bytes_recv,
                "bytesSent": net_io.bytes_sent,
                "packetsReceived": net_io.packets_recv,
                "packetsSent": net_io.packets_sent
            }
        }
        return metrics

# --- Example Usage ---

# def print_metrics(metrics):
#     print(metrics)
#
# monitor = SystemMonitor()
# monitor.on_metrics(print_metrics)
# monitor.start()
# time.sleep(5)
# monitor.stop()
