import React, { useState, useRef } from 'react';
// Webpack warning fix: Group alias for PanelGroup, Separator for PanelResizeHandle
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { PanelLeft, PanelBottom } from 'lucide-react';
import Terminal from './components/Terminal';
import Sidebar from './components/Sidebar';
import Preview from './components/Preview';
import Timeline from './components/Timeline';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 bg-red-900 text-white">
                    <h1>Something went wrong.</h1>
                    <pre>{this.state.error?.toString()}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}

function App() {
    const [activeTab, setActiveTab] = useState('timeline');
    const sidebarRef = useRef(null);
    const bottomPanelRef = useRef(null);

    const toggleSidebar = () => {
        const panel = sidebarRef.current;
        if (panel) {
            // Check if collapsed by size or imperative API? 
            // The API doesn't give sync state easily, but we can try expand/collapse toggle logic if we track state
            // Or just check resizing. simpler approach:
            // If size is near 0 -> expand, else collapse.
            // Actually react-resizable-panels imperative handle has .getCollapsed() not always reliable? 
            // Better: use onCollapse prop to track state?
            // Simple toggle: If we store local state 'isSidebarCollapsed', update it via onCollapse/onExpand
        }
    };

    // Easier way with react-resizable-panels 1.0+: ref.current.collapse() / expand()
    // We need to know current state to toggle.
    // Let's use internal state tracking.
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [bottomCollapsed, setBottomCollapsed] = useState(false);

    const handleSidebarToggle = () => {
        const panel = sidebarRef.current;
        if (panel) {
            if (sidebarCollapsed) panel.expand();
            else panel.collapse();
        }
    };

    const handleBottomToggle = () => {
        const panel = bottomPanelRef.current;
        if (panel) {
            if (bottomCollapsed) panel.expand();
            else panel.collapse();
        }
    };

    return (
        <div className="flex h-screen flex-col bg-zinc-900 text-white">
            {/* Top Bar */}
            <div className="h-8 bg-zinc-800 flex items-center px-4 text-xs select-none border-b border-zinc-700 font-medium tracking-wide justify-between">
                <div className="flex items-center gap-4">
                    <span className="text-blue-400 font-bold">Motion Director Standalone (Updated)</span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSidebarToggle}
                        className={`p-1 hover:bg-zinc-700 rounded transition-colors flex items-center gap-1 ${sidebarCollapsed ? 'text-zinc-500' : 'text-zinc-200'}`}
                        title="Toggle Sidebar"
                    >
                        <PanelLeft className="w-4 h-4" />
                        <span className="hidden sm:inline">Sidebar</span>
                    </button>
                    <button
                        onClick={handleBottomToggle}
                        className={`p-1 hover:bg-zinc-700 rounded transition-colors flex items-center gap-1 ${bottomCollapsed ? 'text-zinc-500' : 'text-zinc-200'}`}
                        title="Toggle Bottom Panel"
                    >
                        <PanelBottom className="w-4 h-4" />
                        <span className="hidden sm:inline">Panel</span>
                    </button>
                </div>
            </div>

            <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
                {/* Sidebar Panel */}
                <Panel
                    ref={sidebarRef}
                    defaultSize={20}
                    minSize={15}
                    maxSize={40}
                    collapsible={true}
                    onCollapse={() => setSidebarCollapsed(true)}
                    onExpand={() => setSidebarCollapsed(false)}
                    className={`flex flex-col transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'duration-0' : ''}`}
                >
                    <ErrorBoundary>
                        <Sidebar />
                    </ErrorBoundary>
                </Panel>

                <PanelResizeHandle className={`w-1 bg-zinc-800 hover:bg-zinc-600 transition-colors cursor-col-resize ${sidebarCollapsed ? 'hidden' : ''}`} />

                {/* Main Content (Preview + Bottom Panel) */}
                <Panel>
                    <PanelGroup direction="vertical">
                        <Panel defaultSize={70} minSize={30}>
                            <ErrorBoundary>
                                <Preview />
                            </ErrorBoundary>
                        </Panel>

                        <PanelResizeHandle className={`h-1 bg-zinc-800 hover:bg-zinc-600 transition-colors cursor-row-resize ${bottomCollapsed ? 'hidden' : ''}`} />

                        <Panel
                            ref={bottomPanelRef}
                            defaultSize={30}
                            minSize={10}
                            collapsible={true}
                            onCollapse={() => setBottomCollapsed(true)}
                            onExpand={() => setBottomCollapsed(false)}
                            className="flex flex-col bg-black"
                        >
                            {/* Panel Header / Tabs */}
                            <div className="flex h-8 bg-zinc-800 border-b border-zinc-700">
                                <button
                                    onClick={() => setActiveTab('timeline')}
                                    className={`px-4 text-xs font-semibold uppercase tracking-wider flex items-center border-b-2 transition-colors ${activeTab === 'timeline' ? 'border-blue-500 text-white bg-zinc-700/50' : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/30'
                                        }`}
                                >
                                    Timeline
                                </button>
                                <button
                                    onClick={() => setActiveTab('terminal')}
                                    className={`px-4 text-xs font-semibold uppercase tracking-wider flex items-center border-b-2 transition-colors ${activeTab === 'terminal' ? 'border-blue-500 text-white bg-zinc-700/50' : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/30'
                                        }`}
                                >
                                    Terminal
                                </button>
                            </div>

                            {/* Panel Content */}
                            <div className="flex-1 overflow-hidden relative bg-zinc-900">
                                <div className={`h-full w-full ${activeTab === 'timeline' ? 'block' : 'hidden'}`}>
                                    <ErrorBoundary>
                                        <Timeline />
                                    </ErrorBoundary>
                                </div>
                                <div className={`h-full w-full ${activeTab === 'terminal' ? 'block' : 'hidden'}`}>
                                    <ErrorBoundary>
                                        <Terminal />
                                    </ErrorBoundary>
                                </div>
                            </div>
                        </Panel>
                    </PanelGroup>
                </Panel>
            </PanelGroup>
        </div>
    );
}

export default App;
