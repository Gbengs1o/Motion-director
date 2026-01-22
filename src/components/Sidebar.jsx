import React, { useEffect } from 'react';
import { Film, Settings, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useStore } from '../store';

const SidebarItem = ({ icon: Icon, label, active, onClick, onDelete }) => (
    <div
        className={`w-full flex items-center justify-between p-2 mb-1 rounded text-sm transition-colors group ${active
            ? 'bg-blue-600 text-white'
            : 'text-gray-400 hover:text-white hover:bg-zinc-800'
            }`}
    >
        <button onClick={onClick} className="flex items-center flex-1 min-w-0 text-left">
            <Icon className="w-4 h-4 mr-2 flex-shrink-0" />
            <span className="truncate">{label}</span>
        </button>
        {onDelete && (
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete scene "${label}"?`)) onDelete();
                }}
                className={`p-1 rounded hover:bg-zinc-700/50 hover:text-red-400 transition-opacity ${active ? 'opacity-100 text-white hover:text-red-300' : 'opacity-0 group-hover:opacity-100'}`}
            >
                <Trash2 className="w-3 h-3" />
            </button>
        )}
    </div>
);

const Sidebar = () => {
    const { scenes, fetchScenes, selectedScene, selectScene, createScene, deleteScene } = useStore();

    useEffect(() => {
        fetchScenes();
        // Poll for changes every few seconds (simple "watch" alternative for now)
        const interval = setInterval(fetchScenes, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleCreate = () => {
        const name = prompt("Enter scene name (e.g., my-scene):");
        if (name) createScene(name);
    };

    return (
        <div className="w-64 bg-zinc-900 border-r border-zinc-700 flex flex-col p-2">

            {/* HEADER */}
            <div className="flex items-center justify-between mb-4 px-2 mt-2">
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Scenes
                </div>
                <div className="flex gap-1">
                    <button onClick={fetchScenes} className="p-1 hover:bg-zinc-800 rounded text-zinc-400">
                        <RefreshCw className="w-3 h-3" />
                    </button>
                    <button onClick={handleCreate} className="p-1 hover:bg-zinc-800 rounded text-blue-400">
                        <Plus className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* SCENE LIST */}
            <div className="flex-1 overflow-y-auto min-h-0">
                {scenes.length === 0 && (
                    <div className="text-center text-zinc-600 text-xs mt-4">No scenes found</div>
                )}
                {scenes.map((scene) => (
                    <SidebarItem
                        key={scene}
                        icon={Film}
                        label={scene.replace('.html', '')}
                        active={selectedScene === scene}
                        onClick={() => selectScene(scene)}
                        onDelete={() => deleteScene(scene)}
                    />
                ))}
            </div>

            {/* BOTTOM ACTIONS */}
            <div className="mt-auto border-t border-zinc-800 pt-2">
                <SidebarItem icon={Settings} label="Project Settings" />
            </div>
        </div>
    );
};

export default Sidebar;
