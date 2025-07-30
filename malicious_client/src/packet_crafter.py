import random
import socket
from typing import Optional

class TCPFlags:
    def __init__(self, fin=False, syn=False, rst=False, psh=False, ack=False, urg=False, ece=False, cwr=False):
        self.fin = fin
        self.syn = syn
        self.rst = rst
        self.psh = psh
        self.ack = ack
        self.urg = urg
        self.ece = ece
        self.cwr = cwr

class TCPPacket:
    def __init__(
        self,
        source_ip: str,
        source_port: int,
        dest_ip: str,
        dest_port: int,
        sequence_number: int,
        ack_number: int,
        window_size: int,
        flags: TCPFlags,
        length: int = 20,
        payload: Optional[bytes] = None
    ):
        self.source_ip = source_ip
        self.source_port = source_port
        self.dest_ip = dest_ip
        self.dest_port = dest_port
        self.sequence_number = sequence_number
        self.ack_number = ack_number
        self.window_size = window_size
        self.flags = flags
        self.length = length
        self.payload = payload

class PacketCrafter:
    def __init__(self):
        print('🔨 Packet crafter initialized')

    def create_optimistic_ack_packet(
        self,
        dest_ip: str,
        dest_port: int,
        sequence_number: int,
        optimistic_ack_number: int,
        window_size: int,
        source_ip: Optional[str] = None,
        source_port: Optional[int] = None
    ) -> TCPPacket:
        return TCPPacket(
            source_ip=source_ip or self.get_local_ip(),
            source_port=source_port or self.get_random_port(),
            dest_ip=dest_ip,
            dest_port=dest_port,
            sequence_number=sequence_number,
            ack_number=optimistic_ack_number,
            window_size=window_size,
            flags=TCPFlags(ack=True),
            length=20
        )

    def create_syn_packet(self, dest_ip: str, dest_port: int, source_port: Optional[int] = None) -> TCPPacket:
        return TCPPacket(
            source_ip=self.get_local_ip(),
            source_port=source_port or self.get_random_port(),
            dest_ip=dest_ip,
            dest_port=dest_port,
            sequence_number=random.randint(0, 1000000),
            ack_number=0,
            window_size=65535,
            flags=TCPFlags(syn=True),
            length=20
        )

    def create_fin_packet(
        self,
        dest_ip: str,
        dest_port: int,
        sequence_number: int,
        ack_number: int,
        source_port: Optional[int] = None
    ) -> TCPPacket:
        return TCPPacket(
            source_ip=self.get_local_ip(),
            source_port=source_port or self.get_random_port(),
            dest_ip=dest_ip,
            dest_port=dest_port,
            sequence_number=sequence_number,
            ack_number=ack_number,
            window_size=0,
            flags=TCPFlags(fin=True, ack=True),
            length=20
        )

    def get_local_ip(self) -> str:
        # Replace with actual local IP discovery if needed
        return '127.0.0.1'

    def get_random_port(self) -> int:
        return random.randint(20000, 50000)

    def calculate_checksum(self, packet: TCPPacket) -> int:
        # Simple checksum calculation (not a real TCP checksum!)
        data = f"{packet.source_ip}{packet.dest_ip}{packet.source_port}{packet.dest_port}{packet.sequence_number}{packet.ack_number}"
        checksum = 0
        for c in data:
            checksum += ord(c)
        return checksum & 0xFFFF
