export interface TrafficPattern {
  timestamp: number;
  sourceIP: string;
  destinationIP: string;
  sourcePort: number;
  destinationPort: number;
  sequenceNumber: number;
  ackNumber: number;
  windowSize: number;
  flags: string[];
  dataLength: number;
}

export interface AttackSignature {
  rapidACKs: boolean;
  abnormalWindowGrowth: boolean;
  sequenceGaps: boolean;
  suspiciousPattern: boolean;
}

export class TrafficAnalyzer {
  private trafficHistory: TrafficPattern[] = [];
  private windowSizeHistory: Map<string, number[]> = new Map();
  private ackFrequencyMap: Map<string, number[]> = new Map();

  public analyzePacket(packet: TrafficPattern): AttackSignature {
    this.trafficHistory.push(packet);
    this.updateWindowSizeHistory(packet);
    this.updateACKFrequency(packet);

    // Trim history to prevent memory issues
    if (this.trafficHistory.length > 10000) {
      this.trafficHistory = this.trafficHistory.slice(-5000);
    }

    return this.detectAttackSignatures(packet);
  }

  private updateWindowSizeHistory(packet: TrafficPattern): void {
    const connectionKey = `${packet.sourceIP}:${packet.sourcePort}`;
    
    if (!this.windowSizeHistory.has(connectionKey)) {
      this.windowSizeHistory.set(connectionKey, []);
    }
    
    const history = this.windowSizeHistory.get(connectionKey)!;
    history.push(packet.windowSize);
    
    // Keep only recent history
    if (history.length > 100) {
      history.splice(0, history.length - 50);
    }
  }

  private updateACKFrequency(packet: TrafficPattern): void {
    if (!packet.flags.includes('ACK')) return;

    const connectionKey = `${packet.sourceIP}:${packet.sourcePort}`;
    const currentTime = packet.timestamp;
    
    if (!this.ackFrequencyMap.has(connectionKey)) {
      this.ackFrequencyMap.set(connectionKey, []);
    }
    
    const ackTimes = this.ackFrequencyMap.get(connectionKey)!;
    ackTimes.push(currentTime);
    
    // Remove old entries (older than 10 seconds)
    const cutoffTime = currentTime - 10000;
    while (ackTimes.length > 0 && ackTimes[0] < cutoffTime) {
      ackTimes.shift();
    }
  }

  private detectAttackSignatures(packet: TrafficPattern): AttackSignature {
    const connectionKey = `${packet.sourceIP}:${packet.sourcePort}`;
    
    return {
      rapidACKs: this.detectRapidACKs(connectionKey),
      abnormalWindowGrowth: this.detectAbnormalWindowGrowth(connectionKey),
      sequenceGaps: this.detectSequenceGaps(packet),
      suspiciousPattern: this.detectSuspiciousPattern(connectionKey)
    };
  }

  private detectRapidACKs(connectionKey: string): boolean {
    const ackTimes = this.ackFrequencyMap.get(connectionKey);
    if (!ackTimes || ackTimes.length < 10) return false;

    // Check if more than 50 ACKs in last 5 seconds
    const recentTime = Date.now() - 5000;
    const recentACKs = ackTimes.filter(time => time > recentTime);
    
    return recentACKs.length > 50;
  }

  private detectAbnormalWindowGrowth(connectionKey: string): boolean {
    const windowHistory = this.windowSizeHistory.get(connectionKey);
    if (!windowHistory || windowHistory.length < 5) return false;

    // Check for exponential growth in window size
    const recent = windowHistory.slice(-5);
    let growthCount = 0;
    
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] > recent[i-1] * 1.5) {
        growthCount++;
      }
    }
    
    return growthCount >= 3;
  }

  private detectSequenceGaps(packet: TrafficPattern): boolean {
    // Check for large gaps in sequence/ack numbers
    const recentPackets = this.trafficHistory
      .filter(p => p.sourceIP === packet.sourceIP && p.sourcePort === packet.sourcePort)
      .slice(-10);
    
    if (recentPackets.length < 2) return false;

    const lastPacket = recentPackets[recentPackets.length - 2];
    const ackGap = Math.abs(packet.ackNumber - lastPacket.ackNumber);
    
    // Detect suspiciously large ACK advances
    return ackGap > 1000000; // 1MB gap
  }

  private detectSuspiciousPattern(connectionKey: string): boolean {
    const signature = {
      rapidACKs: this.detectRapidACKs(connectionKey),
      abnormalWindowGrowth: this.detectAbnormalWindowGrowth(connectionKey)
    };
    
    // Combination of rapid ACKs and abnormal window growth is suspicious
    return signature.rapidACKs && signature.abnormalWindowGrowth;
  }

  public getTrafficSummary() {
    const connectionCount = new Set(
      this.trafficHistory.map(p => `${p.sourceIP}:${p.sourcePort}`)
    ).size;

    const totalPackets = this.trafficHistory.length;
    const ackPackets = this.trafficHistory.filter(p => p.flags.includes('ACK')).length;
    
    return {
      connectionCount,
      totalPackets,
      ackPackets,
      ackPercentage: totalPackets > 0 ? (ackPackets / totalPackets) * 100 : 0,
      timeRange: {
        start: this.trafficHistory[0]?.timestamp || 0,
        end: this.trafficHistory[this.trafficHistory.length - 1]?.timestamp || 0
      }
    };
  }
}