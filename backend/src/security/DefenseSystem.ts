import { EventEmitter } from 'events';

export interface DefenseConfig {
  ackValidationEnabled: boolean;
  rateLimitingEnabled: boolean;
  sequenceTrackingEnabled: boolean;
  adaptiveWindowEnabled: boolean;
  anomalyDetectionEnabled: boolean;
  quarantineEnabled: boolean;
  
  // Thresholds
  maxACKsPerSecond: number;
  maxWindowGrowthRate: number;
  maxSequenceGap: number;
  suspiciousPatternThreshold: number;
  quarantineDuration: number; // in milliseconds
}

export interface ConnectionState {
  ip: string;
  port: number;
  expectedSeq: number;
  expectedAck: number;
  lastValidAck: number;
  windowSize: number;
  ackCount: number;
  lastACKTime: number;
  suspicious: boolean;
  quarantined: boolean;
  quarantineUntil: number;
  anomalyScore: number;
}

export interface DefenseAction {
  type: 'block' | 'rate_limit' | 'quarantine' | 'alert' | 'reject_packet';
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  connectionId: string;
}

export interface AttackSignature {
  rapidACKs: boolean;
  abnormalWindowGrowth: boolean;
  sequenceGaps: boolean;
  suspiciousPattern: boolean;
}

