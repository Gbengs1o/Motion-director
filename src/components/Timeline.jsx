import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Repeat } from 'lucide-react';
import { useStore } from '../store';

const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

const Timeline = () => {
    const { timeline, setTimelineState } = useStore();
    const [dragging, setDragging] = useState(false);
    const [isLooping, setIsLooping] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);

    // Helper to send commands
    const sendCmd = (cmd, payload = {}) => {
        window.dispatchEvent(new CustomEvent('app:timeline-command', {
            detail: { command: cmd, ...payload }
        }));
    };

    const togglePlay = () => {
        if (timeline.isPlaying) {
            sendCmd('timeline:pause');
            setTimelineState({ isPlaying: false });
        } else {
            sendCmd('timeline:play');
            setTimelineState({ isPlaying: true });
        }
    };

    const toggleLoop = () => {
        const newVal = !isLooping;
        setIsLooping(newVal);
        sendCmd('timeline:loop', { value: newVal });
    };

    const toggleSpeed = () => {
        const speeds = [0.5, 1, 2];
        const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
        const newSpeed = speeds[nextIdx];
        setPlaybackSpeed(newSpeed);
        sendCmd('timeline:speed', { value: newSpeed });
    }

    const handleSeek = (e) => {
        const time = parseFloat(e.target.value);
        setTimelineState({ currentTime: time }); // Optimistic update
        sendCmd('timeline:seek', { time });
    };

    const handleInput = (e) => {
        // While dragging, just update local UI, actual seek on MouseUp if heavy?
        // For now, seek immediately
        setDragging(true);
        handleSeek(e);
    };

    return (
        <div className="flex flex-col h-full bg-zinc-900 border-t border-zinc-700 select-none">
            {/* Controls Bar */}
            <div className="h-10 flex items-center px-4 gap-4 bg-zinc-800 border-b border-zinc-700">
                <button onClick={togglePlay} className="text-white hover:text-blue-400">
                    {timeline.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button onClick={() => sendCmd('timeline:seek', { time: 0 })} className="text-zinc-400 hover:text-white">
                    <SkipBack className="w-4 h-4" />
                </button>

                {/* Time Display */}
                <div className="font-mono text-xs text-blue-400 min-w-[100px] text-center bg-black/20 rounded px-2 py-1">
                    {formatTime(timeline.currentTime)} / {formatTime(timeline.duration)}
                </div>

                <div className="flex-1"></div>

                {/* Speed Toggle */}
                <button onClick={toggleSpeed} className="text-zinc-400 hover:text-white text-xs font-bold w-8">
                    {playbackSpeed}x
                </button>

                <button onClick={toggleLoop} className={`text-zinc-400 hover:text-white ${isLooping ? 'text-blue-400' : ''}`} title="Loop">
                    <Repeat className={`w-4 h-4 ${isLooping ? 'text-blue-400' : ''}`} />
                </button>
            </div>

            {/* Scrubber Area */}
            <div className="flex-1 relative bg-zinc-900 flex items-center px-4">
                <input
                    type="range"
                    min="0"
                    max={timeline.duration || 10}
                    step="0.01"
                    value={timeline.currentTime}
                    onInput={handleInput}
                    onMouseUp={() => setDragging(false)}
                    className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
                />
            </div>
        </div>
    );
};

export default Timeline;
