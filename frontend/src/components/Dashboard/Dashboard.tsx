import { useState, useEffect } from 'react';
import MetricsPanel from './MetricsPanel';
import FileDownloadPanel from './FileDownloadPanel';
import LiveStreamingPanel from './LiveStreamingPanel';
import { useWebSocket } from '../../hooks/useWebSocket';
import type { ServerMetrics } from '../../types/monitoring';

const Dashboard = () => {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [isServerRunning, setIsServerRunning] = useState(false);
  const { socket, isConnected } = useWebSocket('http://localhost:3001');

  useEffect(() => {
    if (socket && isConnected) {
      console.log('Setting up socket event listeners');
      
      const handleMetricsUpdate = (data: ServerMetrics) => {
        console.log('Received metrics update:', data);
        setMetrics(data);
      };

      const handleServerStatus = (status: boolean) => {
        console.log('Received server status:', status);
        setIsServerRunning(status);
      };

      // Subscribe to events
      socket.on('metrics-update', handleMetricsUpdate);
      socket.on('server-status', handleServerStatus);

      // Request initial data
      socket.emit('request-metrics');
      socket.emit('request-server-status');

      // Cleanup function
      return () => {
        socket.off('metrics-update', handleMetricsUpdate);
        socket.off('server-status', handleServerStatus);
      };
    }
  }, [socket, isConnected]);

  const handleStartServer = async () => {
    try {
      if (socket) {
        socket.emit('start-server');
      } else {
        // Fallback to HTTP API
        const response = await fetch('http://localhost:3001/api/server/start', { method: 'POST' });
        if (response.ok) {
          setIsServerRunning(true);
        }
      }
    } catch (error) {
      console.error('Failed to start server:', error);
    }
  };

  const handleStopServer = async () => {
    try {
      if (socket) {
        socket.emit('stop-server');
      } else {
        // Fallback to HTTP API
        const response = await fetch('http://localhost:3001/api/server/stop', { method: 'POST' });
        if (response.ok) {
          setIsServerRunning(false);
        }
      }
    } catch (error) {
      console.error('Failed to stop server:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Streaming Server
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                onClick={isServerRunning ? handleStopServer : handleStartServer}
                className={`px-4 py-2 rounded-md font-medium transition-colors duration-200 ${
                  isServerRunning 
                    ? 'bg-red-600 hover:bg-red-700 text-white' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {isServerRunning ? 'Stop Server' : 'Start Server'}
              </button>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${
                  isConnected ? 'bg-green-400' : 'bg-red-400'
                }`}></div>
                <span className={`text-sm font-medium ${
                  isConnected ? 'text-green-700' : 'text-red-700'
                }`}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-8">
            <MetricsPanel metrics={metrics} />
          </div>
          <div className="space-y-8">
            {/* <NetworkMonitoringPanel isServerRunning={isServerRunning} /> */}
            <FileDownloadPanel isServerRunning={isServerRunning} />
            <LiveStreamingPanel isServerRunning={isServerRunning} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;