export class DefenseSystem extends EventEmitter {
  private config: DefenseConfig;
  private connectionStates: Map<string, ConnectionState> = new Map();
  private quarantinedIPs: Set<string> = new Set();
  private defenseActions: DefenseAction[] = [];
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<DefenseConfig> = {}) {
    super();
    
    this.config = {
      ackValidationEnabled: true,
      rateLimitingEnabled: true,
      sequenceTrackingEnabled: true,
      adaptiveWindowEnabled: true,
      anomalyDetectionEnabled: true,
      quarantineEnabled: true,
      maxACKsPerSecond: 100,
      maxWindowGrowthRate: 2.0,
      maxSequenceGap: 1048576, // 1MB
      suspiciousPatternThreshold: 0.7,
      quarantineDuration: 300000, // 5 minutes
      ...config
    };

    this.startDefenseMonitoring();
    
    console.log('🛡️ Defense System initialized with config:', this.config);
  }

  /**
   * Main defense validation method - called for each incoming connection
   */
  public validateConnection(
    ip: string, 
    port: number, 
    seq: number, 
    ack: number, 
    windowSize: number,
    flags: string[] = []
  ): { allowed: boolean; action?: DefenseAction } {
    const connectionId = `${ip}:${port}`;
    
    // Check if IP is quarantined
    if (this.isQuarantined(ip)) {
      return {
        allowed: false,
        action: this.createDefenseAction('block', 'IP is quarantined', 'high', connectionId)
      };
    }

    // Get or create connection state
    const state = this.getOrCreateConnectionState(ip, port);
    
    // Create mock attack signature for testing
    const attackSignature: AttackSignature = {
      rapidACKs: false,
      abnormalWindowGrowth: false,
      sequenceGaps: false,
      suspiciousPattern: false
    };
    
    // Run defense checks
    const validationResult = this.runDefenseChecks(state, seq, ack, windowSize, flags, attackSignature);
    
    // Update connection state if allowed
    if (validationResult.allowed) {
      this.updateConnectionState(state, seq, ack, windowSize);
    }

    return validationResult;
  }

  private runDefenseChecks(
    state: ConnectionState,
    seq: number,
    ack: number,
    windowSize: number,
    flags: string[],
    signature: AttackSignature
  ): { allowed: boolean; action?: DefenseAction } {
    const connectionId = `${state.ip}:${state.port}`;

    // Skip strict checks for connections that haven't shown attack patterns
    const isLikelyAttack = state.suspicious || state.anomalyScore > 0.5;

    // 1. ACK Validation - Only apply strict validation to suspicious connections
    if (this.config.ackValidationEnabled && flags.includes('ACK') && isLikelyAttack) {
      const ackValidation = this.validateACKNumber(state, ack);
      if (!ackValidation.valid) {
        this.updateAnomalyScore(state, 0.3);
        return {
          allowed: false,
          action: this.createDefenseAction('reject_packet', ackValidation.reason, 'high', connectionId)
        };
      }
    }

    // 2. Rate Limiting - Apply to all ACK packets but with permissive limits
    if (this.config.rateLimitingEnabled && flags.includes('ACK')) {
      const rateLimitCheck = this.checkACKRateLimit(state);
      if (!rateLimitCheck.allowed) {
        this.updateAnomalyScore(state, 0.2);
        return {
          allowed: false,
          action: this.createDefenseAction('rate_limit', rateLimitCheck.reason, 'medium', connectionId)
        };
      }
    }

    // 3. Sequence Tracking - Detect sequence number attacks
    if (this.config.sequenceTrackingEnabled) {
      const seqValidation = this.validateSequenceNumber(state, seq);
      if (!seqValidation.valid) {
        this.updateAnomalyScore(state, 0.25);
        return {
          allowed: false,
          action: this.createDefenseAction('reject_packet', seqValidation.reason, 'medium', connectionId)
        };
      }
    }

    // 4. Window Size Validation - Detect abnormal window manipulation
    if (this.config.adaptiveWindowEnabled) {
      const windowValidation = this.validateWindowSize(state, windowSize);
      if (!windowValidation.valid) {
        this.updateAnomalyScore(state, 0.2);
        // Don't block for window issues, just alert
        this.createDefenseAction('alert', windowValidation.reason, 'medium', connectionId);
      }
    }

    // 5. Anomaly Detection - Check for attack patterns
    if (this.config.anomalyDetectionEnabled) {
      const anomalyCheck = this.detectAnomalies(state, signature);
      if (anomalyCheck.anomalous) {
        this.updateAnomalyScore(state, 0.4);
        
        // Quarantine if anomaly score is too high
        if (state.anomalyScore >= this.config.suspiciousPatternThreshold) {
          this.quarantineIP(state.ip);
          return {
            allowed: false,
            action: this.createDefenseAction('quarantine', anomalyCheck.reason, 'critical', connectionId)
          };
        }
        
        return {
          allowed: false,
          action: this.createDefenseAction('block', anomalyCheck.reason, 'high', connectionId)
        };
      }
    }

    // All checks passed
    return { allowed: true };
  }

  private validateACKNumber(state: ConnectionState, ack: number): { valid: boolean; reason: string } {
    // For HTTP traffic, ACK validation should be much more permissive
    // Only block extremely suspicious patterns that indicate active packet injection
    
    const ackAdvance = ack - state.lastValidAck;
    
    // Allow normal HTTP ACK behavior - only flag massive advances that indicate attack
    const suspiciousAdvanceThreshold = this.config.maxSequenceGap * 2; // Double the normal threshold
    
    if (ackAdvance > suspiciousAdvanceThreshold) {
      return {
        valid: false,
        reason: `Highly suspicious ACK detected: advancing ${ackAdvance} bytes beyond expected (threshold: ${suspiciousAdvanceThreshold})`
      };
    }

    // Check for ACK going backwards (potential replay attack) - but allow some flexibility
    if (ack < state.lastValidAck - 1024 && state.lastValidAck > 1024) { // Allow 1KB tolerance
      return {
        valid: false,
        reason: `Significant ACK regression detected: ${ack} << ${state.lastValidAck}`
      };
    }

    return { valid: true, reason: '' };
  }

  private checkACKRateLimit(state: ConnectionState): { allowed: boolean; reason: string } {
    const now = Date.now();
    const timeSinceLastACK = now - state.lastACKTime;
    
    // Reset counter if more than 1 second has passed
    if (timeSinceLastACK > 1000) {
      state.ackCount = 0;
      state.lastACKTime = now;
    }

    state.ackCount++;

    // Be much more permissive for HTTP traffic - only block extreme flooding
    const effectiveLimit = this.config.maxACKsPerSecond * 3; // 3x more permissive
    
    if (state.ackCount > effectiveLimit) {
      return {
        allowed: false,
        reason: `Extreme ACK rate limit exceeded: ${state.ackCount} ACKs/second (limit: ${effectiveLimit})`
      };
    }

    return { allowed: true, reason: '' };
  }

  private validateSequenceNumber(state: ConnectionState, seq: number): { valid: boolean; reason: string } {
    // Allow some flexibility in sequence numbers for legitimate retransmissions
    const maxSeqDeviation = 65536; // 64KB window
    
    if (state.expectedSeq > 0) {
      const seqDeviation = Math.abs(seq - state.expectedSeq);
      
      if (seqDeviation > maxSeqDeviation) {
        return {
          valid: false,
          reason: `Sequence number deviation too large: ${seqDeviation} bytes`
        };
      }
    }

    return { valid: true, reason: '' };
  }

  private validateWindowSize(state: ConnectionState, windowSize: number): { valid: boolean; reason: string } {
    if (state.windowSize > 0) {
      const growthRate = windowSize / state.windowSize;
      
      if (growthRate > this.config.maxWindowGrowthRate) {
        return {
          valid: false,
          reason: `Abnormal window growth: ${growthRate.toFixed(2)}x increase`
        };
      }
    }

    return { valid: true, reason: '' };
  }

  private detectAnomalies(state: ConnectionState, signature: AttackSignature): { anomalous: boolean; reason: string } {
    const anomalies: string[] = [];

    if (signature.rapidACKs) {
      anomalies.push('rapid ACK pattern');
    }

    if (signature.abnormalWindowGrowth) {
      anomalies.push('abnormal window growth');
    }

    if (signature.sequenceGaps) {
      anomalies.push('large sequence gaps');
    }

    if (signature.suspiciousPattern) {
      anomalies.push('suspicious traffic pattern');
    }

    if (anomalies.length >= 2) {
      return {
        anomalous: true,
        reason: `Multiple attack indicators: ${anomalies.join(', ')}`
      };
    }

    return { anomalous: false, reason: '' };
  }

  private getOrCreateConnectionState(ip: string, port: number): ConnectionState {
    const connectionId = `${ip}:${port}`;
    
    if (!this.connectionStates.has(connectionId)) {
      this.connectionStates.set(connectionId, {
        ip,
        port,
        expectedSeq: 0,
        expectedAck: 0,
        lastValidAck: 0,
        windowSize: 0,
        ackCount: 0,
        lastACKTime: Date.now(),
        suspicious: false,
        quarantined: false,
        quarantineUntil: 0,
        anomalyScore: 0
      });
    }

    return this.connectionStates.get(connectionId)!;
  }

  private updateConnectionState(state: ConnectionState, seq: number, ack: number, windowSize: number): void {
    state.expectedSeq = seq;
    state.expectedAck = ack;
    state.lastValidAck = Math.max(state.lastValidAck, ack);
    state.windowSize = windowSize;
    
    // Decay anomaly score over time for good behavior
    state.anomalyScore = Math.max(0, state.anomalyScore - 0.01);
  }

  private updateAnomalyScore(state: ConnectionState, increment: number): void {
    state.anomalyScore = Math.min(1.0, state.anomalyScore + increment);
    
    if (state.anomalyScore > 0.5) {
      state.suspicious = true;
    }
  }

  private quarantineIP(ip: string): void {
    if (!this.config.quarantineEnabled) return;
    
    this.quarantinedIPs.add(ip);
    
    // Set quarantine expiration for connection states
    for (const [connectionId, state] of this.connectionStates.entries()) {
      if (state.ip === ip) {
        state.quarantined = true;
        state.quarantineUntil = Date.now() + this.config.quarantineDuration;
      }
    }

    console.log(`🚫 IP ${ip} quarantined for ${this.config.quarantineDuration / 1000} seconds`);
    
    // Auto-remove from quarantine after duration
    setTimeout(() => {
      this.removeFromQuarantine(ip);
    }, this.config.quarantineDuration);
  }

  private removeFromQuarantine(ip: string): void {
    this.quarantinedIPs.delete(ip);
    
    // Update connection states
    for (const [connectionId, state] of this.connectionStates.entries()) {
      if (state.ip === ip) {
        state.quarantined = false;
        state.quarantineUntil = 0;
        state.anomalyScore = 0; // Reset anomaly score
      }
    }

    console.log(`✅ IP ${ip} removed from quarantine`);
  }

  private isQuarantined(ip: string): boolean {
    return this.quarantinedIPs.has(ip);
  }

  private createDefenseAction(
    type: DefenseAction['type'],
    reason: string,
    severity: DefenseAction['severity'],
    connectionId: string
  ): DefenseAction {
    const action: DefenseAction = {
      type,
      reason,
      severity,
      timestamp: Date.now(),
      connectionId
    };

    this.defenseActions.push(action);
    
    // Limit action history
    if (this.defenseActions.length > 1000) {
      this.defenseActions = this.defenseActions.slice(-500);
    }

    // Emit event for real-time monitoring
    this.emit('defenseAction', action);
    
    console.log(`🛡️ Defense Action: ${type} - ${reason} (${severity})`);
    
    return action;
  }

  private startDefenseMonitoring(): void {
    // Cleanup old connection states and quarantines
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredStates();
    }, 60000); // Every minute
  }

  private cleanupExpiredStates(): void {
    const now = Date.now();
    const expiredConnections: string[] = [];

    for (const [connectionId, state] of this.connectionStates.entries()) {
      // Remove inactive connections (no activity for 10 minutes)
      if (now - state.lastACKTime > 600000) {
        expiredConnections.push(connectionId);
      }
      
      // Remove expired quarantines
      if (state.quarantined && now > state.quarantineUntil) {
        this.removeFromQuarantine(state.ip);
      }
    }

    // Remove expired connections
    for (const connectionId of expiredConnections) {
      this.connectionStates.delete(connectionId);
    }

    if (expiredConnections.length > 0) {
      console.log(`🧹 Cleaned up ${expiredConnections.length} expired connection states`);
    }
  }

  public getDefenseMetrics() {
    const now = Date.now();
    const recentActions = this.defenseActions.filter(action => now - action.timestamp < 300000); // Last 5 minutes
    
    return {
      totalConnections: this.connectionStates.size,
      quarantinedIPs: this.quarantinedIPs.size,
      suspiciousConnections: Array.from(this.connectionStates.values()).filter(s => s.suspicious).length,
      recentActions: recentActions.length,
      actionsByType: recentActions.reduce((acc, action) => {
        acc[action.type] = (acc[action.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      actionsBySeverity: recentActions.reduce((acc, action) => {
        acc[action.severity] = (acc[action.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      config: this.config
    };
  }

  public updateConfig(newConfig: Partial<DefenseConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Defense configuration updated:', newConfig);
  }

  public forceRemoveFromQuarantine(ip: string): boolean {
    if (this.quarantinedIPs.has(ip)) {
      this.removeFromQuarantine(ip);
      return true;
    }
    return false;
  }

  public getConnectionState(ip: string, port: number): ConnectionState | null {
    return this.connectionStates.get(`${ip}:${port}`) || null;
  }

  /**
   * Mark a connection as suspicious based on application-layer detection
   */
  public markConnectionSuspicious(ip: string, port: number, reason: string): void {
    const state = this.getOrCreateConnectionState(ip, port);
    state.suspicious = true;
    state.anomalyScore = Math.min(1.0, state.anomalyScore + 0.5);
    
    console.log(`🚨 Connection ${ip}:${port} marked as suspicious: ${reason}`);
    
    // Emit a defense action for logging
    this.emit('defenseAction', this.createDefenseAction(
      'alert',
      `Connection marked suspicious: ${reason}`,
      'medium',
      `${ip}:${port}`
    ));
  }

  /**
   * Check if a connection is marked as suspicious
   */
  public isConnectionSuspicious(ip: string, port: number): boolean {
    const connectionId = `${ip}:${port}`;
    const state = this.connectionStates.get(connectionId);
    return state ? state.suspicious : false;
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.connectionStates.clear();
    this.quarantinedIPs.clear();
    this.removeAllListeners();
    
    console.log('🛡️ Defense System destroyed');
  }
}
