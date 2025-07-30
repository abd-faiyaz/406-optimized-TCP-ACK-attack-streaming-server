import { useMemo } from 'react';

interface ChartData {
  name: string;
  value: number;
  color: string;
}

interface RealTimeChartProps {
  data: ChartData[];
  type: 'line' | 'bar';
}

function RealTimeChart({ data, type }: RealTimeChartProps) {
  const maxValue = useMemo(() => {
    return Math.max(...data.map(d => d.value));
  }, [data]);

  const formatValue = (value: number, name: string) => {
    if (name === 'Sent' || name === 'Received') {
      // Format bytes
      if (value >= 1024 * 1024 * 1024) {
        return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
      } else if (value >= 1024 * 1024) {
        return `${(value / (1024 * 1024)).toFixed(1)} MB`;
      } else if (value >= 1024) {
        return `${(value / 1024).toFixed(1)} KB`;
      }
      return `${value} B`;
    }
    return `${value.toFixed(1)}%`;
  };

  if (type === 'bar') {
    return (
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.name} className="flex items-center justify-between">
            <div className="flex items-center space-x-3 flex-1">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: item.color }}
              ></div>
              <span className="text-sm font-medium text-gray-700">{item.name}</span>
            </div>
            <div className="flex items-center space-x-3 flex-1">
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: item.color,
                    width: `${maxValue > 0 ? (item.value / maxValue) * 100 : 0}%`
                  }}
                ></div>
              </div>
              <span className="text-sm text-gray-600 min-w-[60px] text-right">
                {formatValue(item.value, item.name)}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Line chart representation (simplified as progress bars for now)
  return (
    <div className="space-y-4">
      {data.map((item) => (
        <div key={item.name} className="space-y-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: item.color }}
              ></div>
              <span className="text-sm font-medium text-gray-700">{item.name}</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">
              {formatValue(item.value, item.name)}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-500 ease-out"
              style={{
                backgroundColor: item.color,
                width: `${Math.min(item.value, 100)}%`
              }}
            ></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default RealTimeChart;