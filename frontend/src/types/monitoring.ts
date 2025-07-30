interface ServerMetrics {
  cpu: {
    usage: number; // Percentage
    temperature: number; // Celsius
  };
  memory: {
    total: number; // Bytes
    used: number; // Bytes
    percentage: number; // Percentage
  };
  network: {
    bytesSent: number; // Bytes
    bytesReceived: number; // Bytes
    packetsSent: number; // Count
    packetsReceived: number; // Count
  };
  disk: {
    total: number; // Bytes
    used: number; // Bytes
    free: number; // Bytes
    percentage: number; // Percentage
  };
  uptime: number; // Seconds
  timestamp: number; // Unix timestamp in milliseconds
}

export type { ServerMetrics };