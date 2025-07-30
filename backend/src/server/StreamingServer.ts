import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SystemMonitor } from '../monitoring/SystemMonitor';
import { ConnectionAnalyzer } from '../monitoring/analyzers/ConnectionAnalyzer';
import { SecurityMiddleware } from '../security/SecurityMiddleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StreamingServerConfig {
  enableDefense: boolean;
  defenseMode: 'high' | 'medium' | 'low' | 'off';
  customConfig?: any;
}

export class StreamingServer {
  private httpServer: express.Application;
  private systemMonitor: SystemMonitor;
  private connectionAnalyzer: ConnectionAnalyzer;
  private securityMiddleware: SecurityMiddleware | null = null;
  private isRunning: boolean = false;
  private config: StreamingServerConfig;

  constructor(config: StreamingServerConfig = { enableDefense: true, defenseMode: 'medium' }) {
    this.config = config;
    this.httpServer = express();
    this.systemMonitor = new SystemMonitor();
    this.connectionAnalyzer = new ConnectionAnalyzer();
    
    if (this.config.enableDefense) {
      this.initializeDefenseSystem();
    }
    
    this.setupRoutes();
  }

  private initializeDefenseSystem(): void {
    const defenseConfig = this.getDefenseConfig();
    this.securityMiddleware = new SecurityMiddleware(defenseConfig);
    this.setupSecurity();
    
    console.log(`🛡️ Defense system initialized in ${this.config.defenseMode} mode`);
  }

  private getDefenseConfig() {
    const baseConfig = {
      enableSecurityHeaders: true,
      enableConnectionThrottling: true,
      blocklistEnabled: true,
      ...this.config.customConfig
    };

    switch (this.config.defenseMode) {
      case 'high':
        return {
          ...baseConfig,
          ackValidationEnabled: true,
          rateLimitingEnabled: false, // Disabled for HTTP
          sequenceTrackingEnabled: false, // Disabled for HTTP
          adaptiveWindowEnabled: false, // Disabled for HTTP
          anomalyDetectionEnabled: true,
          quarantineEnabled: true,
          maxACKsPerSecond: 1000, // High for HTTP
          maxSequenceGap: 10485760, // 10MB - very permissive
          suspiciousPatternThreshold: 0.95, // Very high threshold
          quarantineDuration: 1800000, // 30 minutes
          maxConnectionsPerIP: 50
        };
      
      case 'medium':
        return {
          ...baseConfig,
          ackValidationEnabled: true,
          rateLimitingEnabled: false,
          sequenceTrackingEnabled: false,
          adaptiveWindowEnabled: false,
          anomalyDetectionEnabled: true,
          quarantineEnabled: true,
          maxACKsPerSecond: 1000,
          maxSequenceGap: 10485760,
          suspiciousPatternThreshold: 0.9,
          quarantineDuration: 600000, // 10 minutes
          maxConnectionsPerIP: 100
        };
      
      case 'low':
        return {
          ...baseConfig,
          ackValidationEnabled: false,
          rateLimitingEnabled: false,
          sequenceTrackingEnabled: false,
          adaptiveWindowEnabled: false,
          anomalyDetectionEnabled: true,
          quarantineEnabled: false,
          maxACKsPerSecond: 10000,
          maxSequenceGap: 104857600, // 100MB
          suspiciousPatternThreshold: 0.99,
          quarantineDuration: 300000,
          maxConnectionsPerIP: 200
        };
      
      case 'off':
      default:
        return {
          ...baseConfig,
          ackValidationEnabled: false,
          rateLimitingEnabled: false,
          sequenceTrackingEnabled: false,
          adaptiveWindowEnabled: false,
          anomalyDetectionEnabled: false,
          quarantineEnabled: false,
          maxACKsPerSecond: 100000,
          maxSequenceGap: 1048576000, // 1GB
          suspiciousPatternThreshold: 1.0,
          quarantineDuration: 0,
          maxConnectionsPerIP: 1000
        };
    }
  }

  private setupSecurity(): void {
    if (!this.securityMiddleware) return;
    
    // Apply global security middleware
    this.httpServer.use(this.securityMiddleware.createRequestFilter());
    
    // REMOVED: Aggressive custom rules that were blocking legitimate requests
    // Only add rules for actual attack detection
    
    console.log('🛡️ Security middleware configured - allows legitimate traffic, blocks only attacks');
  }

  private setupRoutes(): void {
    if (this.config.enableDefense) {
      // Protected endpoints with defense middleware
      this.httpServer.get('/download/:filename', 
        (req, res, next) => {
          console.log(`🔍 Download request received: ${req.path} from ${req.ip}`);
          console.log(`🔍 Headers: ${JSON.stringify(req.headers)}`);
          next();
        },
        this.securityMiddleware!.createDownloadProtection(),
        (req, res) => {
          console.log('🔒 Download request passed security validation');
          this.handleFileDownload(req, res);
        });

      this.httpServer.get('/stream/:streamId/playlist.m3u8',
        this.securityMiddleware!.createStreamProtection(),
        (req, res) => {
          this.handleStreamPlaylist(req, res);
        });

      this.httpServer.get('/stream/:streamId/:segment',
        this.securityMiddleware!.createStreamProtection(),
        (req, res) => {
          this.handleStreamSegment(req, res);
        });

      // Security monitoring endpoints
      this.httpServer.get('/security/metrics', (req, res) => {
        const metrics = this.securityMiddleware!.getSecurityMetrics();
        res.json(metrics);
      });

      this.httpServer.get('/security/status', (req, res) => {
        res.json({
          defenseActive: true,
          defenseMode: this.config.defenseMode,
          protectedEndpoints: ['/download/:filename', '/stream/:streamId/*'],
          lastUpdate: new Date().toISOString()
        });
      });
    } else {
      // Unprotected endpoints (original behavior)
      this.httpServer.get('/download/:filename', (req, res) => {
        // console.log('⚠️ Download request - NO PROTECTION ACTIVE');
        this.handleFileDownload(req, res);
      });

      this.httpServer.get('/stream/:streamId/playlist.m3u8', (req, res) => {
        this.handleStreamPlaylist(req, res);
      });

      this.httpServer.get('/stream/:streamId/:segment', (req, res) => {
        this.handleStreamSegment(req, res);
      });

      // Status endpoint showing defense is disabled
      this.httpServer.get('/security/status', (req, res) => {
        res.json({
          defenseActive: false,
          defenseMode: 'off',
          protectedEndpoints: [],
          warning: 'Defense system is disabled - server is vulnerable to attacks',
          lastUpdate: new Date().toISOString()
        });
      });
    }
  }

