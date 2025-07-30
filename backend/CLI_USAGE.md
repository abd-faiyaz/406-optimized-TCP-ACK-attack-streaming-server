# Command-Line Defense Control

## Quick Start

The backend server now supports command-line arguments to control the defense system:

```bash
# Start with default protection (medium mode)
npx tsx src/app.ts

# High security mode (maximum protection)
npx tsx src/app.ts --defense-mode high

# No protection (vulnerable - for testing)
npx tsx src/app.ts --no-defense

# Custom port with low security
npx tsx src/app.ts --defense-mode low --port 8080
```

## Command-Line Options

| Option | Short | Description | Default |
|--------|--------|-------------|---------|
| `--defense <enabled>` | `-d` | Enable/disable defense system | `true` |
| `--defense-mode <mode>` | `-dm` | Defense mode (high/medium/low/off) | `medium` |
| `--no-defense` | - | Disable defense completely | - |
| `--port <port>` | `-p` | Server port | `3000` |
| `--help` | `-h` | Show help message | - |

## Defense Modes

### 🔒 High Security Mode
- **Use case**: High-risk environments, production systems
- **Protection**: Maximum security, aggressive detection
- **Performance**: Some overhead, prioritizes security
- **Thresholds**: Very sensitive (20 ACKs/sec, 256KB gap limit)
- **Quarantine**: 30 minutes

```bash
npx tsx src/app.ts --defense-mode high
```

### ⚖️ Medium Security Mode (Default)
- **Use case**: Balanced protection and performance
- **Protection**: Good security with reasonable performance
- **Performance**: Minimal overhead
- **Thresholds**: Moderate (50 ACKs/sec, 512KB gap limit)
- **Quarantine**: 10 minutes

```bash
npx tsx src/app.ts --defense-mode medium
npx tsx src/app.ts  # Default
```

### 🚀 Low Security Mode
- **Use case**: Performance-critical applications
- **Protection**: Basic protection only
- **Performance**: Optimized for speed
- **Thresholds**: Relaxed (100 ACKs/sec, 1MB gap limit)
- **Quarantine**: 5 minutes

```bash
npx tsx src/app.ts --defense-mode low
```

### ⚠️ No Protection Mode
- **Use case**: Testing, development, attack demonstrations
- **Protection**: None - server is vulnerable
- **Performance**: Maximum performance
- **Thresholds**: Disabled
- **Quarantine**: Disabled

```bash
npx tsx src/app.ts --no-defense
npx tsx src/app.ts --defense false
```

## Testing the Defense System

### 1. Start Protected Server
```bash
# Terminal 1: Start server with defense
npx tsx src/app.ts --defense-mode medium
```

### 2. Test Normal Request (Should Succeed)
```bash
# Terminal 2: Normal request
curl http://localhost:3000/download/xl.dat
```

### 3. Test Simulated Attack (Should Be Blocked)
```bash
# Terminal 2: Simulated optimistic ACK attack
curl -H "X-Simulate-Attack: optimistic-ack" http://localhost:3000/download/xl.dat
```

**Expected Response:**
```json
{
  "error": "Security violation",
  "message": "TCP security violation: Optimistic ACK detected: advancing 2000000 bytes beyond expected",
  "timestamp": "2025-07-26T10:30:00.000Z",
  "blocked": true
}
```

### 4. Check Defense Status
```bash
curl http://localhost:3000/security/status | jq
```

### 5. View Security Metrics
```bash
curl http://localhost:3000/security/metrics | jq
```

## Comparison Testing

Compare server behavior with and without defense:

```bash
# Test vulnerable server
npx tsx src/app.ts --no-defense &
curl -H "X-Simulate-Attack: optimistic-ack" http://localhost:3000/download/xl.dat
# Should succeed (vulnerable)

# Test protected server  
npx tsx src/app.ts --defense-mode high &
curl -H "X-Simulate-Attack: optimistic-ack" http://localhost:3000/download/xl.dat
# Should be blocked (protected)
```

## Demo Script

Use the interactive demo script:

```bash
cd backend
./start_server_demo.sh
```

This script shows all available options and lets you test different configurations interactively.

## Monitoring

When defense is enabled, the following endpoints are available:

- `GET /security/status` - Defense system status
- `GET /security/metrics` - Real-time security metrics
- `GET /health` - Server health check

Monitor defense actions in real-time by watching the server logs:

```bash
npx tsx src/app.ts --defense-mode high | grep "🛡️\|🚫\|⚠️"
```

## Integration with Attack Tool

Test the defense against the actual attack tool:

```bash
# Terminal 1: Start protected server
npx tsx src/app.ts --defense-mode high

# Terminal 2: Run attack tool (from malicious_client directory)
cd ../malicious_client
npm start -- --target localhost --port 3000 --enable-transfer --transfer-type download
```

The defense system should detect and block the attack, showing logs like:
```
🛡️ Defense Action: reject_packet - Optimistic ACK detected: advancing 1048576 bytes beyond expected (high)
🚫 IP 127.0.0.1 quarantined for 1800 seconds
```
