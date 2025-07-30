import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { StreamingServer, StreamingServerConfig } from './server/StreamingServer.js';

// Parse command line arguments
interface CLIArgs {
  defense: boolean;
  defenseMode: 'high' | 'medium' | 'low' | 'off';
  port: number;
  help: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {
    defense: true, // Default to enabled
    defenseMode: 'medium', // Default mode
    port: 3001, // Default port
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--defense':
      case '-d':
        const defenseValue = args[i + 1];
        if (defenseValue === 'false' || defenseValue === 'off' || defenseValue === 'disabled') {
          result.defense = false;
          result.defenseMode = 'off';
        } else if (defenseValue === 'true' || defenseValue === 'on' || defenseValue === 'enabled') {
          result.defense = true;
        }
        i++; // Skip next argument
        break;
        
      case '--defense-mode':
      case '-dm':
        const mode = args[i + 1] as 'high' | 'medium' | 'low' | 'off';
        if (['high', 'medium', 'low', 'off'].includes(mode)) {
          result.defenseMode = mode;
          result.defense = mode !== 'off';
        }
        i++; // Skip next argument
        break;
        
      case '--port':
      case '-p':
        const port = parseInt(args[i + 1]);
        if (!isNaN(port) && port > 0 && port <= 65535) {
          result.port = port;
        }
        i++; // Skip next argument
        break;
        
      case '--help':
      case '-h':
        result.help = true;
        break;
        
      case '--no-defense':
        result.defense = false;
        result.defenseMode = 'off';
        break;
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`
🛡️ Optimistic ACK Attack - Backend Server

Usage: npx tsx src/app.ts [options]

Options:
  --defense, -d <enabled>      Enable/disable defense system (true/false) [default: true]
  --defense-mode, -dm <mode>   Defense mode (high/medium/low/off) [default: medium]
  --no-defense                 Disable defense system completely
  --port, -p <port>           Server port [default: 3001]
  --help, -h                  Show this help message

Defense Modes:
  high     - Maximum protection, aggressive thresholds
  medium   - Balanced protection and performance
  low      - Minimal protection, performance optimized  
  off      - No protection (vulnerable to attacks)

Examples:
  npx tsx src/app.ts                                    # Default: defense enabled, medium mode
  npx tsx src/app.ts --defense true --defense-mode high # High security mode
  npx tsx src/app.ts --no-defense                       # No protection (testing)
  npx tsx src/app.ts -d false                           # Disable defense
  npx tsx src/app.ts -dm low -p 8080                    # Low defense mode on port 8080

🎯 Test the defense system:
  curl -H "X-Simulate-Attack: optimistic-ack" http://localhost:3001/download/xl.dat
`);
}

class App {
  private app: express.Application;
  private server: http.Server;
  private io: SocketIOServer;
  private streamingServer: StreamingServer;
  private metricsInterval: NodeJS.Timeout | null = null;
  private statusInterval: NodeJS.Timeout | null = null;
  private config: StreamingServerConfig;

