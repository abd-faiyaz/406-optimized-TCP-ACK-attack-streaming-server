import { useState, useRef, useEffect } from 'react';
import Hls from 'hls.js';

interface LiveStreamingPanelProps {
  isServerRunning: boolean;
}

interface StreamingMetrics {
  segmentCount: number;
  totalSegments: number;
  totalBytes: number;
  currentSpeed: number;
  averageSpeed: number;
  streamStartTime: number;
  lastSegmentTime: number;
  segmentSpeeds: number[];
}

const LiveStreamingPanel = ({ isServerRunning }: LiveStreamingPanelProps) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamUrl, setStreamUrl] = useState('');
  const [streamId, setStreamId] = useState('sample-stream');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [hasStatsToShow, setHasStatsToShow] = useState(false);
  const [streamComplete, setStreamComplete] = useState(false);
  
  // Streaming metrics
  const [streamingMetrics, setStreamingMetrics] = useState<StreamingMetrics>({
    segmentCount: 0,
    totalSegments: 0,
    totalBytes: 0,
    currentSpeed: 0,
    averageSpeed: 0,
    streamStartTime: 0,
    lastSegmentTime: 0,
    segmentSpeeds: []
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const streamingRef = useRef(false);
  const segmentsRef = useRef<string[]>([]);

  // Helper functions
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  // Get HLS playlist (same as OptimisticACKAttacker)
  const getHLSPlaylist = async (url: string): Promise<string> => {
    console.log(`📋 Fetching HLS playlist: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const playlist = await response.text();
    console.log(`📋 Received HLS playlist (${playlist.length} bytes)`);
    return playlist;
  };

  // Parse playlist (same as OptimisticACKAttacker)
  const parsePlaylist = (playlist: string): string[] => {
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
  };

  // Download stream segment with speed measurement (same method as OptimisticACKAttacker)
  const downloadStreamSegment = async (segmentUrl: string, segmentIndex: number): Promise<number> => {
    return new Promise((resolve, reject) => {
      console.log(`🎬 Downloading segment ${segmentIndex + 1}: ${segmentUrl}`);
      
      const segmentStartTime = Date.now();
      let totalBytes = 0;
      
      const req = fetch(segmentUrl);
      
      req.then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        console.log(`📡 Segment response: ${response.status} ${response.statusText}`);
        console.log(`📏 Content-Length: ${response.headers.get('content-length')}`);
        console.log(`🎥 Content-Type: ${response.headers.get('content-type')}`);
        
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body reader available');
        }
        
        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          
          if (done) {
            const segmentEndTime = Date.now();
            const segmentDuration = (segmentEndTime - segmentStartTime) / 1000;
            const segmentSpeed = segmentDuration > 0 ? totalBytes / segmentDuration : 0;
            
            // Update metrics
            setStreamingMetrics(prev => {
              const newSegmentSpeeds = [...prev.segmentSpeeds, segmentSpeed].slice(-10); // Keep last 10 speeds
              const newTotalBytes = prev.totalBytes + totalBytes;
              const elapsedTime = (segmentEndTime - prev.streamStartTime) / 1000;
              const newAverageSpeed = elapsedTime > 0 ? newTotalBytes / elapsedTime : 0;
              
              return {
                ...prev,
                segmentCount: prev.segmentCount + 1,
                totalBytes: newTotalBytes,
                currentSpeed: segmentSpeed,
                averageSpeed: newAverageSpeed,
                lastSegmentTime: segmentEndTime,
                segmentSpeeds: newSegmentSpeeds
              };
            });
            
            console.log(`✅ Segment ${segmentIndex + 1} completed: ${formatBytes(totalBytes)} in ${segmentDuration.toFixed(1)}s (${formatSpeed(segmentSpeed)})`);
            resolve(totalBytes);
            return;
          }
          
          totalBytes += value.length;
          
          // Continue reading
          return pump();
        };
        
        pump().catch(reject);
        
      }).catch(reject);
    });
  };

  // Start streaming with manual segment downloads (like OptimisticACKAttacker)
  const handleStartStream = async () => {
    if (!isServerRunning) {
      alert('Server must be running to start streaming');
      return;
    }

    try {
      setConnectionStatus('connecting');
      setStreamComplete(false);
      const playlistUrl = `http://localhost:3001/stream/${streamId}/playlist.m3u8`;
      setStreamUrl(playlistUrl);

      // Reset metrics
      const startTime = Date.now();
      setStreamingMetrics({
        segmentCount: 0,
        totalSegments: 0,
        totalBytes: 0,
        currentSpeed: 0,
        averageSpeed: 0,
        streamStartTime: startTime,
        lastSegmentTime: startTime,
        segmentSpeeds: []
      });

      // Get playlist and parse segments (same as OptimisticACKAttacker)
      console.log('📋 Fetching HLS playlist...');
      const playlist = await getHLSPlaylist(playlistUrl);
      const segments = parsePlaylist(playlist);
      
      if (segments.length === 0) {
        throw new Error('No segments found in playlist');
      }

      segmentsRef.current = segments;
      setStreamingMetrics(prev => ({ ...prev, totalSegments: segments.length }));
      
      setIsStreaming(true);
      setConnectionStatus('connected');
      setHasStatsToShow(true);
      streamingRef.current = true;

      console.log(`📺 Starting manual HLS streaming: ${segments.length} segments`);

      // Start manual segment downloading in background
      downloadSegmentsSequentially(segments);

      // Also setup video player for actual playback
      if (videoRef.current) {
        const video = videoRef.current;
        
        // Check if the browser supports HLS natively (mainly Safari)
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = playlistUrl;
          await video.play();
        } else if (Hls.isSupported()) {
          // Use hls.js for browsers that don't support HLS natively
          const hls = new Hls({
            enableWorker: false,
            debug: false, // Reduce console noise
          });
          
          hlsRef.current = hls;
          
          hls.loadSource(playlistUrl);
          hls.attachMedia(video);
          
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('HLS manifest parsed, starting playback');
            video.play().catch(console.error);
          });

          hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('HLS error:', data);
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.log('Network error - attempting to recover');
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.log('Media error - attempting to recover');
                  hls.recoverMediaError();
                  break;
                default:
                  console.log('Fatal error - destroying HLS instance');
                  setConnectionStatus('error');
                  hls.destroy();
                  break;
              }
            }
          });
        }
      }

    } catch (error) {
      console.error('Failed to start stream:', error);
      setConnectionStatus('error');
      setIsStreaming(false);
      streamingRef.current = false;
    }
  };

  // Download segments sequentially (same pattern as OptimisticACKAttacker)
  const downloadSegmentsSequentially = async (segments: string[]) => {
    console.log(`🔄 Starting sequential segment downloads: ${segments.length} segments`);
    
    for (let i = 0; i < segments.length; i++) {
      if (!streamingRef.current) {
        console.log('🛑 Streaming stopped by user');
        break;
      }
      
      const segment = segments[i];
      const segmentUrl = `http://localhost:3001/stream/${streamId}/${segment}`;
      
      try {
        await downloadStreamSegment(segmentUrl, i);
        
        // Simulate streaming delay (segments are typically for ~10 seconds of video)
        // Small delay between segments to simulate real streaming
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.warn(`⚠️ Failed to download segment ${segment}:`, error);
        // Continue with next segment
      }
    }
    
    if (streamingRef.current) {
      console.log('✅ All segments downloaded successfully');
      setStreamComplete(true);
      setIsStreaming(false);
      streamingRef.current = false;
    }
  };

  const handleStopStream = () => {
    console.log('🛑 Stopping stream...');
    
    setIsStreaming(false);
    setConnectionStatus('idle');
    streamingRef.current = false;
    
    // Clean up HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
    }
  };

  const handleClearStats = () => {
    setStreamingMetrics({
      segmentCount: 0,
      totalSegments: 0,
      totalBytes: 0,
      currentSpeed: 0,
      averageSpeed: 0,
      streamStartTime: 0,
      lastSegmentTime: 0,
      segmentSpeeds: []
    });
    setStreamComplete(false);
    setHasStatsToShow(false);
    setStreamUrl('');
    console.log('🧹 Streaming stats cleared');
  };

  const testStreamEndpoint = async () => {
    try {
      const response = await fetch(`http://localhost:3001/stream/${streamId}/playlist.m3u8`);
      const text = await response.text();
      console.log('Playlist response:', text);
      alert(`Playlist response:\n${text}`);
    } catch (error) {
      console.error('Failed to test endpoint:', error);
      alert('Failed to connect to streaming endpoint');
    }
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      streamingRef.current = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
      }
    };
  }, []);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-600 bg-green-100';
      case 'connecting': return 'text-yellow-600 bg-yellow-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Connection Error';
      default: return 'Idle';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Live Streaming</h3>
        <div className="flex items-center space-x-2">
          <div className={`text-xs font-medium px-2 py-1 rounded ${getStatusColor()}`}>
            {getStatusText()}
          </div>
          {hasStatsToShow && (
            <button
              onClick={handleClearStats}
              className="text-xs text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Stream Configuration */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Stream ID
          </label>
          <input
            type="text"
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter stream ID"
            disabled={isStreaming}
          />
        </div>

        {/* Streaming Stats */}
        {hasStatsToShow && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">HLS Streaming Progress</span>
                {streamComplete && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-medium">
                    ✓ COMPLETE
                  </span>
                )}
                {isStreaming && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded font-medium">
                    <span className="animate-pulse">●</span> STREAMING
                  </span>
                )}
              </div>
              <span className="text-sm text-gray-900">
                {streamingMetrics.segmentCount}/{streamingMetrics.totalSegments} segments
              </span>
            </div>
            
            {streamingMetrics.totalSegments > 0 && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${
                    streamComplete ? 'bg-green-600' : 'bg-purple-600'
                  }`}
                  style={{ 
                    width: `${(streamingMetrics.segmentCount / streamingMetrics.totalSegments) * 100}%` 
                  }}
                ></div>
              </div>
            )}
            
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                Total: {formatBytes(streamingMetrics.totalBytes)}
                {streamComplete && <span className="text-green-600 ml-1">(Final)</span>}
              </span>
              <span>
                {streamingMetrics.totalSegments > 0 && 
                  `${((streamingMetrics.segmentCount / streamingMetrics.totalSegments) * 100).toFixed(1)}% Complete`
                }
              </span>
            </div>
          </div>
        )}

        {/* Streaming Speed */}
        {hasStatsToShow && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-purple-900">Streaming Speed</div>
                <div className="text-xs text-purple-700">
                  HLS Segment Downloads
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-purple-900">
                  {formatSpeed(streamingMetrics.currentSpeed)}
                </div>
                <div className="text-xs text-purple-700">
                  Avg: {formatSpeed(streamingMetrics.averageSpeed)}
                </div>
              </div>
            </div>
            
            {streamingMetrics.segmentSpeeds.length > 0 && (
              <div className="mt-2 pt-2 border-t border-purple-200">
                <div className="text-xs text-purple-700">
                  Recent segments: {streamingMetrics.segmentSpeeds.slice(-3).map(speed => formatSpeed(speed)).join(', ')}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Video Player */}
        <div className="bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-48 object-contain"
            controls
            muted
            playsInline
          >
            Your browser does not support the video tag.
          </video>
        </div>

        {/* Control Buttons */}
        <div className="flex space-x-2">
          {!isStreaming ? (
            <button
              onClick={handleStartStream}
              disabled={!isServerRunning || (!Hls.isSupported() && !videoRef.current?.canPlayType('application/vnd.apple.mpegurl'))}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md transition-colors duration-200"
            >
              Start Stream
            </button>
          ) : (
            <button
              onClick={handleStopStream}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition-colors duration-200"
            >
              Stop Stream
            </button>
          )}
          
          <button
            onClick={testStreamEndpoint}
            disabled={!isServerRunning}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-md transition-colors duration-200"
          >
            Test Endpoint
          </button>
        </div>

        {/* Stream Info */}
        <div className="text-sm text-gray-600 space-y-1">
          <p><strong>Protocol:</strong> HLS (HTTP Live Streaming)</p>
          <p><strong>Method:</strong> Sequential segment downloads (same as OptimisticACKAttacker)</p>
          <p><strong>Library:</strong> hls.js v{Hls.version || 'Unknown'}</p>
          <p><strong>Server Status:</strong> 
            <span className={isServerRunning ? 'text-green-600' : 'text-red-600'}>
              {isServerRunning ? ' Running' : ' Stopped'}
            </span>
          </p>
        </div>

        {/* Completion message */}
        {streamComplete && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <p className="text-sm text-green-800">
              ✅ <strong>Streaming Complete!</strong> All {streamingMetrics.totalSegments} segments downloaded. 
              Total: {formatBytes(streamingMetrics.totalBytes)} at average {formatSpeed(streamingMetrics.averageSpeed)}.
            </p>
          </div>
        )}

        {/* Quick Actions */}
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Quick Test URLs:</h4>
          <div className="space-y-1 text-xs">
            <a 
              href={`http://localhost:3001/stream/sample-stream/playlist.m3u8`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-blue-600 hover:text-blue-800 hover:underline"
            >
              Sample Stream Playlist
            </a>
            <a 
              href={`http://localhost:3001/stream/sample-stream/segment000.ts`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-blue-600 hover:text-blue-800 hover:underline"
            >
              Sample Stream Segment
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveStreamingPanel;