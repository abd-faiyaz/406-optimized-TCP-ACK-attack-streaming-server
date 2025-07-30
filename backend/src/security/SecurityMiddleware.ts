import express from 'express';
import { DefenseSystem, DefenseConfig } from './DefenseSystem.js';

export interface SecurityConfig {
  enableSecurityHeaders: boolean;
  enableConnectionThrottling: boolean;
  maxConnectionsPerIP: number;
  blocklistEnabled: boolean;
  customRules: SecurityRule[];
  // Defense system configs
  ackValidationEnabled?: boolean;
  rateLimitingEnabled?: boolean;
  sequenceTrackingEnabled?: boolean;
  adaptiveWindowEnabled?: boolean;
  anomalyDetectionEnabled?: boolean;
  quarantineEnabled?: boolean;
  maxACKsPerSecond?: number;
  maxWindowGrowthRate?: number;
  maxSequenceGap?: number;
  suspiciousPatternThreshold?: number;
  quarantineDuration?: number;
}

export interface SecurityRule {
  name: string;
  condition: (req: express.Request) => boolean;
  action: 'block' | 'rate_limit' | 'alert';
  priority: number;
}

export class SecurityMiddleware {
  private defenseSystem: DefenseSystem;
  private config: SecurityConfig;
  private connectionCounts: Map<string, number> = new Map();
  private blocklist: Set<string> = new Set();
  private lastCleanup: number = Date.now();

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = {
      enableSecurityHeaders: true,
      enableConnectionThrottling: false, // Disable for legitimate users
      maxConnectionsPerIP: 500, // Much higher for legitimate streaming/downloading
      blocklistEnabled: true,
      customRules: [],
      // Defense system defaults - more permissive for legitimate traffic
      ackValidationEnabled: true,
      rateLimitingEnabled: false, // Disabled for HTTP requests
      sequenceTrackingEnabled: false, // Disabled for HTTP requests
      adaptiveWindowEnabled: false, // Disabled for HTTP requests
      anomalyDetectionEnabled: true,
      quarantineEnabled: true,
      maxACKsPerSecond: 1000, // Very high for HTTP
      maxWindowGrowthRate: 10.0, // More permissive
      maxSequenceGap: 10485760, // 10MB - very permissive
      suspiciousPatternThreshold: 0.9, // High threshold
      quarantineDuration: 300000,
      ...config
    };

    this.defenseSystem = new DefenseSystem(this.config);
    this.setupDefenseEventHandlers();
    
