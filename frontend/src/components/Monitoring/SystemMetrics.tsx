import type { ServerMetrics } from '../../types/monitoring';

interface SystemMetricsProps {
  metrics: ServerMetrics;
}

function SystemMetrics({ metrics }: SystemMetricsProps) {
  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    } else if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    return `${bytes} B`;
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const getStatusColor = (percentage: number) => {
    if (percentage >= 80) return 'text-red-600 bg-red-100';
    if (percentage >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* CPU Metrics */}
      <div className="metric-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">CPU Usage</p>
            <p className="text-2xl font-bold text-gray-900">{metrics.cpu.usage.toFixed(1)}%</p>
          </div>
          <div className={`status-indicator ${getStatusColor(metrics.cpu.usage)}`}>
            {metrics.cpu.usage >= 80 ? 'High' : metrics.cpu.usage >= 60 ? 'Medium' : 'Low'}
          </div>
        </div>
        <div className="mt-2">
          <p className="text-xs text-gray-500">
            Temperature: {metrics.cpu.temperature}°C
          </p>
        </div>
      </div>

      {/* Memory Metrics */}
      <div className="metric-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Memory Usage</p>
            <p className="text-2xl font-bold text-gray-900">{metrics.memory.percentage.toFixed(1)}%</p>
          </div>
          <div className={`status-indicator ${getStatusColor(metrics.memory.percentage)}`}>
            {metrics.memory.percentage >= 80 ? 'High' : metrics.memory.percentage >= 60 ? 'Medium' : 'Low'}
          </div>
        </div>
        <div className="mt-2">
          <p className="text-xs text-gray-500">
            {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
          </p>
        </div>
      </div>

      {/* Network Metrics */}
      <div className="metric-card">
        <div>
          <p className="text-sm font-medium text-gray-600">Network Activity</p>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Sent:</span>
              <span className="text-xs font-medium">{formatBytes(metrics.network.bytesSent)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Received:</span>
              <span className="text-xs font-medium">{formatBytes(metrics.network.bytesReceived)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Packets:</span>
              <span className="text-xs font-medium">
                {metrics.network.packetsSent + metrics.network.packetsReceived}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Disk Metrics */}
      <div className="metric-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Disk Usage</p>
            <p className="text-2xl font-bold text-gray-900">{metrics.disk.percentage.toFixed(1)}%</p>
          </div>
          <div className={`status-indicator ${getStatusColor(metrics.disk.percentage)}`}>
            {metrics.disk.percentage >= 80 ? 'High' : metrics.disk.percentage >= 60 ? 'Medium' : 'Low'}
          </div>
        </div>
        <div className="mt-2">
          {/* <p className="text-xs text-gray-500">
            {formatBytes(metrics.disk.free)} free of {formatBytes(metrics.disk.total)}
          </p> */}
          <p className="text-xs text-gray-500 mt-1">
            Uptime: {formatUptime(metrics.uptime)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default SystemMetrics;