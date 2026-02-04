/**
 * Performance monitoring utilities for tracking component render times and resource usage
 */

interface PerformanceMetrics {
  componentName: string;
  renderTime: number;
  timestamp: number;
  memory?: {
    used: number;
    total: number;
    limit: number;
  };
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics = 100;

  /**
   * Start measuring performance for a component
   */
  start(componentName: string): () => void {
    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();

    return () => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      const endMemory = this.getMemoryUsage();

      const metric: PerformanceMetrics = {
        componentName,
        renderTime,
        timestamp: Date.now(),
        memory: endMemory
          ? {
              used: endMemory.usedJSHeapSize / 1024 / 1024, // MB
              total: endMemory.totalJSHeapSize / 1024 / 1024,
              limit: endMemory.jsHeapSizeLimit / 1024 / 1024,
            }
          : undefined,
      };

      this.addMetric(metric);

      // Log slow renders (> 16ms = below 60fps)
      if (renderTime > 16) {
        console.warn(
          `[Performance] ${componentName} took ${renderTime.toFixed(2)}ms`,
          endMemory
            ? `Memory: ${(endMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`
            : ''
        );
      }
    };
  }

  /**
   * Measure async operation performance
   */
  async measureAsync<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const end = this.start(name);
    try {
      return await fn();
    } finally {
      end();
    }
  }

  /**
   * Get memory usage if available
   */
  private getMemoryUsage(): {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  } | null {
    if (
      typeof window !== 'undefined' &&
      'performance' in window &&
      'memory' in (window.performance as any)
    ) {
      return (window.performance as any).memory;
    }
    return null;
  }

  /**
   * Add metric to history
   */
  private addMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  /**
   * Get all metrics
   */
  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Get metrics for a specific component
   */
  getComponentMetrics(componentName: string): PerformanceMetrics[] {
    return this.metrics.filter((m) => m.componentName === componentName);
  }

  /**
   * Get average render time for a component
   */
  getAverageRenderTime(componentName: string): number {
    const metrics = this.getComponentMetrics(componentName);
    if (metrics.length === 0) return 0;
    const total = metrics.reduce((sum, m) => sum + m.renderTime, 0);
    return total / metrics.length;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Log performance summary
   */
  logSummary(): void {
    const componentNames = Array.from(
      new Set(this.metrics.map((m) => m.componentName))
    );

    console.group('📊 Performance Summary');
    componentNames.forEach((name) => {
      const avg = this.getAverageRenderTime(name);
      const metrics = this.getComponentMetrics(name);
      const max = Math.max(...metrics.map((m) => m.renderTime));
      const min = Math.min(...metrics.map((m) => m.renderTime));

      console.log(
        `${name}: avg ${avg.toFixed(2)}ms, min ${min.toFixed(2)}ms, max ${max.toFixed(2)}ms (${metrics.length} samples)`
      );
    });

    const memory = this.getMemoryUsage();
    if (memory) {
      console.log(
        `Memory: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB / ${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`
      );
    }
    console.groupEnd();
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Global access for debugging
if (typeof window !== 'undefined') {
  (window as any).__perfMonitor = performanceMonitor;
}

/**
 * React hook for measuring component render performance
 */
import { useEffect, useRef } from 'react';

export function usePerformanceMonitor(componentName: string) {
  const renderCount = useRef(0);

  useEffect(() => {
    renderCount.current++;
    const end = performanceMonitor.start(
      `${componentName} (render #${renderCount.current})`
    );
    return end;
  });
}