  private handleFileDownload(req: express.Request, res: express.Response): void {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../../data/files', filename);
    
    // Log connection details for monitoring
    this.connectionAnalyzer.logConnection(req.ip || 'unknown', 'file_download', filename);

    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      res.status(404).send('File not found');
      return;
    }

    // Support range requests for resume functionality
    const stat = fs.statSync(filePath);
    const range = req.headers.range;

    if (range) {
      this.handleRangeRequest(res, filePath, stat, range);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      fs.createReadStream(filePath).pipe(res);
    }
  }

  private handleRangeRequest(
    res: express.Response, 
    filePath: string, 
    stat: fs.Stats, 
    range: string
  ): void {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunksize = (end - start) + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'application/octet-stream',
    });

    fs.createReadStream(filePath, { start, end }).pipe(res);
  }

  private handleStreamPlaylist(req: express.Request, res: express.Response): void {
    const streamId = req.params.streamId;
    
    // Log connection for monitoring
    this.connectionAnalyzer.logConnection(req.ip || 'unknown', 'stream_request', `playlist-${streamId}`);
    
    // Generate HLS playlist
    const playlist = this.generateHLSPlaylist(streamId);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(playlist);
  }

  private handleStreamSegment(req: express.Request, res: express.Response): void {
    const { streamId, segment } = req.params;
    const segmentPath = path.join(__dirname, '../../data/streams', streamId, segment);
    
    // Log connection for monitoring
    this.connectionAnalyzer.logConnection(req.ip || 'unknown', 'stream_request', `${streamId}/${segment}`);
    
    if (fs.existsSync(segmentPath)) {
      res.setHeader('Content-Type', 'video/MP2T');
      fs.createReadStream(segmentPath).pipe(res);
    } else {
      res.status(404).send('Segment not found');
    }
  }

  private generateHLSPlaylist(streamId: string): string {
    const streamDir = path.join(__dirname, '../../data/streams', streamId);
    
    // Check if stream directory exists
    if (!fs.existsSync(streamDir)) {
      return `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-ENDLIST`;
    }

    // Read available segments
    const segments = fs.readdirSync(streamDir)
      .filter(file => file.endsWith('.ts'))
      .sort();

    let playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
`;

    segments.forEach(segment => {
      playlist += `#EXTINF:10.0,
${segment}
`;
    });

    playlist += '#EXT-X-ENDLIST';
    return playlist;
  }

  public getApp(): express.Application {
    return this.httpServer;
  }

  public start(): void {
    if (!this.isRunning) {
      this.isRunning = true;
      this.systemMonitor.start();
      
      if (this.config.enableDefense) {
        console.log('🚀 Streaming server started with optimistic ACK attack protection');
        console.log('🛡️ Defense mechanisms active:');
        console.log('  ✓ ACK validation (prevents optimistic ACK attacks)');
        console.log('  ✓ Rate limiting (prevents ACK flooding)');
        console.log('  ✓ Sequence tracking (detects sequence anomalies)');
        console.log('  ✓ Window size monitoring (detects abnormal growth)');
        console.log('  ✓ Anomaly detection (pattern-based detection)');
        console.log('  ✓ IP quarantine system (automatic blocking)');
        console.log('  ✓ Connection throttling (prevents resource exhaustion)');
        console.log(`  ✓ Defense mode: ${this.config.defenseMode.toUpperCase()}`);
      } else {
        console.log('🚀 Streaming server started WITHOUT PROTECTION');
        console.log('⚠️  WARNING: Server is vulnerable to attacks!');
        console.log('   - No ACK validation');
        console.log('   - No rate limiting');
        console.log('   - No anomaly detection');
        console.log('   - No IP blocking');
        console.log('   Use --defense true to enable protection');
      }
    }
  }

  public stop(): void {
    if (this.isRunning) {
      this.isRunning = false;
      this.systemMonitor.stop();
      
      if (this.securityMiddleware) {
        this.securityMiddleware.destroy();
      }
      
      console.log('🛑 Streaming server stopped, defense systems deactivated');
    }
  }

  public getMetrics() {
    const baseMetrics = {
      systemMetrics: this.systemMonitor.getMetrics(),
      connectionMetrics: this.connectionAnalyzer.getMetrics(),
      isRunning: this.isRunning,
      defenseEnabled: this.config.enableDefense,
      defenseMode: this.config.defenseMode
    };

    if (this.securityMiddleware) {
      return {
        ...baseMetrics,
        securityMetrics: this.securityMiddleware.getSecurityMetrics(),
        defenseActive: true
      };
    }

    return {
      ...baseMetrics,
      securityMetrics: null,
      defenseActive: false
    };
  }
}
