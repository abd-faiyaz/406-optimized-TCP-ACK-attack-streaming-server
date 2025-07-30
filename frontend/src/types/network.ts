export interface NetworkMetrics {
  timestamp: number;
  downloadSpeed: number; // bytes per second
  uploadSpeed: number; // bytes per second
  latency: number; // milliseconds
  packetLoss: number; // percentage
  bandwidth: {
    current: number; // current usage in bytes/sec
    peak: number; // peak usage in bytes/sec
    average: number; // average over time window
  };
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface StreamingMetrics {
  bufferHealth: number; // seconds of buffer
  droppedFrames: number;
  bitrateKbps: number;
  resolution: string;
  fps: number;
  segmentDownloadTime: number[]; // last 10 segment download times
  rebufferingEvents: number;
}

export interface DownloadMetrics {
  filename: string;
  size: number;
  downloaded: number;
  speed: number; // bytes per second
  eta: number; // estimated time remaining in seconds
  startTime: number;
  chunks: Array<{
    start: number;
    end: number;
    downloadTime: number;
    speed: number;
  }>;
}
  
export interface OptimisticAckMetrics {
  normalDownloadSpeed: number;
  optimisticDownloadSpeed: number;
  speedImprovement: number; // percentage
  ackOptimizationActive: boolean;
  tcpWindowSize: number;
  retransmissions: number;
  outOfOrderPackets: number;
}