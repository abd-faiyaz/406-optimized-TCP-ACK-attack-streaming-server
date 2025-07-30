import { EventEmitter } from 'events';

interface ConnectionData {
  ip: string;
  timestamp: number;
  type: 'file_download' | 'stream_request' | 'websocket';
  resource?: string;
  userAgent?: string;
  bytesTransferred?: number;
  duration?: number;
}

interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  connectionsByType: Record<string, number>;
  averageConnectionDuration: number;
  totalBytesTransferred: number;
  uniqueIPs: number;
  suspiciousActivity: SuspiciousActivity[];
}

interface SuspiciousActivity {
  ip: string;
  type: 'rapid_requests' | 'large_download' | 'unusual_pattern';
  timestamp: number;
  details: string;
  severity: 'low' | 'medium' | 'high';
}

export class ConnectionAnalyzer extends EventEmitter {
  private connections: Map<string, ConnectionData[]> = new Map();
  private activeConnections: Set<string> = new Set();
  private metrics: ConnectionMetrics;
  private analysisInterval: NodeJS.Timeout | null = null;
  private readonly maxConnectionHistory = 1000;
  private readonly suspiciousThresholds = {
    rapidRequests: 10, // requests per minute
    largeDownload: 100 * 1024 * 1024, // 100MB
    connectionDuration: 300000 // 5 minutes
  };

  constructor() {
    super();
    this.metrics = this.initializeMetrics();
    this.startAnalysis();
  }

  private initializeMetrics(): ConnectionMetrics {
    return {
      totalConnections: 0,
      activeConnections: 0,
      connectionsByType: {},
      averageConnectionDuration: 0,
      totalBytesTransferred: 0,
      uniqueIPs: 0,
      suspiciousActivity: []
    };
  }

  public logConnection(
    ip: string, 
    type: ConnectionData['type'], 
    resource?: string,
    userAgent?: string
  ): string {
    const connectionId = this.generateConnectionId();
    const connectionData: ConnectionData = {
      ip,
      timestamp: Date.now(),
      type,
      resource,
      userAgent,
      bytesTransferred: 0
    };

    // Store connection data
    if (!this.connections.has(ip)) {
      this.connections.set(ip, []);
    }
    
    const ipConnections = this.connections.get(ip)!;
    ipConnections.push(connectionData);
    
    // Limit history per IP
    if (ipConnections.length > this.maxConnectionHistory) {
      ipConnections.shift();
    }

    // Track active connection
    this.activeConnections.add(connectionId);

    // Update metrics
    this.updateMetrics();

    // Check for suspicious activity
    this.checkSuspiciousActivity(ip, connectionData);

    return connectionId;
  }

  public updateConnectionBytes(connectionId: string, bytes: number): void {
    // Find and update the connection
    for (const [ip, connections] of this.connections.entries()) {
      const connection = connections.find(c => 
        this.generateConnectionId(c) === connectionId
      );
      if (connection) {
        connection.bytesTransferred = bytes;
        this.updateMetrics();
        
        // Check for large download
        if (bytes > this.suspiciousThresholds.largeDownload) {
          this.flagSuspiciousActivity(ip, 'large_download', 
            `Large download detected: ${this.formatBytes(bytes)}`, 'medium');
        }
        break;
      }
    }
  }

  public closeConnection(connectionId: string): void {
    this.activeConnections.delete(connectionId);
    
    // Find and update connection duration
    for (const connections of this.connections.values()) {
      const connection = connections.find(c => 
        this.generateConnectionId(c) === connectionId
      );
      if (connection) {
        connection.duration = Date.now() - connection.timestamp;
        break;
      }
    }
    
    this.updateMetrics();
  }

