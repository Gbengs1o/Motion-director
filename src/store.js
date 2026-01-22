import { create } from 'zustand';

const API_URL = 'http://localhost:3000';

export const useStore = create((set, get) => ({
    projectPath: '',
    scenes: [],
    selectedScene: null,
    isLoading: false,

    // Actions
    setProjectPath: (path) => set({ projectPath: path }),

    fetchScenes: async () => {
        try {
            set({ isLoading: true });
            const res = await fetch(`${API_URL}/api/scenes`);
            const data = await res.json();
            set({ scenes: data.scenes || [] });
        } catch (err) {
            console.error('Failed to fetch scenes:', err);
        } finally {
            set({ isLoading: false });
        }
    },

    selectScene: (sceneName) => set({ selectedScene: sceneName }),

    createScene: async (name) => {
        try {
            await fetch(`${API_URL}/api/scenes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            get().fetchScenes(); // Refresh list
        } catch (err) {
            console.error(err);
        }
    },

    deleteScene: async (name) => {
        try {
            await fetch(`${API_URL}/api/scenes/${name}`, {
                method: 'DELETE'
            });
            // If the deleted scene was selected, deselect it
            if (get().selectedScene === name) {
                set({ selectedScene: null });
            }
            get().fetchScenes();
        } catch (err) {
            console.error(err);
        }
    },

    // Timeline State
    timeline: {
        isConnected: false,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
    },

    // Timeline Actions
    setTimelineState: (newState) => set((state) => ({ timeline: { ...state.timeline, ...newState } })),
}));