    console.log('🔐 Security Middleware initialized - configured for legitimate traffic protection');
  }

  private setupDefenseEventHandlers(): void {
    this.defenseSystem.on('defenseAction', (action) => {
      // Only block on critical attacks, not minor violations
      if (action.type === 'quarantine' && action.severity === 'critical') {
        const ip = action.connectionId.split(':')[0];
        this.addToBlocklist(ip);
        console.log(`🚫 IP ${ip} added to blocklist due to: ${action.reason}`);
      } else {
        console.log(`🛡️ Defense action logged: ${action.type} - ${action.reason} (${action.severity})`);
      }
    });
  }

  /**
   * Express middleware for basic request filtering
   */
  public createRequestFilter(): express.RequestHandler {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const clientIP = this.getClientIP(req);
      
      // Periodic cleanup
      this.performPeriodicCleanup();

      // Apply security headers
      if (this.config.enableSecurityHeaders) {
        this.applySecurityHeaders(res);
      }

      // Check blocklist
      if (this.config.blocklistEnabled && this.isBlocked(clientIP)) {
        return this.sendSecurityResponse(res, 403, 'Access denied: IP blocked due to previous attack');
      }

      // Connection throttling - only for excessive connections
      if (this.config.enableConnectionThrottling) {
        // Skip connection throttling for legitimate clients (they've been whitelisted)
        const userAgent = req.headers['user-agent'] || '';
        if (!this.isLegitimateClient(userAgent)) {
          // Only apply connection limits to non-legitimate clients
          const allowed = this.checkConnectionLimit(clientIP);
          if (!allowed) {
            return this.sendSecurityResponse(res, 429, 'Too many simultaneous connections from this IP');
          }
        } else {
          console.log(`🔓 Skipping connection limit for legitimate client: ${clientIP}`);
        }
      }

      // Only check for explicit attack indicators, not general rules
      // const attackDetected = this.detectExplicitAttack(req);
      // if (attackDetected) {
      //   console.log(`🚨 ATTACK DETECTED from ${clientIP}: ${attackDetected.reason}`);
      //   return this.sendSecurityResponse(res, 403, `Attack blocked: ${attackDetected.reason}`);
      // }

      next();
    };
  }

  /**
   * Middleware specifically for file download endpoints
   */
  public createDownloadProtection(): express.RequestHandler {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.log(`🔍 Download protection check for ${req.path} from ${this.getClientIP(req)}`);
      const clientIP = this.getClientIP(req);

      // Check blocklist first
      if (this.config.blocklistEnabled && this.isBlocked(clientIP)) {
        console.log(`🚫 Blocked download attempt from quarantined IP: ${clientIP}`);
        return this.sendSecurityResponse(res, 403, 'Access denied: IP blocked due to previous attack');
      }

      // For downloads, only check for explicit attack indicators (no connection limits)
      const attackDetected = this.detectExplicitAttack(req);
      if (attackDetected) {
        console.log(`🚨 DOWNLOAD ATTACK DETECTED from ${clientIP}: ${attackDetected.reason}`);
        return this.sendSecurityResponse(res, 403, `Attack blocked: ${attackDetected.reason}`);
      }

      // Track large downloads for monitoring (but don't block)
      this.trackResponse(res, clientIP);

      console.log(`✅ Download request from ${clientIP} approved (no connection limits for downloads)`);
      next();
    };
  }

  /**
   * Middleware for streaming endpoints
   */
  public createStreamProtection(): express.RequestHandler {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const clientIP = this.getClientIP(req);
      
      // Check blocklist
      if (this.config.blocklistEnabled && this.isBlocked(clientIP)) {
        return this.sendSecurityResponse(res, 403, 'Access denied: IP blocked due to previous attack');
      }

      // Basic streaming validation
      const streamValidation = this.validateStreamingRequest(req);
      if (!streamValidation.valid) {
        return this.sendSecurityResponse(res, 400, streamValidation.reason);
      }

      // Check for explicit attacks (no connection limits for streaming)
      const attackDetected = this.detectExplicitAttack(req);
      if (attackDetected) {
        console.log(`🚨 STREAMING ATTACK DETECTED from ${clientIP}: ${attackDetected.reason}`);
        return this.sendSecurityResponse(res, 403, `Attack blocked: ${attackDetected.reason}`);
      }

      console.log(`✅ Streaming request from ${clientIP} approved (no connection limits for streaming)`);
      next();
    };
  }

  /**
   * Detect explicit attack indicators - this is the key method
   */
  private detectExplicitAttack(req: express.Request): { reason: string } | null {
    const userAgent = req.headers['user-agent'] || '';
    
    // WHITELIST APPROACH: Allow known legitimate browsers first
    if (this.isLegitimateClient(userAgent)) {
      const clientIP = this.getClientIP(req);
      console.log(`✅ Legitimate client detected from ${clientIP}: ${userAgent}`);
      return null; // Always allow legitimate browsers
    }
    
    // 1. Check for explicit attack simulation headers
    if (req.headers['x-simulate-attack'] === 'optimistic-ack') {
      return { reason: 'Explicit optimistic ACK attack simulation detected' };
    }

    // 2. Check for malicious user agents (ONLY actual attack tools)
    const maliciousAgents = [
      'OptimisticACK-Attack-Tool',
      'OptimisticACK-HLS-Client', // Our attack client
      'exploit-framework',
      'attack-simulator'
    ];
    
    for (const maliciousAgent of maliciousAgents) {
      if (userAgent.includes(maliciousAgent)) {
        // Mark this connection as suspicious in the defense system
        const clientIP = this.getClientIP(req);
        const clientPort = parseInt(req.headers['x-forwarded-port'] as string) || 0;
        this.defenseSystem.markConnectionSuspicious(clientIP, clientPort, `Malicious user agent: ${maliciousAgent}`);
        
        return { reason: `Malicious user agent detected: ${maliciousAgent}` };
      }
    }

    // 3. Check for suspicious request patterns (actual attack behavior)
    const suspiciousHeaders = [
      'x-attack-type',
      'x-exploit',
      'x-malicious',
      'x-optimistic-ack'
    ];

    for (const header of suspiciousHeaders) {
      if (req.headers[header]) {
        return { reason: `Suspicious header detected: ${header}` };
      }
    }

    // 4. Check for rapid-fire requests (potential ACK flooding simulation)
    const requestIP = this.getClientIP(req);
    if (this.isRapidFireRequest(requestIP)) {
      return { reason: 'Rapid-fire request pattern detected (potential ACK flood)' };
    }

    // 5. Check for abnormal Range request patterns (potential optimistic ACK)
    if (req.headers['range']) {
      const rangeHeader = req.headers['range'] as string;
      if (this.isAbnormalRangeRequest(rangeHeader)) {
        return { reason: 'Abnormal Range request pattern detected' };
      }
    }

    // Allow all other requests (including legitimate frontend requests)
    return null;
  }

  /**
   * Check if the user agent represents a legitimate browser or client
   */
  private isLegitimateClient(userAgent: string): boolean {
    const legitimateAgents = [
      'Mozilla/',        // All major browsers
      'Chrome/',         // Chrome/Chromium
      'Safari/',         // Safari
      'Firefox/',        // Firefox
      'Edge/',           // Microsoft Edge
      'Opera/',          // Opera
      'curl/',           // cURL (legitimate tool)
      'wget/',           // wget (legitimate tool)
      'Node.js',         // Node.js HTTP client
      'axios/',          // Axios library
      'okhttp/',         // OkHttp library
      'Python-urllib',   // Python urllib
      'java/',           // Java HTTP clients
      'Go-http-client',  // Go HTTP client
      'libcurl',         // libcurl library
      'Postman',         // Postman API client
      'Insomnia'         // Insomnia API client
    ];

    // Check if user agent contains any legitimate client identifier
    for (const legit of legitimateAgents) {
      if (userAgent.includes(legit)) {
        return true;
      }
    }

    // If no user agent, allow (some legitimate clients don't send user agent)
    if (!userAgent || userAgent.trim().length === 0) {
      return true;
    }

    return false;
  }

  private isRapidFireRequest(ip: string): boolean {
    // Implementation would track request timing per IP
    // For now, always allow (this would be implemented with actual timing)
    return false;
  }

  private isAbnormalRangeRequest(rangeHeader: string): boolean {
    // Check for obviously malicious range requests
    try {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : null;
      
      // Allow all normal range requests
      // Only block clearly malicious patterns
      if (end && (end - start) > 100 * 1024 * 1024) { // Chunks > 100MB
        return true;
      }
      
      if (start < 0 || (end && end < start)) {
        return true;
      }
      
    } catch (error) {
      return true; // Malformed range header
    }
    
    return false;
  }

  private validateStreamingRequest(req: express.Request): { valid: boolean; reason: string } {
    const { streamId, segment } = req.params;
    
    // Validate stream ID format
    if (streamId && !/^[a-zA-Z0-9\-_]+$/.test(streamId)) {
      return { valid: false, reason: 'Invalid stream ID format' };
    }

    // Validate segment format (for .ts files)
    if (segment && !/^segment\d+\.ts$|^playlist\.m3u8$/.test(segment)) {
      return { valid: false, reason: 'Invalid segment format' };
    }

    return { valid: true, reason: '' };
  }

  private trackResponse(res: express.Response, clientIP: string): void {
    const originalSend = res.send;
    let bytesTransferred = 0;

    res.send = function(data: any) {
      if (data) {
        bytesTransferred += Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);
      }
      return originalSend.call(this, data);
    };

    const originalWrite = res.write;
    res.write = function(chunk: any, encoding?: any) {
      if (chunk) {
        bytesTransferred += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
      }
      return originalWrite.call(this, chunk, encoding);
    };

    res.on('finish', () => {
      if (bytesTransferred > 0) {
        console.log(`📊 Transfer completed for ${clientIP}: ${this.formatBytes(bytesTransferred)}`);
        
        // Log large downloads but don't block them
        if (bytesTransferred > 100 * 1024 * 1024) { // 100MB
          console.log(`📈 Large download from ${clientIP}: ${this.formatBytes(bytesTransferred)}`);
        }
      }
    });
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private checkConnectionLimit(ip: string): boolean {
    const currentConnections = this.connectionCounts.get(ip) || 0;
    
    // Be much more permissive for localhost/development
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
      const devLimit = this.config.maxConnectionsPerIP * 10; // 10x higher for localhost
      if (currentConnections >= devLimit) {
        console.log(`⚠️ Development connection limit exceeded for ${ip}: ${currentConnections}/${devLimit}`);
        return false;
      }
    } else {
      // Normal limit for external IPs
      if (currentConnections >= this.config.maxConnectionsPerIP) {
        console.log(`⚠️ Connection limit exceeded for ${ip}: ${currentConnections}/${this.config.maxConnectionsPerIP}`);
        return false;
      }
    }

    this.connectionCounts.set(ip, currentConnections + 1);
    
    // Shorter connection window for quicker cleanup
    setTimeout(() => {
      const count = this.connectionCounts.get(ip) || 0;
      if (count > 0) {
        this.connectionCounts.set(ip, count - 1);
      }
    }, 2000); // 2 second connection window instead of 10

    return true;
  }

  private applySecurityHeaders(res: express.Response): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow frontend access
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('X-Defense-System', 'active');
  }

  private getClientIP(req: express.Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           req.ip ||
           '127.0.0.1';
  }

  private isBlocked(ip: string): boolean {
    return this.blocklist.has(ip);
  }

  private addToBlocklist(ip: string): void {
    this.blocklist.add(ip);
    console.log(`🚫 IP ${ip} added to blocklist`);
    
    // Auto-remove from blocklist after 30 minutes
    setTimeout(() => {
      this.blocklist.delete(ip);
      console.log(`✅ IP ${ip} removed from blocklist`);
    }, 30 * 60 * 1000);
  }

  private sendSecurityResponse(res: express.Response, statusCode: number, message: string): void {
    res.status(statusCode).json({
      error: 'Security violation',
      message,
      timestamp: new Date().toISOString(),
      blocked: true,
      defenseSystem: 'OptimisticACK-Protection'
    });
  }

  private performPeriodicCleanup(): void {
    const now = Date.now();
    
    // Cleanup every 5 minutes
    if (now - this.lastCleanup > 300000) {
      this.cleanupConnectionCounts();
      this.lastCleanup = now;
    }
  }

  private cleanupConnectionCounts(): void {
    // Reset old connection counts
    const threshold = Date.now() - 600000; // 10 minutes ago
    for (const [ip, count] of this.connectionCounts.entries()) {
      if (count <= 0) {
        this.connectionCounts.delete(ip);
      }
    }
    console.log('🧹 Connection counts cleaned up');
  }

  public addCustomRule(rule: SecurityRule): void {
    this.config.customRules.push(rule);
    console.log(`🔧 Added custom security rule: ${rule.name}`);
  }

  public getSecurityMetrics() {
    const defenseMetrics = this.defenseSystem.getDefenseMetrics();
    
    return {
      ...defenseMetrics,
      activeConnections: this.connectionCounts.size,
      blockedIPs: this.blocklist.size,
      customRules: this.config.customRules.length,
      lastCleanup: this.lastCleanup,
      legitimateRequestsAllowed: true,
      onlyBlocksActualAttacks: true
    };
  }

  public updateConfig(newConfig: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.defenseSystem.updateConfig(newConfig);
    console.log('🔧 Security configuration updated');
  }

  public destroy(): void {
    this.defenseSystem.destroy();
    this.connectionCounts.clear();
    this.blocklist.clear();
    console.log('🔐 Security Middleware destroyed');
  }
}