# Create some sample files of different sizes
echo "This is a small test file for download testing." > backend/data/files/small-file.txt

# Create a larger file for testing range requests
dd if=/dev/zero of=backend/data/files/large-file.bin bs=1M count=10

# Create a sample document
cat > backend/data/files/sample-document.txt << 'EOF'
Sample Document for TCP ACK Attack Testing
==========================================

This document is used for testing file download functionality
in the Optimistic TCP ACK Attack analysis project.

Content includes:
- Network monitoring capabilities
- Connection analysis
- Performance metrics
- Security analysis

This file can be used to test:
1. Normal downloads
2. Range request handling
3. Connection monitoring
4. Suspicious activity detection

Generated for educational and research purposes.
EOF

# Create a sample JSON configuration file
cat > backend/data/files/config-sample.json << 'EOF'
{
  "server": {
    "port": 3000,
    "host": "localhost"
  },
  "monitoring": {
    "enabled": true,
    "interval": 5000
  },
  "analysis": {
    "thresholds": {
      "rapidRequests": 10,
      "largeDownload": 104857600
    }
  }
}
EOF