import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';

const Preview = () => {
    const { selectedScene, setTimelineState } = useStore();
    const iframeRef = useRef(null);

    // 1. Listen for messages FROM the iframe
    useEffect(() => {
        const handleMessage = (event) => {
            const cmd = event.data;
            if (!cmd || !cmd.command) return;

            switch (cmd.command) {
                case 'timeline:ready':
                    setTimelineState({
                        isConnected: true,
                        duration: cmd.duration,
                        currentTime: 0,
                        isPlaying: false
                    });
                    break;
                case 'timeline:progress':
                    setTimelineState({
                        currentTime: cmd.time,
                        // If we are getting progress, we are likely playing
                        // But let's trust the state implicit
                    });
                    break;
                case 'timeline:complete':
                    setTimelineState({ isPlaying: false, currentTime: 0 });
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [setTimelineState]);

    // 2. Listen for commands TO the iframe (from Timeline UI)
    useEffect(() => {
        const handleCommand = (e) => {
            if (iframeRef.current && iframeRef.current.contentWindow) {
                iframeRef.current.contentWindow.postMessage(e.detail, '*');
            }
        };

        window.addEventListener('app:timeline-command', handleCommand);
        return () => window.removeEventListener('app:timeline-command', handleCommand);
    }, []);

    if (!selectedScene) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 bg-neutral-900">
                <div className="text-2xl font-light mb-2 text-zinc-600">No Scene Selected</div>
                <p className="text-sm opacity-50">Select a scene from the sidebar to start editing</p>
            </div>
        );
    }

    const sceneUrl = `http://localhost:3000/scene/${selectedScene}`;

    return (
        <div className="w-full h-full bg-black flex flex-col">
            {/* Toolbar (Placeholder) */}
            <div className="h-8 bg-zinc-800 border-b border-zinc-700 flex items-center px-4 justify-between">
                <span className="text-xs text-zinc-400">{selectedScene}</span>
                <div className="flex gap-2">
                    <span className="text-xs text-zinc-600">1920x1080</span>
                </div>
            </div>

            {/* IFrame Container */}
            <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-zinc-900">
                {/* Aspect Ratio Container (16:9) */}
                <div className="aspect-video w-full max-h-full shadow-2xl bg-black">
                    <iframe
                        ref={iframeRef}
                        src={sceneUrl}
                        className="w-full h-full border-0"
                        title="Scene Preview"
                        allow="autoplay"
                    />
                </div>
            </div>
        </div>
    );
};

export default Preview;
