#!/bin/bash
# filepath: /home/em09/MyCode/CSE 406/Project/Optimistic-Ack-Attack/scripts/install-dependencies.sh

echo "🔧 Installing dependencies for real packet injection..."

# Check OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "📱 Detected Linux - Installing hping3 and python3-scapy..."
    
    # Ubuntu/Debian
    if command -v apt-get &> /dev/null; then
        sudo apt-get install -y hping3 python3-scapy python3-pip
    fi
    
    # CentOS/RHEL/Fedora
    if command -v yum &> /dev/null; then
        sudo yum install -y hping3 python3-scapy python3-pip
    fi
    
    # Arch Linux
    if command -v pacman &> /dev/null; then
        sudo pacman -S hping python-scapy python-pip
    fi

elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 Detected macOS - Installing via Homebrew..."
    
    if command -v brew &> /dev/null; then
        brew install hping
        pip3 install scapy
    else
        echo "❌ Homebrew not found. Please install Homebrew first."
    fi

elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    echo "💻 Detected Windows - Please install Npcap manually"
    echo "📥 Download from: https://nmap.org/npcap/"
    echo "🐍 Install Python Scapy: pip install scapy"
fi

echo "✅ Dependencies installation attempted"
echo "⚠️  Note: Raw packet injection requires root/administrator privileges"
echo "🔧 Run with: sudo npm run dev:cli"