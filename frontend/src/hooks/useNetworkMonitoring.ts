import { useState, useEffect, useCallback, useRef } from 'react';
import type { NetworkMetrics, StreamingMetrics, DownloadMetrics, OptimisticAckMetrics } from '../types/network';

// Extend Navigator interface to include network connection properties
interface NavigatorWithConnection extends Navigator {
  connection?: {
    downlink: number;
    rtt: number;
  };
  mozConnection?: {
    downlink: number;
    rtt: number;
  };
  webkitConnection?: {
    downlink: number;
    rtt: number;
  };
}

export const useNetworkMonitoring = () => {
  const [networkMetrics, setNetworkMetrics] = useState<NetworkMetrics | null>(null);
  const [streamingMetrics, setStreamingMetrics] = useState<StreamingMetrics | null>(null);
  const [downloadMetrics, setDownloadMetrics] = useState<DownloadMetrics | null>(null);
  const [optimisticAckMetrics, setOptimisticAckMetrics] = useState<OptimisticAckMetrics | null>(null);
  
  const downloadStartTime = useRef<number>(0);
  const downloadedBytes = useRef<number>(0);
  const speedHistory = useRef<number[]>([]);
  const latencyHistory = useRef<number[]>([]);

  const [chunkMetrics, setChunkMetrics] = useState<{
    totalChunks: number;
    completedChunks: number;
    chunkSizes: number[];
    chunkSpeeds: number[];
  }>({
    totalChunks: 0,
    completedChunks: 0,
    chunkSizes: [],
    chunkSpeeds: []
  });

  // Network Connection API monitoring
  useEffect(() => {
    const updateConnectionInfo = () => {
      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      
      if (connection) {
        const timestamp = Date.now();
        const downlink = connection.downlink * 1000000 / 8; // Convert Mbps to bytes/sec
        
        setNetworkMetrics(prev => ({
          timestamp,
          downloadSpeed: downlink,
          uploadSpeed: downlink * 0.1, // Estimate upload as 10% of download
          latency: connection.rtt || 0,
          packetLoss: Math.random() * 2, // Simulated - real measurement would need server cooperation
          bandwidth: {
            current: downlink,
            peak: Math.max(prev?.bandwidth.peak || 0, downlink),
            average: speedHistory.current.reduce((a, b) => a + b, 0) / speedHistory.current.length || downlink
          },
          connectionQuality: getConnectionQuality(downlink, connection.rtt || 0)
        }));

        // Keep history for averaging
        speedHistory.current.push(downlink);
        if (speedHistory.current.length > 10) {
          speedHistory.current.shift();
        }
      }
    };

    updateConnectionInfo();
    const interval = setInterval(updateConnectionInfo, 2000);

    return () => clearInterval(interval);
  }, []);

  // Latency measurement using ping-like requests
  const measureLatency = useCallback(async (): Promise<number> => {
    const start = performance.now();
    try {
      await fetch('/health', { 
        method: 'HEAD',
        cache: 'no-cache'
      });
      const latency = performance.now() - start;
      
      latencyHistory.current.push(latency);
      if (latencyHistory.current.length > 10) {
        latencyHistory.current.shift();
      }
      
      return latency;
    } catch {
      return 0;
    }
  }, []);

  // Start download monitoring
  const startDownloadMonitoring = useCallback((filename: string, expectedSize: number) => {
    downloadStartTime.current = Date.now();
    downloadedBytes.current = 0;
    
    setDownloadMetrics({
      filename,
      size: expectedSize,
      downloaded: 0,
      speed: 0,
      eta: 0,
      startTime: downloadStartTime.current,
      chunks: []
    });
  }, []);

  // Update download progress with chunk awareness
  const updateDownloadProgress = useCallback((bytesDownloaded: number, isNewChunk: boolean = false) => {
    downloadedBytes.current = bytesDownloaded;
    const elapsed = (Date.now() - downloadStartTime.current) / 1000;
    const speed = elapsed > 0 ? bytesDownloaded / elapsed : 0;
    
    setDownloadMetrics(prev => {
      if (!prev) return null;
      
      const eta = speed > 0 ? (prev.size - bytesDownloaded) / speed : 0;
      
      return {
        ...prev,
        downloaded: bytesDownloaded,
        speed,
        eta
      };
    });

    // Track chunk completion
    if (isNewChunk) {
      setChunkMetrics(prev => ({
        ...prev,
        completedChunks: prev.completedChunks + 1,
        chunkSpeeds: [...prev.chunkSpeeds, speed].slice(-10) // Keep last 10 speeds
      }));
    }
  }, []);

  // Monitor fetch requests for automatic speed calculation
  const monitoredFetch = useCallback(async (url: string, options?: RequestInit): Promise<Response> => {
    const startTime = performance.now();
    const response = await fetch(url, options);
    
    if (response.ok && response.body) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedLength = 0;
      
      startDownloadMonitoring(url.split('/').pop() || 'unknown', 
        parseInt(response.headers.get('content-length') || '0'));

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        updateDownloadProgress(receivedLength);
      }

      const endTime = performance.now();
      const downloadTime = (endTime - startTime) / 1000;
      const speed = receivedLength / downloadTime;

      // Update network metrics with actual measured speed
      speedHistory.current.push(speed);
      if (speedHistory.current.length > 10) {
        speedHistory.current.shift();
      }

      // Create new response from chunks
      const fullChunk = new Uint8Array(receivedLength);
      let position = 0;
      for (const chunk of chunks) {
        fullChunk.set(chunk, position);
        position += chunk.length;
      }

      return new Response(fullChunk, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }

    return response;
  }, [startDownloadMonitoring, updateDownloadProgress]);

  // Streaming metrics monitoring
  const updateStreamingMetrics = useCallback((videoElement: HTMLVideoElement) => {
    if (!videoElement) return;

    const quality = videoElement.getVideoPlaybackQuality?.();
    const buffered = videoElement.buffered;
    const currentTime = videoElement.currentTime;
    
    let bufferHealth = 0;
    if (buffered.length > 0) {
      for (let i = 0; i < buffered.length; i++) {
        if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
          bufferHealth = buffered.end(i) - currentTime;
          break;
        }
      }
    }

    setStreamingMetrics(prev => ({
      bufferHealth,
      droppedFrames: quality?.droppedVideoFrames || 0,
      bitrateKbps: 0, // Would need to be calculated from network data
      resolution: `${videoElement.videoWidth}x${videoElement.videoHeight}`,
      fps: 0, // Would need frame counting
      segmentDownloadTime: prev?.segmentDownloadTime || [],
      rebufferingEvents: prev?.rebufferingEvents || 0
    }));
  }, []);

  // Optimistic ACK simulation
  const simulateOptimisticAck = useCallback((isActive: boolean) => {
    setOptimisticAckMetrics(prev => {
      const normalSpeed = networkMetrics?.downloadSpeed || 1000000;
      const optimisticSpeed = isActive ? normalSpeed * 1.3 : normalSpeed; // 30% improvement
      
      return {
        normalDownloadSpeed: normalSpeed,
        optimisticDownloadSpeed: optimisticSpeed,
        speedImprovement: isActive ? 30 : 0,
        ackOptimizationActive: isActive,
        tcpWindowSize: isActive ? 65536 * 2 : 65536,
        retransmissions: Math.floor(Math.random() * (isActive ? 2 : 5)),
        outOfOrderPackets: Math.floor(Math.random() * (isActive ? 10 : 20))
      };
    });
  }, [networkMetrics]);

    // Clear all metrics function
    const clearAllMetrics = useCallback(() => {
    console.log('🧹 Clearing all network monitoring metrics');
    
    // Reset all state
    setNetworkMetrics(null);
    setStreamingMetrics(null);
    setDownloadMetrics(null);
    setOptimisticAckMetrics(null);
    
    // Reset all refs
    downloadStartTime.current = 0;
    downloadedBytes.current = 0;
    speedHistory.current = [];
    latencyHistory.current = [];
    
    console.log('✅ All metrics cleared successfully');
    }, []);
    

  return {
    networkMetrics,
    streamingMetrics,
    downloadMetrics,
    optimisticAckMetrics,
    chunkMetrics, // Add this
    measureLatency,
    monitoredFetch,
    updateStreamingMetrics,
    simulateOptimisticAck,
    startDownloadMonitoring,
    updateDownloadProgress,
    clearAllMetrics
  };
};

// Helper function
const getConnectionQuality = (speed: number, latency: number): 'excellent' | 'good' | 'fair' | 'poor' => {
  if (speed > 10000000 && latency < 50) return 'excellent'; // 10 Mbps, <50ms
  if (speed > 5000000 && latency < 100) return 'good';      // 5 Mbps, <100ms
  if (speed > 1000000 && latency < 200) return 'fair';      // 1 Mbps, <200ms
  return 'poor';
};