  constructor(config: StreamingServerConfig) {
    this.config = config;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: { origin: "*", methods: ["GET", "POST"] }
    });
    
    this.streamingServer = new StreamingServer(config);

    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeWebSockets();
    
    // Log configuration
    console.log('🚀 Server initialized with configuration:');
    console.log(`   Defense System: ${config.enableDefense ? '✅ ENABLED' : '❌ DISABLED'}`);
    console.log(`   Defense Mode: ${config.defenseMode.toUpperCase()}`);
    if (!config.enableDefense) {
      console.log('⚠️  WARNING: Server is vulnerable to optimistic ACK attacks!');
    }
  }

  private initializeMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static('public'));
  }

  private initializeRoutes(): void {
    // Mount the streaming server's Express app with all its security middleware
    this.app.use('/', this.streamingServer.getApp());

    // Server control endpoints (these are additional endpoints for the main app)
    this.app.post('/api/server/start', (req, res) => {
      // Logic to start server monitoring
      this.startMetricsEmission();
      this.io.emit('server-status', true);
      res.json({ status: 'started' });
    });

    this.app.post('/api/server/stop', (req, res) => {
      // Logic to stop server monitoring
      this.stopMetricsEmission();
      this.io.emit('server-status', false);
      res.json({ status: 'stopped' });
    });

    // Basic health check endpoint (this will be overridden by StreamingServer if it has one)
    this.app.get('/health', (req, res) => {
      res.json({ status: 'OK', timestamp: new Date().toISOString() });
    });
  }

  private initializeWebSockets(): void {
    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      
      // Send initial server status
      socket.emit('server-status', true);
      
      // Send initial metrics if available
      try {
        const metrics = this.getSystemMetrics();
        socket.emit('metrics-update', metrics);
      } catch (error) {
        console.error('Error getting initial metrics:', error);
      }
      
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });

      socket.on('request-metrics', () => {
        try {
          const metrics = this.getSystemMetrics();
          socket.emit('metrics-update', metrics);
        } catch (error) {
          console.error('Error sending metrics:', error);
        }
      });

      socket.on('request-server-status', () => {
        socket.emit('server-status', true);
      });
    });
  }

  private startMetricsEmission(): void {
    if (this.metricsInterval) return;

    // this.metricsInterval = setInterval(() => {
      try {
        const metrics = this.getSystemMetrics();
        this.io.emit('metrics-update', metrics);
      } catch (error) {
        console.error('Error emitting metrics:', error);
      }
    //}, 2000); // Emit metrics every 2 seconds
  }

  private stopMetricsEmission(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  private startStatusEmission(): void {
    if (this.statusInterval) return;
    //this.statusInterval = setInterval(() => {
      this.io.emit('server-status', true);
    //}, 5000); // Emit status every 5 seconds
  }

  private stopStatusEmission(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }

  private getSystemMetrics() {
    // Generate mock metrics for now - replace with actual system monitoring
    return {
      timestamp: Date.now(),
      cpu: {
        usage: Math.random() * 100,
        temperature: Math.floor(Math.random() * 20) + 45
      },
      memory: {
        total: 16 * 1024 * 1024 * 1024, // 16GB
        used: Math.random() * 8 * 1024 * 1024 * 1024, // Random usage up to 8GB
        free: 0,
        percentage: Math.random() * 80
      },
      disk: {
        total: 500 * 1024 * 1024 * 1024, // 500GB
        used: Math.random() * 250 * 1024 * 1024 * 1024,
        free: 0,
        percentage: Math.random() * 70
      },
      network: {
        bytesSent: Math.floor(Math.random() * 1000000),
        bytesReceived: Math.floor(Math.random() * 1000000),
        packetsSent: Math.floor(Math.random() * 10000),
        packetsReceived: Math.floor(Math.random() * 10000)
      },
      uptime: Math.floor(Date.now() / 1000)
    };
  }

  public start(port: number = 3001): void {
    this.server.listen(port, () => {
      console.log(`🚀 Server running on http://localhost:${port}`);
      console.log('📡 WebSocket server ready');
      console.log('📥 Available endpoints:');
      console.log('  - GET /health - Health check');
      console.log('  - GET /download/:filename - Download files');
      console.log('  - GET /stream/:streamId/playlist.m3u8 - HLS playlist');
      console.log('  - GET /stream/:streamId/:segment - HLS segments');
      
      if (this.config.enableDefense) {
        console.log('  - GET /security/metrics - Defense metrics');
        console.log('  - GET /security/status - Defense status');
        console.log('');
        console.log('🛡️ Defense System Status:');
        console.log(`   Mode: ${this.config.defenseMode.toUpperCase()}`);
        console.log('   Protection: ACTIVE');
        console.log('');
        console.log('🧪 Test defense system:');
        console.log(`   curl -H "X-Simulate-Attack: optimistic-ack" http://localhost:${port}/download/xl.dat`);
      } else {
        console.log('');
        console.log('⚠️  SECURITY WARNING:');
        console.log('   Defense system is DISABLED');
        console.log('   Server is vulnerable to optimistic ACK attacks');
        console.log('   Use --defense true to enable protection');
      }
      
      console.log('  - POST /api/server/start - Start monitoring');
      console.log('  - POST /api/server/stop - Stop monitoring');
      
      // Start emitting metrics by default
      this.startMetricsEmission();
      this.startStatusEmission();
    });
  }

  public stop(): void {
    this.stopMetricsEmission();
    this.stopStatusEmission();
    if (this.server) {
      this.server.close();
    }
  }
}

// Auto-start the server with parsed arguments
const cliArgs = parseArgs();

if (cliArgs.help) {
  showHelp();
  process.exit(0);
}

const serverConfig: StreamingServerConfig = {
  enableDefense: cliArgs.defense,
  defenseMode: cliArgs.defenseMode
};

const app = new App(serverConfig);
const port = cliArgs.port;

app.start(port);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  app.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  app.stop();
  process.exit(0);
});

export default App;
