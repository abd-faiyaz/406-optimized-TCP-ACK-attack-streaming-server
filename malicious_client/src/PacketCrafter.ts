import { Buffer } from 'buffer';

export interface TCPFlags {
  fin: boolean;
  syn: boolean;
  rst: boolean;
  psh: boolean;
  ack: boolean;
  urg: boolean;
  ece: boolean;
  cwr: boolean;
}

export interface TCPPacket {
  sourceIP: string;
  sourcePort: number;
  destIP: string;
  destPort: number;
  sequenceNumber: number;
  ackNumber: number;
  windowSize: number;
  flags: TCPFlags;
  length: number;
  payload?: Buffer;
}

export class PacketCrafter {
  constructor() {
    console.log('🔨 Packet crafter initialized');
  }

  public createOptimisticACKPacket(
    destIP: string,
    destPort: number,
    sequenceNumber: number,
    optimisticAckNumber: number,
    windowSize: number,
    sourceIP?: string,
    sourcePort?: number
  ): TCPPacket {
    const packet: TCPPacket = {
      sourceIP: sourceIP || this.getLocalIP(),
      sourcePort: sourcePort || this.getRandomPort(),
      destIP,
      destPort,
      sequenceNumber,
      ackNumber: optimisticAckNumber, // This is the "lie" - claiming we received more data
      windowSize,
      flags: {
        fin: false,
        syn: false,
        rst: false,
        psh: false,
        ack: true, // ACK flag set - this is an acknowledgment packet
        urg: false,
        ece: false,
        cwr: false
      },
      length: 20 // Standard TCP header size
    };

    return packet;
  }

  public createSYNPacket(destIP: string, destPort: number, sourcePort?: number): TCPPacket {
    return {
      sourceIP: this.getLocalIP(),
      sourcePort: sourcePort || this.getRandomPort(),
      destIP,
      destPort,
      sequenceNumber: Math.floor(Math.random() * 1000000),
      ackNumber: 0,
      windowSize: 65535,
      flags: {
        fin: false,
        syn: true,
        rst: false,
        psh: false,
        ack: false,
        urg: false,
        ece: false,
        cwr: false
      },
      length: 20
    };
  }

  public createFINPacket(
    destIP: string,
    destPort: number,
    sequenceNumber: number,
    ackNumber: number,
    sourcePort?: number
  ): TCPPacket {
    return {
      sourceIP: this.getLocalIP(),
      sourcePort: sourcePort || this.getRandomPort(),
      destIP,
      destPort,
      sequenceNumber,
      ackNumber,
      windowSize: 0,
      flags: {
        fin: true,
        syn: false,
        rst: false,
        psh: false,
        ack: true,
        urg: false,
        ece: false,
        cwr: false
      },
      length: 20
    };
  }

  private getLocalIP(): string {
    // This will be updated by the RawSocketManager with actual local IP
    return '127.0.0.1';
  }

  private getRandomPort(): number {
    return Math.floor(Math.random() * 30000) + 20000;
  }

  public calculateChecksum(packet: TCPPacket): number {
    // Simplified checksum calculation
    // In real implementation, this would calculate proper TCP checksum
    const data = `${packet.sourceIP}${packet.destIP}${packet.sourcePort}${packet.destPort}${packet.sequenceNumber}${packet.ackNumber}`;
    let checksum = 0;
    
    for (let i = 0; i < data.length; i++) {
      checksum += data.charCodeAt(i);
    }
    
    return checksum & 0xFFFF;
  }
}