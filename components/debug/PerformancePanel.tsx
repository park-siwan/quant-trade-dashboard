'use client';

import { useEffect, useState } from 'react';
import { performanceMonitor } from '@/lib/performance-monitor';

export default function PerformancePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [memoryInfo, setMemoryInfo] = useState<{
    used: number;
    total: number;
    limit: number;
  } | null>(null);

  useEffect(() => {
    // Update metrics every 2 seconds when panel is open
    if (!isOpen) return;

    const interval = setInterval(() => {
      const allMetrics = performanceMonitor.getMetrics();
      setMetrics(allMetrics.slice(-20)); // Last 20 metrics

      // Get current memory usage
      if (typeof window !== 'undefined' && 'performance' in window && 'memory' in (window.performance as any)) {
        const memory = (window.performance as any).memory;
        setMemoryInfo({
          used: memory.usedJSHeapSize / 1024 / 1024,
          total: memory.totalJSHeapSize / 1024 / 1024,
          limit: memory.jsHeapSizeLimit / 1024 / 1024,
        });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen]);

  // Get component statistics
  const componentStats = metrics.reduce((acc, m) => {
    if (!acc[m.componentName]) {
      acc[m.componentName] = {
        count: 0,
        totalTime: 0,
        maxTime: 0,
        minTime: Infinity,
      };
    }
    acc[m.componentName].count++;
    acc[m.componentName].totalTime += m.renderTime;
    acc[m.componentName].maxTime = Math.max(acc[m.componentName].maxTime, m.renderTime);
    acc[m.componentName].minTime = Math.min(acc[m.componentName].minTime, m.renderTime);
    return acc;
  }, {} as Record<string, { count: number; totalTime: number; maxTime: number; minTime: number }>);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-gray-800 text-white px-3 py-2 rounded-lg shadow-lg hover:bg-gray-700 transition-colors z-50 text-xs font-mono"
        title="Open Performance Monitor"
      >
        📊 Perf
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white rounded-lg shadow-2xl z-50 w-96 max-h-[600px] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <h3 className="font-semibold text-sm">Performance Monitor</h3>
        <div className="flex gap-2">
          <button
            onClick={() => {
              performanceMonitor.clear();
              setMetrics([]);
            }}
            className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-800"
          >
            Clear
          </button>
          <button
            onClick={() => performanceMonitor.logSummary()}
            className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-800"
          >
            Log
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 p-3 space-y-3">
        {/* Memory Info */}
        {memoryInfo && (
          <div className="bg-gray-800 rounded p-2">
            <div className="text-xs font-semibold mb-1">Memory Usage</div>
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-400">Used:</span>
                <span className={memoryInfo.used > memoryInfo.limit * 0.8 ? 'text-red-400' : 'text-green-400'}>
                  {memoryInfo.used.toFixed(0)} MB
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Total:</span>
                <span>{memoryInfo.total.toFixed(0)} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Limit:</span>
                <span>{memoryInfo.limit.toFixed(0)} MB</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
                <div
                  className={`h-2 rounded-full transition-all ${
                    memoryInfo.used / memoryInfo.limit > 0.8
                      ? 'bg-red-500'
                      : memoryInfo.used / memoryInfo.limit > 0.6
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                  }`}
                  style={{ width: `${(memoryInfo.used / memoryInfo.limit) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Component Stats */}
        <div className="bg-gray-800 rounded p-2">
          <div className="text-xs font-semibold mb-2">Component Stats</div>
          <div className="space-y-1 text-xs">
            {Object.entries(componentStats)
              .sort((a, b) => b[1].totalTime - a[1].totalTime)
              .map(([name, stats]) => (
                <div key={name} className="border-b border-gray-700 last:border-0 pb-1 mb-1">
                  <div className="font-mono text-blue-400">{name}</div>
                  <div className="grid grid-cols-2 gap-1 text-gray-400">
                    <span>Avg: {(stats.totalTime / stats.count).toFixed(1)}ms</span>
                    <span>Count: {stats.count}</span>
                    <span>Max: {stats.maxTime.toFixed(1)}ms</span>
                    <span>Min: {stats.minTime.toFixed(1)}ms</span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Recent Metrics */}
        <div className="bg-gray-800 rounded p-2">
          <div className="text-xs font-semibold mb-2">Recent Renders (Last 20)</div>
          <div className="space-y-1 text-xs font-mono">
            {metrics.slice().reverse().map((m, idx) => (
              <div
                key={idx}
                className={`flex justify-between ${
                  m.renderTime > 100
                    ? 'text-red-400'
                    : m.renderTime > 16
                    ? 'text-yellow-400'
                    : 'text-green-400'
                }`}
              >
                <span className="truncate flex-1">{m.componentName}</span>
                <span className="ml-2">{m.renderTime.toFixed(1)}ms</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-2 border-t border-gray-700 text-xs text-gray-400 text-center">
        Press Ctrl+Shift+P to toggle
      </div>
    </div>
  );
}