  private generateConnectionId(connection?: ConnectionData): string {
    if (connection) {
      return `${connection.ip}_${connection.timestamp}_${connection.type}`;
    }
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateMetrics(): void {
    const allConnections: ConnectionData[] = [];
    const uniqueIPs = new Set<string>();

    // Aggregate all connections
    for (const [ip, connections] of this.connections.entries()) {
      uniqueIPs.add(ip);
      allConnections.push(...connections);
    }

    // Calculate metrics
    this.metrics.totalConnections = allConnections.length;
    this.metrics.activeConnections = this.activeConnections.size;
    this.metrics.uniqueIPs = uniqueIPs.size;

    // Connection types
    this.metrics.connectionsByType = {};
    for (const connection of allConnections) {
      this.metrics.connectionsByType[connection.type] = 
        (this.metrics.connectionsByType[connection.type] || 0) + 1;
    }

    // Average duration and total bytes
    const completedConnections = allConnections.filter(c => c.duration);
    this.metrics.averageConnectionDuration = completedConnections.length > 0
      ? completedConnections.reduce((sum, c) => sum + (c.duration || 0), 0) / completedConnections.length
      : 0;

    this.metrics.totalBytesTransferred = allConnections.reduce(
      (sum, c) => sum + (c.bytesTransferred || 0), 0
    );
  }

  private checkSuspiciousActivity(ip: string, newConnection: ConnectionData): void {
    const ipConnections = this.connections.get(ip) || [];
    const recentConnections = ipConnections.filter(
      c => Date.now() - c.timestamp < 60000 // Last minute
    );

    // Check for rapid requests
    if (recentConnections.length >= this.suspiciousThresholds.rapidRequests) {
      this.flagSuspiciousActivity(ip, 'rapid_requests',
        `${recentConnections.length} requests in the last minute`, 'high');
    }

    // Check for unusual patterns
    const typeCount = recentConnections.filter(c => c.type === newConnection.type).length;
    if (typeCount > 5 && newConnection.type === 'file_download') {
      this.flagSuspiciousActivity(ip, 'unusual_pattern',
        `Repeated ${newConnection.type} requests`, 'medium');
    }
  }

  private flagSuspiciousActivity(
    ip: string, 
    type: SuspiciousActivity['type'], 
    details: string, 
    severity: SuspiciousActivity['severity']
  ): void {
    const activity: SuspiciousActivity = {
      ip,
      type,
      timestamp: Date.now(),
      details,
      severity
    };

    this.metrics.suspiciousActivity.push(activity);
    
    // Limit suspicious activity history
    if (this.metrics.suspiciousActivity.length > 100) {
      this.metrics.suspiciousActivity.shift();
    }

    // Emit event for real-time monitoring
    this.emit('suspiciousActivity', activity);
  }

  private startAnalysis(): void {
    this.analysisInterval = setInterval(() => {
      this.cleanupOldConnections();
      this.performSecurityAnalysis();
    }, 30000); // Run every 30 seconds
  }

  private cleanupOldConnections(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    for (const [ip, connections] of this.connections.entries()) {
      const filteredConnections = connections.filter(c => c.timestamp > cutoffTime);
      if (filteredConnections.length === 0) {
        this.connections.delete(ip);
      } else {
        this.connections.set(ip, filteredConnections);
      }
    }

    // Clean up old suspicious activities
    this.metrics.suspiciousActivity = this.metrics.suspiciousActivity.filter(
      activity => Date.now() - activity.timestamp < (24 * 60 * 60 * 1000)
    );
  }

  private performSecurityAnalysis(): void {
    // Analyze connection patterns for potential attacks
    for (const [ip, connections] of this.connections.entries()) {
      const recentConnections = connections.filter(
        c => Date.now() - c.timestamp < 300000 // Last 5 minutes
      );

      // Check for potential DDoS patterns
      if (recentConnections.length > 20) {
        this.flagSuspiciousActivity(ip, 'unusual_pattern',
          'Potential DDoS pattern detected', 'high');
      }

      // Check for data exfiltration patterns
      const totalBytes = recentConnections.reduce(
        (sum, c) => sum + (c.bytesTransferred || 0), 0
      );
      if (totalBytes > 500 * 1024 * 1024) { // 500MB
        this.flagSuspiciousActivity(ip, 'large_download',
          'Potential data exfiltration detected', 'high');
      }
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    } else if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    return `${bytes} B`;
  }

  public getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  public getConnectionHistory(ip?: string): ConnectionData[] {
    if (ip) {
      return this.connections.get(ip) || [];
    }
    
    const allConnections: ConnectionData[] = [];
    for (const connections of this.connections.values()) {
      allConnections.push(...connections);
    }
    return allConnections.sort((a, b) => b.timestamp - a.timestamp);
  }

  public destroy(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    this.connections.clear();
    this.activeConnections.clear();
    this.removeAllListeners();
  }
}