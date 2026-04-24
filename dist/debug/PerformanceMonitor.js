import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Performance Monitor - Phase 12
 * Real-time performance monitoring and diagnostics
 */
import { useState, useEffect, useMemo } from 'react';
export const PerformanceMonitor = ({ enabled = true, showGraph = true, updateInterval = 500, warningThresholds = {
    fps: 30,
    frameTime: 33,
    drawCalls: 1000,
    memoryMB: 512,
}, onPerformanceWarning, }) => {
    const [stats, setStats] = useState({
        fps: 60,
        frameTime: 16.67,
        drawCalls: 0,
        triangles: 0,
        points: 0,
        memory: {
            geometries: 0,
            textures: 0,
            total: 0,
        },
    });
    const [history, setHistory] = useState([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [lastWarning, setLastWarning] = useState(null);
    // Simulate stats collection (in real implementation, this would hook into Three.js renderer)
    useEffect(() => {
        if (!enabled)
            return;
        const interval = setInterval(() => {
            // In a real implementation, you'd get these from the renderer
            const newStats = {
                fps: Math.round(1000 / (Math.random() * 10 + 10)),
                frameTime: Math.random() * 10 + 10,
                drawCalls: Math.floor(Math.random() * 500) + 100,
                triangles: Math.floor(Math.random() * 100000) + 10000,
                points: Math.floor(Math.random() * 1000),
                memory: {
                    geometries: Math.floor(Math.random() * 100) + 10,
                    textures: Math.floor(Math.random() * 50) + 5,
                    total: Math.floor(Math.random() * 200) + 50,
                },
            };
            setStats(newStats);
            setHistory(prev => [...prev.slice(-59), newStats.fps]);
            // Check for warnings
            if (newStats.fps < warningThresholds.fps) {
                const warningMsg = `Low FPS: ${newStats.fps}`;
                if (lastWarning !== warningMsg) {
                    setLastWarning(warningMsg);
                    onPerformanceWarning?.(newStats);
                }
            }
            else if (newStats.frameTime > warningThresholds.frameTime) {
                const warningMsg = `High frame time: ${newStats.frameTime.toFixed(2)}ms`;
                if (lastWarning !== warningMsg) {
                    setLastWarning(warningMsg);
                    onPerformanceWarning?.(newStats);
                }
            }
            else if (newStats.drawCalls > warningThresholds.drawCalls) {
                const warningMsg = `High draw calls: ${newStats.drawCalls}`;
                if (lastWarning !== warningMsg) {
                    setLastWarning(warningMsg);
                    onPerformanceWarning?.(newStats);
                }
            }
            else {
                setLastWarning(null);
            }
        }, updateInterval);
        return () => clearInterval(interval);
    }, [enabled, updateInterval, warningThresholds, onPerformanceWarning, lastWarning]);
    const getStatusColor = useMemo(() => {
        if (stats.fps >= 60)
            return '#4caf50';
        if (stats.fps >= 30)
            return '#ff9800';
        return '#f44336';
    }, [stats.fps]);
    const getMemoryStatus = useMemo(() => {
        if (stats.memory.total < 256)
            return '#4caf50';
        if (stats.memory.total < 512)
            return '#ff9800';
        return '#f44336';
    }, [stats.memory.total]);
    const formatNumber = (num) => {
        if (num >= 1000000)
            return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000)
            return `${(num / 1000).toFixed(1)}K`;
        return num.toString();
    };
    if (!enabled)
        return null;
    return (_jsxs("div", { style: {
            position: 'absolute',
            top: 10,
            left: 10,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            borderRadius: '8px',
            padding: '12px',
            color: 'white',
            fontFamily: 'monospace',
            fontSize: '11px',
            zIndex: 1000,
            minWidth: '200px',
            transition: 'all 0.3s ease',
        }, children: [_jsxs("div", { onClick: () => setIsExpanded(!isExpanded), style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    marginBottom: '8px',
                }, children: [_jsx("div", { style: { fontWeight: 'bold', fontSize: '12px' }, children: "\uD83D\uDCCA Performance" }), _jsx("div", { style: {
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: getStatusColor,
                            animation: stats.fps < 30 ? 'pulse 1s infinite' : 'none',
                        } })] }), _jsxs("div", { style: { marginBottom: '8px' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }, children: [_jsx("span", { style: { color: '#aaa' }, children: "FPS:" }), _jsx("span", { style: {
                                    color: getStatusColor,
                                    fontWeight: 'bold',
                                    fontSize: '14px',
                                }, children: stats.fps })] }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }, children: [_jsx("span", { style: { color: '#aaa' }, children: "Frame Time:" }), _jsxs("span", { style: { color: stats.frameTime > 33 ? '#f44336' : '#aaa' }, children: [stats.frameTime.toFixed(2), "ms"] })] }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }, children: [_jsx("span", { style: { color: '#aaa' }, children: "Draw Calls:" }), _jsx("span", { style: { color: stats.drawCalls > 1000 ? '#ff9800' : '#aaa' }, children: formatNumber(stats.drawCalls) })] }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }, children: [_jsx("span", { style: { color: '#aaa' }, children: "Triangles:" }), _jsx("span", { style: { color: '#aaa' }, children: formatNumber(stats.triangles) })] }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between' }, children: [_jsx("span", { style: { color: '#aaa' }, children: "Memory:" }), _jsxs("span", { style: { color: getMemoryStatus }, children: [stats.memory.total, "MB"] })] })] }), lastWarning && (_jsxs("div", { style: {
                    backgroundColor: 'rgba(244, 67, 54, 0.2)',
                    border: '1px solid #f44336',
                    borderRadius: '4px',
                    padding: '6px',
                    marginBottom: '8px',
                    color: '#ff8a80',
                    fontSize: '10px',
                }, children: ["\u26A0\uFE0F ", lastWarning] })), isExpanded && (_jsxs(_Fragment, { children: [_jsx("div", { style: { borderTop: '1px solid #444', margin: '8px 0' } }), _jsxs("div", { style: { marginBottom: '8px' }, children: [_jsx("div", { style: { fontWeight: 'bold', marginBottom: '4px', fontSize: '10px' }, children: "Memory Breakdown" }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }, children: [_jsx("span", { style: { color: '#aaa' }, children: "Geometries:" }), _jsx("span", { children: stats.memory.geometries })] }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between' }, children: [_jsx("span", { style: { color: '#aaa' }, children: "Textures:" }), _jsx("span", { children: stats.memory.textures })] })] }), showGraph && history.length > 0 && (_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 'bold', marginBottom: '4px', fontSize: '10px' }, children: "FPS History (60 frames)" }), _jsx("div", { style: {
                                    display: 'flex',
                                    alignItems: 'flex-end',
                                    height: '60px',
                                    gap: '1px',
                                    background: 'rgba(0, 0, 0, 0.5)',
                                    padding: '4px',
                                    borderRadius: '4px',
                                }, children: history.map((fps, idx) => (_jsx("div", { style: {
                                        flex: 1,
                                        height: `${(fps / 60) * 100}%`,
                                        background: fps >= 60 ? '#4caf50' : fps >= 30 ? '#ff9800' : '#f44336',
                                        borderRadius: '1px 1px 0 0',
                                        minHeight: '2px',
                                    } }, idx))) }), _jsxs("div", { style: {
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginTop: '4px',
                                    fontSize: '9px',
                                    color: '#666',
                                }, children: [_jsx("span", { children: "Older" }), _jsx("span", { children: "Newer" })] })] })), stats.fps < 30 && (_jsxs("div", { style: {
                            marginTop: '8px',
                            padding: '6px',
                            backgroundColor: 'rgba(255, 152, 0, 0.1)',
                            border: '1px solid #ff9800',
                            borderRadius: '4px',
                            fontSize: '9px',
                            color: '#ffcc80',
                        }, children: [_jsx("strong", { children: "\uD83D\uDCA1 Tips:" }), _jsxs("ul", { style: { margin: '4px 0 0 0', paddingLeft: '16px' }, children: [_jsx("li", { children: "Reduce draw calls with batching" }), _jsx("li", { children: "Use instancing for repeated objects" }), _jsx("li", { children: "Implement LOD for distant objects" }), _jsx("li", { children: "Optimize texture sizes" })] })] }))] })), _jsx("style", { children: `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      ` })] }));
};
export default PerformanceMonitor;
//# sourceMappingURL=PerformanceMonitor.js.map