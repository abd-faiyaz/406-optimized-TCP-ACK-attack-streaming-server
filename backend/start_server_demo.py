#!/usr/bin/env python3

import os
import sys

OPTIONS = [
    {
        "label": "🔒 High Security Mode (Maximum Protection)",
        "cmd": "python app.py --defense-mode high",
        "desc": [
            "Aggressive attack detection",
            "Low tolerance thresholds",
            "30-minute quarantine"
        ]
    },
    {
        "label": "⚖️  Medium Security Mode (Balanced - Default)",
        "cmd": "python app.py --defense-mode medium",
        "desc": [
            "Balanced protection and performance",
            "Moderate thresholds",
            "10-minute quarantine"
        ]
    },
    {
        "label": "🚀 Low Security Mode (Performance Optimized)",
        "cmd": "python app.py --defense-mode low",
        "desc": [
            "Minimal protection overhead",
            "Higher tolerance thresholds",
            "5-minute quarantine"
        ]
    },
    {
        "label": "⚠️  No Protection (Vulnerable - Testing Only)",
        "cmd": "python app.py --no-defense",
        "desc": [
            "NO attack protection",
            "For testing attack effectiveness",
            "Performance baseline"
        ]
    },
    {
        "label": "🔧 Custom Configuration",
        "cmd": "python app.py --defense-mode high --port 8080\n   python app.py -dm medium -p 3001",
        "desc": []
    },
    {
        "label": "📚 Help and Documentation",
        "cmd": "python app.py --help",
        "desc": []
    }
]

TESTS = [
    ("Normal request (should succeed):", "curl http://localhost:3000/download/xl.dat"),
    ("Simulated attack (should be blocked if defense enabled):",
     "curl -H 'X-Simulate-Attack: optimistic-ack' http://localhost:3000/download/xl.dat"),
    ("Check defense status:", "curl http://localhost:3000/security/status"),
    ("View security metrics (if defense enabled):", "curl http://localhost:3000/security/metrics | jq"),
    ("Real attack tool user agent (should be blocked):",
     "curl -H 'User-Agent: OptimisticACK-Attack-Tool/1.0' http://localhost:3000/download/xl.dat")
]

def main():
    print("🛡️ Optimistic ACK Attack Defense System - Server Startup Demo")
    print("=" * 60)
    print()

    print("Available startup options:\n")
    for i, opt in enumerate(OPTIONS, 1):
        print(f"{i}. {opt['label']}")
        print(f"   {opt['cmd']}")
        for d in opt['desc']:
            print(f"   - {d}")
        print()

    print("🧪 Testing Commands:")
    print("=" * 20)
    print()
    for title, cmd in TESTS:
        print(title)
        print(cmd)
        print()

    input("Press Enter to start server with default settings (medium security), or Ctrl+C to exit...")

    print()
    print("Starting server with medium security mode...")
    print("python app.py")
    print()

    os.execvp("python", ["python", "app.py"])

if __name__ == "__main__":
    main()
