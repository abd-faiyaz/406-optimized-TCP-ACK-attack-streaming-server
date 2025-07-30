import type { ServerMetrics } from '../../types/monitoring';
import RealTimeChart from '../Monitoring/RealTimeChart';
import SystemMetrics from '../Monitoring/SystemMetrics';

interface MetricsPanelProps {
  metrics: ServerMetrics | null;
}

function MetricsPanel({ metrics }: MetricsPanelProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">System Metrics</h2>
        <p className="text-sm text-gray-500 mt-1">Real-time server performance monitoring</p>
      </div>
      
      <div className="p-6">
        {metrics ? (
          <div className="space-y-6">
            <SystemMetrics metrics={metrics} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">CPU & Memory Usage</h3>
                <RealTimeChart 
                  data={[
                    { name: 'CPU', value: metrics.cpu.usage, color: '#3b82f6' },
                    { name: 'Memory', value: metrics.memory.percentage, color: '#10b981' }
                  ]}
                  type="line"
                />
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Network Traffic</h3>
                <RealTimeChart 
                  data={[
                    { name: 'Sent', value: metrics.network.bytesSent, color: '#f59e0b' },
                    { name: 'Received', value: metrics.network.bytesReceived, color: '#ef4444' }
                  ]}
                  type="bar"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-48">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading metrics...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MetricsPanel;