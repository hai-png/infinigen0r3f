/**
 * Performance Monitor - Phase 12
 * Real-time performance monitoring and diagnostics
 */
import React from 'react';
interface FrameStats {
    fps: number;
    frameTime: number;
    drawCalls: number;
    triangles: number;
    points: number;
    memory: {
        geometries: number;
        textures: number;
        total: number;
    };
}
interface PerformanceMonitorProps {
    enabled?: boolean;
    showGraph?: boolean;
    updateInterval?: number;
    warningThresholds?: {
        fps: number;
        frameTime: number;
        drawCalls: number;
        memoryMB: number;
    };
    onPerformanceWarning?: (stats: FrameStats) => void;
}
export declare const PerformanceMonitor: React.FC<PerformanceMonitorProps>;
export default PerformanceMonitor;
//# sourceMappingURL=PerformanceMonitor.d.ts.map