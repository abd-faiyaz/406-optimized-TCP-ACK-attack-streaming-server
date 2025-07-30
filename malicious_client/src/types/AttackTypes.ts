export interface AttackConfig {
  targetHost: string;
  targetPort: number;
  attackDuration: number;
  packetInterval: number;
  ackAdvanceSize: number;
  windowScale: number;
}

export interface AttackMetrics {
  packetsPressed: number;
  successfulAcks: number;
  connectionEstablished: boolean;
  attackStartTime: number;
  currentSpeed: number;
  totalDataTransferred: number;
}