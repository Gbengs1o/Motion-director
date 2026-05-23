const { ipcRenderer } = require('electron');

// --- UI Elements ---
const welcomeScreen = document.getElementById('welcome-screen');
const mainInterface = document.getElementById('main-interface');
const btnOpenWork = document.getElementById('btn-open-work');
const btnCreateWork = document.getElementById('btn-create-work');
const btnOpenSceneFolder = document.getElementById('btn-open-scene-folder');
const btnRefreshPreview = document.getElementById('btn-refresh-preview');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnFit = document.getElementById('btn-fit');
const btnPan = document.getElementById('btn-pan');
const btnFullscreen = document.getElementById('btn-fullscreen');
const previewContainer = document.getElementById('preview-container');
const previewFrame = document.getElementById('preview-frame');

// Debug: Log button elements to check if they exist
console.log('Button elements found:', {
    btnZoomIn: !!btnZoomIn,
    btnZoomOut: !!btnZoomOut,
    btnFit: !!btnFit,
    btnPan: !!btnPan,
    btnFullscreen: !!btnFullscreen,
    previewContainer: !!previewContainer
});

// --- State ---
let currentWorkPath = null;
let allSceneFiles = [];

// --- Navigation Logic ---

function showMainInterface() {
    welcomeScreen.classList.add('hidden');
    welcomeScreen.classList.remove('flex');

    mainInterface.classList.remove('hidden');
    mainInterface.classList.add('flex');
}

async function refreshSceneList() {
    if (!currentWorkPath) return;
    const sceneListEl = document.getElementById('scene-list');

    console.log("Refreshing scenes for:", currentWorkPath);
    const scenes = await ipcRenderer.invoke('list-scenes', currentWorkPath);
    allSceneFiles = scenes.filter(scene => scene.endsWith('.html'));

    sceneListEl.innerHTML = '';
    allSceneFiles.forEach(scene => {
        const currentScene = scene; // Capture in closure
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between px-2 py-1.5 rounded hover:bg-zinc-800 text-zinc-300 text-sm cursor-pointer group';

        div.innerHTML = `
            <div class="flex items-center gap-2 truncate flex-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-500 group-hover:text-blue-400"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
                <span class="truncate">${currentScene.replace('.html', '')}</span>
            </div>
            <button class="delete-btn opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-zinc-500 transition-all rounded" title="Delete Scene">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        `;

        // Click on Name -> Open Scene
        const nameEl = div.querySelector('div');
        nameEl.addEventListener('click', () => {
            activeSceneName = currentScene.replace('.html', ''); // Set Active Scene
            const previewFrame = document.getElementById('preview-frame');
            // Use preview server instead of file:// for proper cross-origin access
            previewFrame.src = `http://localhost:3000/scene/${currentScene}`;

            // Visual feedback for selection
            document.querySelectorAll('#scene-list > div').forEach(el => el.classList.remove('bg-zinc-800', 'border-l-2', 'border-blue-500'));
            div.classList.add('bg-zinc-800', 'border-l-2', 'border-blue-500');
        });

        // Click on Delete -> Remove Scene
        const deleteBtn = div.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Delete scene "${currentScene}" and its assets logic?`)) { // Simple confirm for now
                const sceneName = currentScene.replace('.html', '');
                const result = await ipcRenderer.invoke('delete-scene', { workPath: currentWorkPath, sceneName });
                if (result.success) {
                    refreshSceneList();
                } else {
                    alert('Failed to delete scene: ' + result.error);
                }
            }
        });

        sceneListEl.appendChild(div);
    });
}

// Set the project root on the preview server
async function setProjectRoot(path) {
    try {
        const response = await fetch('http://localhost:3000/api/set-project-root', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        const data = await response.json();
        console.log('Project root set on server:', data);
        return data.success;
    } catch (e) {
        console.error('Failed to set project root:', e);
        return false;
    }
}

btnOpenWork.addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('open-work-dialog');
    if (!result.canceled && result.filePaths.length > 0) {
        currentWorkPath = result.filePaths[0];
        console.log("Selected work folder:", currentWorkPath);

        // Inform the preview server about the project root
        await setProjectRoot(currentWorkPath);

        showMainInterface();
        refreshSceneList();
    }
});

btnCreateWork.addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('create-work-dialog');
    if (!result.canceled && result.filePaths.length > 0) {
        currentWorkPath = result.filePaths[0];
        console.log("Creating work in:", currentWorkPath);

        // Inform the preview server about the project root
        await setProjectRoot(currentWorkPath);
        showMainInterface();
        refreshSceneList(); // New folder defaults empty
    }
});

// --- New Scene Logic ---
const modal = document.getElementById('new-scene-modal');
const inputName = document.getElementById('input-scene-name');
const btnNewScene = document.getElementById('btn-new-scene');
const btnCancelScene = document.getElementById('btn-cancel-scene');
const btnConfirmScene = document.getElementById('btn-create-scene-confirm');

if (btnNewScene) {
    btnNewScene.addEventListener('click', () => {
        modal.classList.remove('hidden');
        inputName.value = '';
        inputName.focus();
    });

    btnCancelScene.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    btnConfirmScene.addEventListener('click', async () => {
        const name = inputName.value.trim();
        if (!name) return; // Validation

        const result = await ipcRenderer.invoke('create-scene', { workPath: currentWorkPath, sceneName: name });
        if (result.success) {
            modal.classList.add('hidden');
            refreshSceneList();
        } else {
            alert('Error creating scene: ' + result.error);
        }
    });
}

// --- Asset Management Logic ---
let activeSceneName = null; // Track currently selected/playing scene
const assetsModal = document.getElementById('assets-modal');
const btnAssets = document.getElementById('btn-assets');
const btnCloseAssets = document.getElementById('btn-close-assets');
const btnOpenAssetFolder = document.getElementById('btn-open-asset-folder');
const dropZone = document.getElementById('asset-list'); // This is the actual ID in the HTML
const assetsModalTitle = document.getElementById('assets-modal-title');
const btnAddAssets = document.getElementById('btn-add-assets');
const btnRefreshAssets = document.getElementById('btn-refresh-assets');

// --- Sidebar Logic ---
const sidebar = document.getElementById('sidebar');
const btnCollapseSidebar = document.getElementById('btn-collapse-sidebar');
const btnExpandSidebar = document.getElementById('btn-expand-sidebar');

btnCollapseSidebar?.addEventListener('click', () => {
    sidebar.classList.add('w-0', 'border-none');
    sidebar.classList.remove('w-[280px]', 'border-r');
    btnExpandSidebar.classList.remove('hidden');
});

btnExpandSidebar?.addEventListener('click', () => {
    sidebar.classList.remove('w-0', 'border-none');
    sidebar.classList.add('w-[280px]', 'border-r');
    btnExpandSidebar.classList.add('hidden');
});

// --- Timeline Minimize Logic ---
const timelinePanel = document.getElementById('timeline-panel');
const btnToggleTimeline = document.getElementById('btn-toggle-timeline');
let timelineMinimized = false;

if (btnToggleTimeline && timelinePanel) {
    btnToggleTimeline.addEventListener('click', () => {
        console.log('Timeline toggle clicked, was minimized:', timelineMinimized);
        timelineMinimized = !timelineMinimized;

        if (timelineMinimized) {
            timelinePanel.classList.remove('h-[180px]');
            timelinePanel.classList.add('h-10');
            // Hide all children except the controls bar
            Array.from(timelinePanel.children).forEach((child, i) => {
                if (i > 0) child.classList.add('hidden');
            });
            // Rotate icon to point down
            btnToggleTimeline.querySelector('svg').style.transform = 'rotate(180deg)';
        } else {
            timelinePanel.classList.remove('h-10');
            timelinePanel.classList.add('h-[180px]');
            // Show all children
            Array.from(timelinePanel.children).forEach(child => {
                child.classList.remove('hidden');
            });
            // Reset icon rotation
            btnToggleTimeline.querySelector('svg').style.transform = 'rotate(0deg)';
        }
        console.log('Timeline now minimized:', timelineMinimized);
    });
} else {
    console.error('Timeline toggle elements not found:', { timelinePanel: !!timelinePanel, btnToggleTimeline: !!btnToggleTimeline });
}

btnAssets.addEventListener('click', async () => {
    if (!activeSceneName) {
        alert("Please select or start a scene first.");
        return;
    }
    assetsModal.classList.remove('hidden');
    assetsModalTitle.textContent = `Assets for ${activeSceneName}`;
    loadAssets();
});

btnCloseAssets.addEventListener('click', () => {
    assetsModal.classList.add('hidden');
});

btnOpenAssetFolder.addEventListener('click', async () => {
    if (activeSceneName) {
        await ipcRenderer.invoke('open-asset-folder', `${currentWorkPath}\\assets\\${activeSceneName}`);
    } else {
        alert("Please select a scene first.");
    }
});

btnOpenSceneFolder.addEventListener('click', async () => {
    if (activeSceneName) {
        await ipcRenderer.invoke('open-asset-folder', `${currentWorkPath}\\assets\\${activeSceneName}`);
    } else if (currentWorkPath) {
        await ipcRenderer.invoke('open-asset-folder', `${currentWorkPath}\\scenes`);
    } else {
        alert("Please open a work folder first.");
    }
});

btnRefreshPreview.addEventListener('click', () => {
    if (previewFrame.src && previewFrame.src !== 'about:blank') {
        const currentSrc = previewFrame.src;
        previewFrame.src = 'about:blank';
        setTimeout(() => previewFrame.src = currentSrc, 50);
    }
});

btnAddAssets?.addEventListener('click', async () => {
    if (!activeSceneName) return;
    const result = await ipcRenderer.invoke('open-file-dialog');
    if (!result.canceled && result.filePaths.length > 0) {
        await uploadFiles(result.filePaths);
    }
});

btnRefreshAssets?.addEventListener('click', loadAssets);

// --- Drag & Drop ---
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-blue-500', 'bg-zinc-900');
    dropZone.classList.remove('border-zinc-800', 'bg-zinc-950');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-blue-500', 'bg-zinc-900');
    dropZone.classList.add('border-zinc-800', 'bg-zinc-950');
});

dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-blue-500', 'bg-zinc-900');
    dropZone.classList.add('border-zinc-800', 'bg-zinc-950');

    if (e.dataTransfer.files.length > 0 && activeSceneName) {
        const filePaths = Array.from(e.dataTransfer.files).map(f => f.path);
        await uploadFiles(filePaths);
    }
});

async function uploadFiles(filePaths) {
    dropZone.innerHTML = '<div class="text-blue-400 text-xs col-span-3 text-center py-10">Uploading...</div>';
    const result = await ipcRenderer.invoke('upload-assets', {
        workPath: currentWorkPath,
        sceneName: activeSceneName,
        filePaths
    });

    if (result.success) {
        loadAssets();
    } else {
        alert("Upload failed.");
        loadAssets(); // Restore list
    }
}

async function loadAssets() {
    dropZone.innerHTML = '<div class="text-zinc-600 text-xs col-span-3 text-center py-10 mt-10">Loading...</div>';

    const assets = await ipcRenderer.invoke('list-assets', { workPath: currentWorkPath, sceneName: activeSceneName });

    dropZone.innerHTML = '';

    if (assets.length === 0) {
        dropZone.innerHTML = `
            <div id="empty-state" class="text-zinc-600 text-xs col-span-3 text-center py-10 pointer-events-none flex flex-col items-center justify-center">
                <span class="text-2xl mb-2 opacity-50">📂</span>
                <p>Drag & Drop files here</p>
                <p class="opacity-50 mt-1">or use the "Add Files" button</p>
            </div>`;
        return;
    }

    assets.forEach(file => {
        const div = document.createElement('div');
        div.className = 'bg-zinc-900 border border-zinc-800 rounded p-2 flex flex-col items-center gap-2 hover:bg-zinc-800 transition-colors cursor-pointer group relative overflow-hidden h-24 text-xs';

        const ext = file.split('.').pop().toLowerCase();
        let preview = '<div class="text-2xl">📄</div>';

        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
            preview = `<img src="file://${currentWorkPath}/assets/${activeSceneName}/${file}" class="w-full h-12 object-contain">`;
        } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
            preview = '<div class="text-2xl text-purple-400">🎵</div>';
        } else if (['mp4', 'webm'].includes(ext)) {
            preview = '<div class="text-2xl text-blue-400">🎬</div>';
        }

        div.innerHTML = `
            ${preview}
            <span class="truncate w-full text-center text-[10px] text-zinc-400 mt-auto">${file}</span>
        `;
        dropZone.appendChild(div);
    });
}


// --- Timeline and Playback Logic (postMessage-based) ---
const playBtn = document.getElementById('play-btn');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');
const timelineScrubber = document.getElementById('timeline-scrubber');
const timelineProgress = document.getElementById('timeline-progress');
const timelineHandle = document.getElementById('timeline-handle');
const btnSpeed = document.getElementById('btn-playback-speed');
const speedText = document.getElementById('speed-text');
const btnLoop = document.getElementById('btn-loop');
const fullscreenControls = document.getElementById('fullscreen-controls');
const fullscreenPlayBtn = document.getElementById('fullscreen-play-btn');
const fullscreenTimeCurrent = document.getElementById('fullscreen-time-current');
const fullscreenTimeTotal = document.getElementById('fullscreen-time-total');
const fullscreenTimelineScrubber = document.getElementById('fullscreen-timeline-scrubber');
const fullscreenTimelineProgress = document.getElementById('fullscreen-timeline-progress');
const fullscreenTimelineHandle = document.getElementById('fullscreen-timeline-handle');
const fullscreenExitBtn = document.getElementById('fullscreen-exit-btn');

let isPlaying = false;
let isLooping = false;
let sceneDuration = 0;
let currentTime = 0;
let currentSpeedIndex = 2; // Default to 1x (index 2 in [0.25, 0.5, 1, 1.5, 2])
const speeds = [0.25, 0.5, 1, 1.5, 2];
const playIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const pauseIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;

// Format seconds to MM:SS
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updatePlaybackButtons() {
    const icon = isPlaying ? pauseIconSvg : playIconSvg;
    if (playBtn) playBtn.innerHTML = icon;
    if (fullscreenPlayBtn) fullscreenPlayBtn.innerHTML = icon;
}

function updateTimelineDisplays(time) {
    const safeDuration = sceneDuration || 0;
    const safeTime = safeDuration ? Math.max(0, Math.min(Number(time) || 0, safeDuration)) : 0;
    const progress = safeDuration ? (safeTime / safeDuration) * 100 : 0;

    currentTime = safeTime;

    if (timelineProgress) timelineProgress.style.width = `${progress}%`;
    if (timelineHandle) timelineHandle.style.left = `${progress}%`;
    if (timeCurrent) timeCurrent.textContent = formatTime(safeTime);

    if (fullscreenTimelineProgress) fullscreenTimelineProgress.style.width = `${progress}%`;
    if (fullscreenTimelineHandle) fullscreenTimelineHandle.style.left = `${progress}%`;
    if (fullscreenTimeCurrent) fullscreenTimeCurrent.textContent = formatTime(safeTime);
}

function resetTimelineDisplays() {
    updateTimelineDisplays(0);
    if (timeTotal) timeTotal.textContent = formatTime(sceneDuration);
    if (fullscreenTimeTotal) fullscreenTimeTotal.textContent = formatTime(sceneDuration);
}

// Update timeline UI based on received time
function updateTimelineUI(time) {
    if (sceneDuration === 0) return;

    updateTimelineDisplays(time);

    // If playing and timeline reached the end
    if (isPlaying && time >= sceneDuration - 0.05) {
        if (isLooping) {
            sendToScene('seek', { time: 0 });
            sendToScene('play');
            // Also reset audio in joint mode
            if (isJointMode && audioPlayer) {
                seekAudio(0);
            }
        } else {
            isPlaying = false;
            updatePlaybackButtons();
            // Also pause audio in joint mode
            if (isJointMode && audioPlayer && isAudioPlaying) {
                pauseAudio();
            }
        }
    }
}

// Send command to iframe via postMessage
function sendToScene(command, data = {}) {
    if (previewFrame && previewFrame.contentWindow) {
        previewFrame.contentWindow.postMessage({ type: command, ...data }, '*');
        console.log('Sent to scene:', command, data);
    }
}

// Listen for messages from the iframe
window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || !data.type) return;

    switch (data.type) {
        case 'scene-ready':
            console.log('Scene ready received:', data);
            sceneDuration = data.duration || 0;
            resetTimelineDisplays();
            isPlaying = false;
            updatePlaybackButtons();
            // Reset speed on new scene
            currentSpeedIndex = 2; // 1x
            if (speedText) speedText.textContent = '1x';
            sendToScene('speed', { value: 1 });
            // Also reset audio rate
            if (audioPlayer) audioPlayer.rate(1);
            break;

        case 'time-update':
            updateTimelineUI(data.currentTime);
            syncAudioWithScene(data.currentTime || 0, data.isPlaying !== undefined ? Boolean(data.isPlaying) : isPlaying);
            // Sync play state if provided (but don't override loop auto-stop)
            if (data.isPlaying !== undefined) {
                if (data.isPlaying !== isPlaying && currentTime < sceneDuration - 0.1) {
                    isPlaying = data.isPlaying;
                    updatePlaybackButtons();
                }
            }
            break;
    }
});

// Speed Button Handler
if (btnSpeed) {
    btnSpeed.addEventListener('click', () => {
        currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
        const newSpeed = speeds[currentSpeedIndex];
        if (speedText) speedText.textContent = newSpeed + 'x';
        sendToScene('speed', { value: newSpeed });

        // Also adjust audio playback rate in joint mode
        if (audioPlayer) {
            audioPlayer.rate(newSpeed);
        }
    });
}

// Loop Button Handler
if (btnLoop) {
    btnLoop.addEventListener('click', () => {
        isLooping = !isLooping;
        if (isLooping) {
            btnLoop.classList.add('text-blue-500');
            btnLoop.classList.remove('text-zinc-600');
        } else {
            btnLoop.classList.remove('text-blue-500');
            btnLoop.classList.add('text-zinc-600');
        }
    });
}

// Play button handler
function toggleScenePlayback() {
    console.log('Play toggled, isPlaying:', isPlaying);
    if (isPlaying) {
        sendToScene('pause');
        isPlaying = false;
        updatePlaybackButtons();
        if (isJointMode && audioPlayer) {
            pauseAudio();
        }
        return;
    }

    sendToScene('play');
    // If at end, restart
    if (currentTime >= sceneDuration - 0.1) {
        sendToScene('seek', { time: 0 });
        if (isJointMode && audioPlayer) {
            seekAudio(0);
        }
    }
    isPlaying = true;
    updatePlaybackButtons();
    if (isJointMode && audioPlayer) {
        playAudio();
    }
}

if (playBtn) {
    playBtn.addEventListener('click', toggleScenePlayback);
}

if (fullscreenPlayBtn) {
    fullscreenPlayBtn.addEventListener('click', toggleScenePlayback);
}

// Scrubber click/drag for seeking
let isScrubbingTimeline = false;
let activeTimelineScrubber = null;

function seekSceneFromScrubber(scrubber, e) {
    if (!scrubber || sceneDuration === 0) return;

    const rect = scrubber.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, x / rect.width));
    const seekTime = progress * sceneDuration;

    sendToScene('seek', { time: seekTime });
    updateTimelineUI(seekTime);
    if (isJointMode && audioPlayer) {
        seekAudio(seekTime);
    }

    if (isPlaying) {
        isPlaying = false;
        updatePlaybackButtons();
        if (isJointMode && audioPlayer) {
            pauseAudio();
        }
    }
}

function attachTimelineScrubber(scrubber) {
    if (!scrubber) return;
    scrubber.addEventListener('mousedown', (e) => {
        isScrubbingTimeline = true;
        activeTimelineScrubber = scrubber;
        seekSceneFromScrubber(scrubber, e);
    });
}

attachTimelineScrubber(timelineScrubber);
attachTimelineScrubber(fullscreenTimelineScrubber);

window.addEventListener('mousemove', (e) => {
    if (isScrubbingTimeline) {
        seekSceneFromScrubber(activeTimelineScrubber, e);
    }
});

window.addEventListener('mouseup', () => {
    isScrubbingTimeline = false;
    activeTimelineScrubber = null;
});

// Reset UI when iframe loads
previewFrame.addEventListener('load', () => {
    console.log('Preview iframe loaded, waiting for scene-ready message...');
    // The scene will send scene-ready message when its timeline is ready
});

// --- Preview Controls (Zoom/Pan/Fit) ---
let zoomLevel = 1;
let panOffset = { x: 0, y: 0 };
let isPanning = false;
let startPan = { x: 0, y: 0 };
const previewOverlay = document.getElementById('preview-overlay');

function updateTransform() {
    // Apply transform to the container, not the iframe (iframe is 100% of container)
    previewContainer.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`;
    previewContainer.style.transformOrigin = 'center center';
}

// Mouse Wheel Zoom/Pan (on Overlay)
// Note: Overlay needs pointer-events: auto to capture this.
previewOverlay.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        // Zoom
        e.preventDefault();
        const delta = e.deltaY * -0.001;
        zoomLevel = Math.min(Math.max(0.1, zoomLevel + delta), 10);
        updateTransform();
    } else {
        // Pan
        e.preventDefault();
        panOffset.x -= e.deltaX;
        panOffset.y -= e.deltaY;
        updateTransform();
    }
});

// Buttons - with explicit logging
if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
        console.log('Zoom In clicked, current:', zoomLevel);
        zoomLevel = Math.min(10, zoomLevel + 0.1);
        updateTransform();
        console.log('Zoom In new level:', zoomLevel);
    });
} else {
    console.error('btnZoomIn not found!');
}

if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
        console.log('Zoom Out clicked, current:', zoomLevel);
        zoomLevel = Math.max(0.1, zoomLevel - 0.1);
        updateTransform();
        console.log('Zoom Out new level:', zoomLevel);
    });
} else {
    console.error('btnZoomOut not found!');
}

if (btnFit) {
    btnFit.addEventListener('click', () => {
        console.log('Fit clicked');
        zoomLevel = 1;
        panOffset = { x: 0, y: 0 };
        updateTransform();
    });
} else {
    console.error('btnFit not found!');
}

// Fullscreen
if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
        console.log('Fullscreen clicked');
        if (!document.fullscreenElement) {
            previewContainer.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    });
} else {
    console.error('btnFullscreen not found!');
}

function updateFullscreenControlsVisibility() {
    const isPreviewFullscreen = document.fullscreenElement === previewContainer;
    if (fullscreenControls) {
        fullscreenControls.classList.toggle('hidden', !isPreviewFullscreen);
    }
}

if (fullscreenExitBtn) {
    fullscreenExitBtn.addEventListener('click', () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
    });
}

document.addEventListener('fullscreenchange', updateFullscreenControlsVisibility);

// Manual Panning (Drag)
let isDragPanning = false;

function updateOverlayInteractivity() {
    // Enable overlay if Pan Tool is active OR Ctrl is held (for zoom)
    if (isDragPanning) {
        previewOverlay.style.pointerEvents = 'auto';
        previewOverlay.style.cursor = 'grab';
    } else {
        previewOverlay.style.pointerEvents = 'none';
        previewOverlay.style.cursor = 'default';
    }
}

// Global Key Listener for Ctrl to enable Zoom on hover
window.addEventListener('keydown', (e) => {
    if (e.key === 'Control') {
        previewOverlay.style.pointerEvents = 'auto';
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'Control' && !isDragPanning) {
        previewOverlay.style.pointerEvents = 'none';
    }
});


if (btnPan) {
    btnPan.addEventListener('click', () => {
        console.log('Pan clicked, was:', isDragPanning);
        isDragPanning = !isDragPanning;

        // Enhanced visual indication when Pan is active
        if (isDragPanning) {
            btnPan.classList.add('text-blue-400', 'bg-blue-600/20', 'ring-2', 'ring-blue-500', 'border-blue-500');
            btnPan.classList.remove('bg-zinc-800', 'border-zinc-700');
        } else {
            btnPan.classList.remove('text-blue-400', 'bg-blue-600/20', 'ring-2', 'ring-blue-500', 'border-blue-500');
            btnPan.classList.add('bg-zinc-800', 'border-zinc-700');
        }

        updateOverlayInteractivity();
        console.log('Pan now:', isDragPanning);
    });
} else {
    console.error('btnPan not found!');
}

previewOverlay.addEventListener('mousedown', (e) => {
    // Pan Drag
    if (e.button === 0 || e.button === 1) {
        e.preventDefault();
        isPanning = true;
        startPan = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
        previewOverlay.style.cursor = 'grabbing';
    }
});

window.addEventListener('mousemove', (e) => {
    if (isPanning) {
        panOffset.x = e.clientX - startPan.x;
        panOffset.y = e.clientY - startPan.y;
        updateTransform();
    }
});

window.addEventListener('mouseup', () => {
    if (isPanning) {
        isPanning = false;
        if (isDragPanning) previewOverlay.style.cursor = 'grab';
    }
});

// --- Terminal Window Logic ---
const terminalWindow = document.getElementById('terminal-window');
const terminalHeader = document.getElementById('terminal-header');
const terminalResizer = document.getElementById('terminal-resizer');
const btnTerminalToolbar = document.getElementById('btn-terminal-toolbar');
const btnTerminalClose = document.getElementById('btn-terminal-close');
const btnTerminalMinimize = document.getElementById('btn-terminal-minimize');

const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');
const { WebLinksAddon } = require('xterm-addon-web-links');

// --- Visual Shell UI Elements ---
const btnTabTerminal = document.getElementById('btn-tab-terminal');
const btnTabChat = document.getElementById('btn-tab-chat');
const viewTerminal = document.getElementById('view-terminal');
const viewChat = document.getElementById('view-chat');
const chatMessages = document.getElementById('chat-messages');
const chatTextarea = document.getElementById('chat-textarea');
const btnChatSend = document.getElementById('btn-chat-send');
const btnKeyUp = document.getElementById('btn-key-up');
const btnKeyDown = document.getElementById('btn-key-down');
const btnKeyEsc = document.getElementById('btn-key-esc');
const btnKeyCtrlC = document.getElementById('btn-key-ctrlc');

// --- Visual Shell State ---
let term = null;
let fitAddon = null;
let isTerminalOpen = false;
let activeTab = 'terminal';
let currentCommandBlock = null; // The DOM element for the active command's output
let terminalFlushTimer = null;
let pendingOutput = '';

// --- Supercharged ANSI Parser ---
// Converts ANSI escape codes to HTML with Tailwind classes
class AnsiParser {
    constructor() {
        this.colors = {
            30: 'text-zinc-500', 31: 'text-red-400', 32: 'text-green-400', 33: 'text-yellow-400',
            34: 'text-blue-400', 35: 'text-purple-400', 36: 'text-cyan-400', 37: 'text-zinc-200',
            90: 'text-zinc-400', 91: 'text-red-300', 92: 'text-green-300', 93: 'text-yellow-300',
            94: 'text-blue-300', 95: 'text-purple-300', 96: 'text-cyan-300', 97: 'text-white'
        };
        this.styles = { 1: 'font-bold', 2: 'opacity-75', 4: 'underline' };
    }

    parse(str) {
        if (!str) return '';

        let html = '';
        let currentIndex = 0;
        let activeClasses = [];

        // Regex to match ANSI escape sequences (CSI)
        // Matches \x1b[ ... m
        const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
        let match;

        while ((match = ansiRegex.exec(str)) !== null) {
            // Text before the code
            const text = str.substring(currentIndex, match.index);
            if (text) {
                html += `<span class="${activeClasses.join(' ')}">${this.escapeHtml(text)}</span>`;
            }

            // Process the code
            const sequence = match[0];
            if (sequence.endsWith('m')) {
                // SGR (Select Graphic Rendezvous) code
                const codes = sequence.slice(2, -1).split(';');
                for (let code of codes) {
                    const c = parseInt(code) || 0;
                    if (c === 0) {
                        activeClasses = []; // Reset
                    } else if (this.colors[c]) {
                        // Remove existing color classes
                        activeClasses = activeClasses.filter(cls => !cls.startsWith('text-'));
                        activeClasses.push(this.colors[c]);
                    } else if (this.styles[c]) {
                        activeClasses.push(this.styles[c]);
                    } else if (c === 39) {
                        activeClasses = activeClasses.filter(cls => !cls.startsWith('text-')); // Default text color
                    }
                }
            }

            currentIndex = match.index + match[0].length;
        }

        // Remaining text
        const remaining = str.substring(currentIndex);
        if (remaining) {
            html += `<span class="${activeClasses.join(' ')}">${this.escapeHtml(remaining)}</span>`;
        }

        return html;
    }

    escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

const parser = new AnsiParser();

function initTerminal() {
    if (term) return;

    term = new Terminal({
        cursorBlink: true,
        fontFamily: '"Cascadia Code", Menlo, monospace',
        fontSize: 12,
        theme: {
            background: '#000000',
            foreground: '#f0f0f0',
        }
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(document.getElementById('terminal-container'));

    // Data flow
    term.onData(data => {
        ipcRenderer.send('terminal-input', data);
    });

    ipcRenderer.on('terminal-incoming', (event, data) => {
        term.write(data);

        // Visual Shell Streaming
        // If no block is active (e.g. initial startup log), create a generic system block
        if (!currentCommandBlock) {
            createCommandBlock('System Output', true);
        }

        // Append parsed HTML to the active block
        const parsedNode = document.createElement('span');
        parsedNode.innerHTML = parser.parse(data);

        // Find the output container in the current block
        const outputContainer = currentCommandBlock.querySelector('.block-output');
        if (outputContainer) {
            outputContainer.appendChild(parsedNode);

            // Auto-scroll logic (smart)
            const isNearBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 100;
            if (isNearBottom) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }
    });

    // Handle resize
    term.onResize(({ cols, rows }) => {
        ipcRenderer.send('terminal-resize', { cols, rows });
    });

    // Initial Fit
    setTimeout(() => {
        if (activeTab === 'terminal') {
            fitAddon.fit();
        }
        ipcRenderer.send('terminal-init', currentWorkPath);
    }, 100);
}

// --- Tab Switching ---
function switchTab(tab) {
    activeTab = tab;
    if (tab === 'terminal') {
        // UI
        btnTabTerminal.classList.add('border-blue-500', 'text-white', 'bg-zinc-800/50');
        btnTabTerminal.classList.remove('border-transparent', 'text-zinc-500');
        btnTabChat.classList.add('border-transparent', 'text-zinc-500');
        btnTabChat.classList.remove('border-blue-500', 'text-white', 'bg-zinc-800/50');

        viewTerminal.classList.remove('hidden');
        viewChat.classList.add('hidden');

        // Ensure terminal fits after revealed
        setTimeout(() => fitAddon?.fit(), 10);
    } else {
        // UI
        btnTabChat.classList.add('border-purple-600', 'text-white', 'bg-zinc-800/50');
        btnTabChat.classList.remove('border-transparent', 'text-zinc-500');
        btnTabTerminal.classList.add('border-transparent', 'text-zinc-500');
        btnTabTerminal.classList.remove('border-blue-500', 'text-white', 'bg-zinc-800/50');

        viewChat.classList.remove('hidden');
        viewTerminal.classList.add('hidden');

        chatTextarea.focus();
    }
}

btnTabTerminal?.addEventListener('click', () => switchTab('terminal'));
btnTabChat?.addEventListener('click', () => switchTab('chat'));

// --- Hybrid Visual Shell Logic ---

// 1. Chat Bubbles (For AI/User Conversation)
function appendChatMessage(role, text) {
    const isAI = role === 'assistant' || role === 'ai' || role === 'bot';
    const div = document.createElement('div');
    div.className = `flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 ${role === 'user' ? 'flex-row-reverse' : ''}`;

    const icon = isAI ? '🤖' : '👤';
    const iconClass = isAI ? 'bg-purple-600/20 border-purple-500/30' : 'bg-blue-600/20 border-blue-500/30';
    const bubbleClass = isAI ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-blue-600/10 border-blue-600/20 text-blue-100';

    div.innerHTML = `
        <div class="w-8 h-8 rounded-full ${iconClass} border flex items-center justify-center text-sm shrink-0 shadow-sm">
            ${icon}
        </div>
        <div class="border rounded-2xl p-3.5 text-sm ${bubbleClass} max-w-[85%] leading-relaxed shadow-sm">
            ${text.replace(/\n/g, '<br>')}
        </div>
    `;

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 2. Command Blocks (For Terminal Output)
function createCommandBlock(commandText, isSystem = false) {
    const blockId = 'block-' + Date.now();
    const block = document.createElement('div');
    block.className = 'flex flex-col gap-1 mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300';
    block.id = blockId;

    // Header
    const headerHtml = isSystem ?
        `<div class="flex items-center gap-2 text-zinc-500 text-xs px-1 mb-1 opacity-70">
            <span>⚙️ System Process</span>
         </div>` :
        `<div class="flex items-center gap-3">
             <div class="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/40 text-white shrink-0">
                 💻
             </div>
             <div class="bg-zinc-800/80 backdrop-blur-md border border-zinc-700/50 rounded-2xl rounded-tl-sm px-4 py-2 text-zinc-100 shadow-sm font-mono text-xs">
                 ${commandText}
             </div>
         </div>`;

    // Output Container
    const outputHtml = `
        <div class="relative ml-11 mt-1 group">
            <div class="absolute -left-3 top-0 bottom-0 w-0.5 bg-zinc-800 group-hover:bg-zinc-700 transition-colors"></div>
            <div class="block-output font-mono text-xs leading-relaxed text-zinc-300 bg-black/40 border border-zinc-800/50 rounded-lg p-3 min-h-[40px] shadow-inner overflow-x-auto whitespace-pre-wrap sidebar-scrollbar">
            </div>
        </div>
    `;

    block.innerHTML = headerHtml + outputHtml;
    chatMessages.appendChild(block);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    currentCommandBlock = block;
    return block;
}

// 3. Smart Input Router
function handleChatInput() {
    const input = chatTextarea.value.trim();
    if (!input) return;

    // Reset Input
    chatTextarea.value = '';
    chatTextarea.style.height = '40px';

    // Heuristics: Is this a command?
    // Starts with explicit list, OR starts with "/", OR is very short and technical
    const commandPrefixes = ['npm', 'node', 'git', 'cd', 'ls', 'dir', 'echo', 'mkdir', 'rm', 'code', 'python', 'pip'];
    const isCommand = commandPrefixes.some(cmd => input.startsWith(cmd + ' ')) ||
        commandPrefixes.includes(input) ||
        input.startsWith('/') ||
        input.startsWith('./') ||
        input.startsWith('..');

    if (isCommand) {
        // -> Route to Terminal Logic
        createCommandBlock(input);
        ipcRenderer.send('terminal-input', input + '\r');
    } else {
        // -> Route to AI Chat Logic
        appendChatMessage('user', input);

        // Mock AI Response (for now)
        setTimeout(() => {
            appendChatMessage('ai', "I'm listening! I can currently run terminal commands if you type them independently, or I can just chat. Try running `npm run dev`!");
        }, 600);
    }
}

// --- Interactive Toolbar Logic ---
// Send raw ANSI sequences for menu control
btnKeyUp?.addEventListener('click', () => {
    ipcRenderer.send('terminal-input', '\u001b[A'); // Up Arrow
});

btnKeyDown?.addEventListener('click', () => {
    ipcRenderer.send('terminal-input', '\u001b[B'); // Down Arrow
});

btnKeyEsc?.addEventListener('click', () => {
    ipcRenderer.send('terminal-input', '\u001b');    // Escape
});

btnKeyCtrlC?.addEventListener('click', () => {
    ipcRenderer.send('terminal-input', '\u0003');    // Ctrl+C (SIGINT)
    // Also create a visual block for the cancellation
    createCommandBlock('^C (Interrupt)', true);
});

btnChatSend?.addEventListener('click', handleChatInput);
chatTextarea?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleChatInput();
    }
});

// Auto-expand textarea
chatTextarea?.addEventListener('input', () => {
    chatTextarea.style.height = 'auto';
    chatTextarea.style.height = (chatTextarea.scrollHeight) + 'px';
});


if (btnTerminalToolbar) {
    btnTerminalToolbar.addEventListener('click', () => {
        isTerminalOpen = !isTerminalOpen;
        if (isTerminalOpen) {
            terminalWindow.classList.remove('hidden');
            initTerminal();
            setTimeout(() => fitAddon.fit(), 100);
        } else {
            terminalWindow.classList.add('hidden');
        }
    });
}

btnTerminalClose?.addEventListener('click', () => {
    isTerminalOpen = false;
    terminalWindow.classList.add('hidden');
});

// Draggable Window Logic
let isDraggingTerminal = false;
let terminalDragOffset = { x: 0, y: 0 };

terminalHeader?.addEventListener('mousedown', (e) => {
    isDraggingTerminal = true;
    const rect = terminalWindow.getBoundingClientRect();
    terminalDragOffset.x = e.clientX - rect.left;
    terminalDragOffset.y = e.clientY - rect.top;
    terminalHeader.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
    if (isDraggingTerminal) {
        const x = e.clientX - terminalDragOffset.x;
        const y = e.clientY - terminalDragOffset.y;
        terminalWindow.style.left = x + 'px';
        terminalWindow.style.top = y + 'px';
        terminalWindow.style.right = 'auto'; // Disable right-anchor
    }
});

window.addEventListener('mouseup', () => {
    if (isDraggingTerminal) {
        isDraggingTerminal = false;
        terminalHeader.style.cursor = 'move';
    }
});

// Resize Logic
let isResizingTerminal = false;

terminalResizer?.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizingTerminal = true;
    document.body.style.cursor = 'nwse-resize';
});

window.addEventListener('mousemove', (e) => {
    if (isResizingTerminal) {
        const rect = terminalWindow.getBoundingClientRect();
        const width = e.clientX - rect.left;
        const height = e.clientY - rect.top;

        terminalWindow.style.width = Math.max(300, width) + 'px';
        terminalWindow.style.height = Math.max(200, height) + 'px';

        if (fitAddon) fitAddon.fit();
    }
});

window.addEventListener('mouseup', () => {
    if (isResizingTerminal) {
        isResizingTerminal = false;
        document.body.style.cursor = 'default';
        if (fitAddon) fitAddon.fit();
    }
});

// =============================================================================
// AUDIO TRACK MODULE
// =============================================================================

// --- Audio State ---
let audioPlayer = null;           // Howler.js instance
let audioFilePath = null;
let audioDuration = 0;
let audioMarkers = [];            // [{time: 5.2, id: 1}, ...]
let isJointMode = false;
let selectedMarkerIds = [];       // For duration measurement (max 2)
let isAudioPlaying = false;
let audioAnimationFrame = null;
let markerIdCounter = 0;
let audioVolume = 1.0;            // 0.0 to 1.0
let isAudioMuted = false;

// --- Audio UI Elements ---
const audioDropZone = document.getElementById('audio-drop-zone');
const audioPlayerContainer = document.getElementById('audio-player-container');
const audioFilenameEl = document.getElementById('audio-filename');
const audioDurationEl = document.getElementById('audio-duration');
const audioCurrentTimeEl = document.getElementById('audio-current-time');
const audioTotalTimeEl = document.getElementById('audio-total-time');
const audioProgressTrack = document.getElementById('audio-progress-track');
const audioProgressFill = document.getElementById('audio-progress-fill');
const audioScrubber = document.getElementById('audio-scrubber');
const audioScrubberTooltip = document.getElementById('audio-scrubber-tooltip');
const audioMarkerTrack = document.getElementById('audio-marker-track');
const btnAddAudio = document.getElementById('btn-add-audio');
const btnRemoveAudio = document.getElementById('btn-remove-audio');
const btnAudioPlay = document.getElementById('btn-audio-play');
const audioPlayIcon = document.getElementById('audio-play-icon');
const audioPauseIcon = document.getElementById('audio-pause-icon');
const btnAddMarker = document.getElementById('btn-add-marker');
const btnClearMarkers = document.getElementById('btn-clear-markers');
const btnAudioJointMode = document.getElementById('btn-audio-joint-mode');
const jointModeLabel = document.getElementById('joint-mode-label');
const markerDurationDisplay = document.getElementById('marker-duration-display');
const markerDurationValue = document.getElementById('marker-duration-value');
const btnAudioMute = document.getElementById('btn-audio-mute');
const audioVolumeIcon = document.getElementById('audio-volume-icon');
const audioMutedIcon = document.getElementById('audio-muted-icon');
const audioVolumeSlider = document.getElementById('audio-volume-slider');

// --- Helper Functions ---
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
}

function formatTimeShort(seconds) {
    return seconds.toFixed(1) + 's';
}

function clampAudioTime(time) {
    if (!audioDuration) return 0;
    return Math.max(0, Math.min(Number(time) || 0, audioDuration));
}

// --- Audio Loading ---
function loadAudioFile(filePath) {
    if (audioPlayer) {
        audioPlayer.unload();
        cancelAnimationFrame(audioAnimationFrame);
    }
    isAudioPlaying = false;

    audioFilePath = filePath;
    audioMarkers = [];
    selectedMarkerIds = [];
    markerIdCounter = 0;

    audioPlayer = new Howl({
        src: [filePath],
        html5: true, // Enable streaming for large files
        onload: function () {
            audioDuration = audioPlayer.duration();
            audioFilenameEl.textContent = filePath.split(/[\\/]/).pop();
            audioDurationEl.textContent = formatTime(audioDuration);
            audioTotalTimeEl.textContent = formatTime(audioDuration);
            audioCurrentTimeEl.textContent = '00:00';

            // Show player, hide drop zone
            audioDropZone.classList.add('hidden');
            audioPlayerContainer.classList.remove('hidden');
            if (btnRemoveAudio) {
                btnRemoveAudio.classList.remove('hidden');
            }

            updateAudioScrubberPosition(0);
            renderMarkers();
            console.log('Audio loaded:', filePath, 'Duration:', audioDuration);
        },
        onplay: function () {
            isAudioPlaying = true;
            updateAudioPlayIcon();
            startAudioProgressLoop();
        },
        onpause: function () {
            isAudioPlaying = false;
            updateAudioPlayIcon();
            cancelAnimationFrame(audioAnimationFrame);
        },
        onstop: function () {
            isAudioPlaying = false;
            updateAudioPlayIcon();
            cancelAnimationFrame(audioAnimationFrame);
        },
        onend: function () {
            isAudioPlaying = false;
            updateAudioPlayIcon();
            updateAudioScrubberPosition(audioDuration);
            cancelAnimationFrame(audioAnimationFrame);
        },
        onloaderror: function (id, err) {
            console.error('Audio load error:', err);
            alert('Failed to load audio file.');
            removeAudio();
        }
    });

    // Apply current volume setting to new audio
    audioPlayer.volume(isAudioMuted ? 0 : audioVolume);
}

// --- Audio Playback ---
function playAudio() {
    if (!audioPlayer) return;
    // Prevent double-play glitch
    if (isAudioPlaying) return;
    if (audioDuration && (audioPlayer.seek() || 0) >= audioDuration - 0.05) {
        audioPlayer.seek(0);
        updateAudioScrubberPosition(0);
    }
    audioPlayer.rate(speeds[currentSpeedIndex] || 1);
    audioPlayer.play();
    isAudioPlaying = true;
    updateAudioPlayIcon();
    startAudioProgressLoop();
}

function pauseAudio() {
    if (!audioPlayer) return;
    audioPlayer.pause();
    isAudioPlaying = false;
    updateAudioPlayIcon();
    cancelAnimationFrame(audioAnimationFrame);
}

function seekAudio(time) {
    if (!audioPlayer) return;
    const nextTime = clampAudioTime(time);
    audioPlayer.seek(nextTime);
    updateAudioScrubberPosition(nextTime);
}

function updateAudioPlayIcon() {
    if (!audioPlayIcon || !audioPauseIcon) return;
    if (isAudioPlaying) {
        audioPlayIcon.classList.add('hidden');
        audioPauseIcon.classList.remove('hidden');
    } else {
        audioPlayIcon.classList.remove('hidden');
        audioPauseIcon.classList.add('hidden');
    }
}

function startAudioProgressLoop() {
    cancelAnimationFrame(audioAnimationFrame);
    function update() {
        if (!audioPlayer || !isAudioPlaying) return;
        const currentTime = audioPlayer.seek() || 0;
        updateAudioScrubberPosition(currentTime);
        audioAnimationFrame = requestAnimationFrame(update);
    }
    audioAnimationFrame = requestAnimationFrame(update);
}

function updateAudioScrubberPosition(time) {
    if (!audioDuration) return;
    const safeTime = clampAudioTime(time);
    const percent = (safeTime / audioDuration) * 100;
    audioProgressFill.style.width = percent + '%';
    audioScrubber.style.left = 'calc(' + percent + '% - 6px)';
    audioCurrentTimeEl.textContent = formatTime(safeTime);
    audioScrubberTooltip.textContent = formatTimeShort(safeTime);
}

function removeAudio() {
    if (audioPlayer) {
        audioPlayer.unload();
    }
    cancelAnimationFrame(audioAnimationFrame);

    audioPlayer = null;
    audioFilePath = null;
    audioDuration = 0;
    audioMarkers = [];
    selectedMarkerIds = [];
    markerIdCounter = 0;
    isAudioPlaying = false;

    if (audioFilenameEl) audioFilenameEl.textContent = '';
    if (audioDurationEl) audioDurationEl.textContent = '00:00';
    if (audioCurrentTimeEl) audioCurrentTimeEl.textContent = '00:00';
    if (audioTotalTimeEl) audioTotalTimeEl.textContent = '00:00';
    if (audioProgressFill) audioProgressFill.style.width = '0%';
    if (audioScrubber) audioScrubber.style.left = '0%';
    if (audioScrubberTooltip) audioScrubberTooltip.textContent = '0.0s';
    if (audioMarkerTrack) audioMarkerTrack.innerHTML = '';
    if (markerDurationDisplay) markerDurationDisplay.classList.add('hidden');
    if (audioPlayerContainer) audioPlayerContainer.classList.add('hidden');
    if (audioDropZone) audioDropZone.classList.remove('hidden');
    if (btnRemoveAudio) btnRemoveAudio.classList.add('hidden');
    updateAudioPlayIcon();
}

// --- Audio Scrubber Dragging ---
let isAudioScrubbing = false;

if (audioProgressTrack) {
    audioProgressTrack.addEventListener('mousedown', (e) => {
        // Don't start scrubbing if clicking on a marker
        if (e.target.closest('#audio-marker-track > div')) {
            return; // Let marker handle it
        }
        isAudioScrubbing = true;
        scrubToPosition(e);
    });

    document.addEventListener('mousemove', (e) => {
        if (isAudioScrubbing) {
            scrubToPosition(e);
        }
    });

    document.addEventListener('mouseup', () => {
        isAudioScrubbing = false;
    });
}

function scrubToPosition(e) {
    if (!audioProgressTrack || !audioDuration) return;
    const rect = audioProgressTrack.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = x / rect.width;
    const time = percent * audioDuration;
    seekAudio(time);
}

// --- Marker System ---
function addMarker(time) {
    if (!audioDuration) return;
    const marker = { time: time, id: ++markerIdCounter };
    audioMarkers.push(marker);
    audioMarkers.sort((a, b) => a.time - b.time);
    renderMarkers();
}

function removeMarker(id) {
    audioMarkers = audioMarkers.filter(m => m.id !== id);
    selectedMarkerIds = selectedMarkerIds.filter(sid => sid !== id);
    renderMarkers();
    updateDurationMeasurement();
}

function clearAllMarkers() {
    audioMarkers = [];
    selectedMarkerIds = [];
    renderMarkers();
    updateDurationMeasurement();
}

function renderMarkers() {
    if (!audioMarkerTrack) return;
    audioMarkerTrack.innerHTML = '';

    audioMarkers.forEach(marker => {
        const percent = (marker.time / audioDuration) * 100;
        const markerEl = document.createElement('div');
        const isSelected = selectedMarkerIds.includes(marker.id);
        markerEl.className = 'absolute top-0 w-1 h-full cursor-pointer transition-colors ' +
            (isSelected ? 'bg-green-400' : 'bg-yellow-600 hover:bg-yellow-400');
        markerEl.style.left = percent + '%';
        markerEl.style.pointerEvents = 'auto';
        markerEl.title = formatTimeShort(marker.time) + ' (click to select, right-click to delete)';

        // Left click to select for measurement
        markerEl.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMarkerSelection(marker.id);
        });

        // Right click to delete
        markerEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeMarker(marker.id);
        });

        audioMarkerTrack.appendChild(markerEl);
    });
}

function toggleMarkerSelection(id) {
    if (selectedMarkerIds.includes(id)) {
        selectedMarkerIds = selectedMarkerIds.filter(sid => sid !== id);
    } else {
        if (selectedMarkerIds.length >= 2) {
            selectedMarkerIds.shift(); // Remove oldest
        }
        selectedMarkerIds.push(id);
    }
    renderMarkers();
    updateDurationMeasurement();
}

function updateDurationMeasurement() {
    if (selectedMarkerIds.length === 2) {
        const m1 = audioMarkers.find(m => m.id === selectedMarkerIds[0]);
        const m2 = audioMarkers.find(m => m.id === selectedMarkerIds[1]);
        if (m1 && m2) {
            const duration = Math.abs(m2.time - m1.time);
            markerDurationValue.textContent = formatTimeShort(duration);
            markerDurationDisplay.classList.remove('hidden');
            return;
        }
    }
    markerDurationDisplay.classList.add('hidden');
}

// --- Joint Mode ---
function setJointMode(enabled) {
    isJointMode = enabled;
    if (enabled) {
        jointModeLabel.textContent = 'Joint';
        btnAudioJointMode.classList.remove('bg-zinc-800', 'border-zinc-700', 'text-zinc-400');
        btnAudioJointMode.classList.add('bg-purple-600', 'border-purple-500', 'text-white');
        syncAudioWithScene(currentTime, isPlaying, true);
    } else {
        jointModeLabel.textContent = 'Non-Joint';
        btnAudioJointMode.classList.add('bg-zinc-800', 'border-zinc-700', 'text-zinc-400');
        btnAudioJointMode.classList.remove('bg-purple-600', 'border-purple-500', 'text-white');
    }
}

// Sync audio with scene timeline (called when joint mode is ON)
function syncAudioWithScene(time, sceneIsPlaying, forceSeek = false) {
    if (!isJointMode || !audioPlayer) return;

    const sceneTime = clampAudioTime(time);
    const scenePastAudioEnd = audioDuration > 0 && time >= audioDuration - 0.05;
    const currentAudioTime = audioPlayer.seek() || 0;
    // Only seek if difference is significant (avoid micro-jitter)
    if (forceSeek || Math.abs(currentAudioTime - sceneTime) > 0.15) {
        seekAudio(sceneTime);
    }

    audioPlayer.rate(speeds[currentSpeedIndex] || 1);

    if (sceneIsPlaying && !isAudioPlaying && !scenePastAudioEnd) {
        playAudio();
    } else if (!sceneIsPlaying && isAudioPlaying) {
        pauseAudio();
    } else if (scenePastAudioEnd && isAudioPlaying) {
        pauseAudio();
    }
}

// --- Event Wiring ---

// Add Audio button
if (btnAddAudio) {
    btnAddAudio.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke('open-file-dialog');
        if (!result.canceled && result.filePaths.length > 0) {
            loadAudioFile(result.filePaths[0]);
        }
    });
}

if (btnRemoveAudio) {
    btnRemoveAudio.addEventListener('click', () => {
        if (audioPlayer && confirm('Remove the current audio track?')) {
            removeAudio();
        }
    });
}

// Drop zone click
if (audioDropZone) {
    audioDropZone.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke('open-file-dialog');
        if (!result.canceled && result.filePaths.length > 0) {
            loadAudioFile(result.filePaths[0]);
        }
    });

    // Drag and drop
    audioDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        audioDropZone.classList.add('border-purple-500', 'bg-purple-900/20');
    });

    audioDropZone.addEventListener('dragleave', () => {
        audioDropZone.classList.remove('border-purple-500', 'bg-purple-900/20');
    });

    audioDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        audioDropZone.classList.remove('border-purple-500', 'bg-purple-900/20');
        if (e.dataTransfer.files.length > 0) {
            loadAudioFile(e.dataTransfer.files[0].path);
        }
    });
}

// Play/Pause button
if (btnAudioPlay) {
    btnAudioPlay.addEventListener('click', () => {
        if (isAudioPlaying) {
            pauseAudio();
        } else {
            playAudio();
        }
    });
}

// Add Marker button
if (btnAddMarker) {
    btnAddMarker.addEventListener('click', () => {
        if (audioPlayer) {
            const currentTime = audioPlayer.seek() || 0;
            addMarker(currentTime);
        }
    });
}

// Clear Markers button
if (btnClearMarkers) {
    btnClearMarkers.addEventListener('click', () => {
        if (confirm('Clear all markers?')) {
            clearAllMarkers();
        }
    });
}

// Joint Mode toggle
if (btnAudioJointMode) {
    btnAudioJointMode.addEventListener('click', () => {
        setJointMode(!isJointMode);
    });
}

// --- Volume/Mute Controls ---
function setAudioVolume(vol) {
    audioVolume = Math.max(0, Math.min(1, vol));
    if (audioPlayer) {
        audioPlayer.volume(isAudioMuted ? 0 : audioVolume);
    }
    if (audioVolumeSlider) {
        audioVolumeSlider.value = audioVolume * 100;
    }
}

function toggleMute() {
    isAudioMuted = !isAudioMuted;
    if (audioPlayer) {
        audioPlayer.volume(isAudioMuted ? 0 : audioVolume);
    }
    updateMuteIcon();
}

function updateMuteIcon() {
    if (isAudioMuted) {
        audioVolumeIcon.classList.add('hidden');
        audioMutedIcon.classList.remove('hidden');
    } else {
        audioVolumeIcon.classList.remove('hidden');
        audioMutedIcon.classList.add('hidden');
    }
}

// Mute button
if (btnAudioMute) {
    btnAudioMute.addEventListener('click', () => {
        toggleMute();
    });
}

// Volume slider
if (audioVolumeSlider) {
    audioVolumeSlider.addEventListener('input', (e) => {
        const vol = parseInt(e.target.value) / 100;
        audioVolume = vol;
        isAudioMuted = (vol === 0);
        if (audioPlayer) {
            audioPlayer.volume(vol);
        }
        updateMuteIcon();
    });
}

console.log('Audio Track Module initialized');

// =============================================================================
// RENDER UI MODULE
// =============================================================================

// --- Render UI Elements ---
const btnRender = document.getElementById('btn-render');
const renderModal = document.getElementById('render-modal');
const renderFormat = document.getElementById('render-format');
const renderResolution = document.getElementById('render-resolution');
const renderFps = document.getElementById('render-fps');
const renderStart = document.getElementById('render-start');
const renderDuration = document.getElementById('render-duration');
const renderAudioRow = document.getElementById('render-audio-row');
const renderAudioToggle = document.getElementById('render-audio-toggle');
const renderAudioKnob = document.getElementById('render-audio-knob');
const renderOutputPath = document.getElementById('render-output-path');
const btnSelectOutput = document.getElementById('btn-select-output');
const btnRenderCancel = document.getElementById('btn-render-cancel');
const btnRenderStart = document.getElementById('btn-render-start');
const renderOutputName = document.getElementById('render-output-name');
const renderOutputNameRow = document.getElementById('render-output-name-row');
const renderScope = document.getElementById('render-scope');
const renderScenePicker = document.getElementById('render-scene-picker');
const renderSceneList = document.getElementById('render-scene-list');
const btnRenderSelectAll = document.getElementById('btn-render-select-all');
const btnRenderSelectNone = document.getElementById('btn-render-select-none');

// Progress Popup Elements
const renderProgressPopup = document.getElementById('render-progress-popup');
const renderProgressContent = document.getElementById('render-progress-content');
const renderProgressMinimized = document.getElementById('render-progress-minimized');
const btnRenderMinimize = document.getElementById('btn-render-minimize');
const btnRenderAbort = document.getElementById('btn-render-abort');
const renderProgressLabel = document.getElementById('render-progress-label');
const renderProgressPercent = document.getElementById('render-progress-percent');
const renderProgressBar = document.getElementById('render-progress-bar');
const renderFrameInfo = document.getElementById('render-frame-info');
const renderTimeEstimate = document.getElementById('render-time-estimate');
const renderMiniPercent = document.getElementById('render-mini-percent');

// --- Render State ---
let renderIncludeAudio = true;
let renderOutputFolder = '';
let renderBatchActive = false;
let renderBatchCancelled = false;
let renderQueueIndex = 0;
let renderQueueTotal = 0;
let lastRenderOutputPath = null;

function sceneFileToName(sceneFile) {
    return sceneFile.replace(/\.html$/i, '');
}

function getSceneLabel(sceneFile) {
    return sceneFileToName(sceneFile);
}

function getRenderSceneFiles() {
    const scope = renderScope ? renderScope.value : 'current';
    if (scope === 'all') {
        return [...allSceneFiles];
    }
    if (scope === 'selected') {
        return Array.from(document.querySelectorAll('.render-scene-checkbox:checked')).map(input => input.value);
    }
    return activeSceneName ? [`${activeSceneName}.html`] : [];
}

function renderSceneChecklist() {
    if (!renderSceneList) return;

    renderSceneList.innerHTML = '';
    if (allSceneFiles.length === 0) {
        renderSceneList.innerHTML = '<div class="text-xs text-zinc-600 text-center py-3">No scenes found</div>';
        return;
    }

    allSceneFiles.forEach(sceneFile => {
        const sceneName = getSceneLabel(sceneFile);
        const row = document.createElement('label');
        row.className = 'flex items-center gap-2 text-xs text-zinc-300 hover:bg-zinc-900 rounded px-2 py-1 cursor-pointer';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'render-scene-checkbox accent-purple-500';
        input.value = sceneFile;
        input.checked = sceneName === activeSceneName;
        const label = document.createElement('span');
        label.className = 'truncate';
        label.textContent = sceneName;
        row.appendChild(input);
        row.appendChild(label);
        renderSceneList.appendChild(row);
    });
}

function updateRenderScopeUI() {
    const scope = renderScope ? renderScope.value : 'current';
    const isBatch = scope !== 'current';
    if (renderScenePicker) {
        renderScenePicker.classList.toggle('hidden', !isBatch);
    }
    if (renderOutputNameRow) {
        renderOutputNameRow.classList.toggle('hidden', isBatch);
    }
    if (renderOutputName) {
        renderOutputName.disabled = isBatch;
    }
    if (isBatch && renderDuration && Number(renderDuration.value) === sceneDuration) {
        renderDuration.value = 0;
    }
    if (btnRenderStart) {
        btnRenderStart.textContent = isBatch ? 'Start Batch Render' : 'Start Render';
    }

    renderSceneChecklist();
    if (scope === 'all') {
        document.querySelectorAll('.render-scene-checkbox').forEach(input => {
            input.checked = true;
            input.disabled = true;
        });
    } else {
        document.querySelectorAll('.render-scene-checkbox').forEach(input => {
            input.disabled = false;
        });
    }
}

function selectRenderScenes(checked) {
    document.querySelectorAll('.render-scene-checkbox').forEach(input => {
        if (!input.disabled) input.checked = checked;
    });
}

function createRenderOptions(sceneName, outputName) {
    const isVideo = ['mp4', 'webm'].includes(renderFormat.value);
    const requestedDuration = parseFloat(renderDuration.value) || 0;

    return {
        sceneUrl: `http://localhost:3000/scene/${sceneName}.html`,
        outputPath: renderOutputFolder,
        sceneName: outputName,
        format: renderFormat.value,
        resolution: renderResolution.value,
        fps: parseInt(renderFps.value),
        startTime: parseFloat(renderStart.value) || 0,
        duration: requestedDuration,
        includeAudio: !renderBatchActive && renderIncludeAudio && isVideo,
        audioPath: !renderBatchActive ? (audioFilePath || null) : null
    };
}

// --- Open Render Modal ---
if (btnRender) {
    btnRender.addEventListener('click', () => {
        if (!activeSceneName && allSceneFiles.length === 0) {
            alert('Please select a scene first.');
            return;
        }
        // Set default output name to scene name
        if (renderOutputName) {
            renderOutputName.value = activeSceneName;
        }
        // Set default duration to scene duration
        if (sceneDuration > 0) {
            renderDuration.value = sceneDuration;
        }
        // Set default output path
        if (currentWorkPath) {
            renderOutputFolder = currentWorkPath;
            renderOutputPath.value = currentWorkPath;
        }
        if (renderScope) {
            renderScope.value = 'current';
        }
        updateRenderScopeUI();
        renderModal.classList.remove('hidden');
    });
}

// --- Close Modal ---
if (btnRenderCancel) {
    btnRenderCancel.addEventListener('click', () => {
        renderModal.classList.add('hidden');
    });
}

// Close modal on backdrop click
if (renderModal) {
    renderModal.addEventListener('click', (e) => {
        if (e.target === renderModal) {
            renderModal.classList.add('hidden');
        }
    });
}

// --- Audio Toggle ---
if (renderAudioToggle) {
    renderAudioToggle.addEventListener('click', () => {
        renderIncludeAudio = !renderIncludeAudio;
        if (renderIncludeAudio) {
            renderAudioToggle.classList.remove('bg-zinc-700');
            renderAudioToggle.classList.add('bg-purple-600');
            renderAudioKnob.style.transform = 'translateX(0)';
        } else {
            renderAudioToggle.classList.add('bg-zinc-700');
            renderAudioToggle.classList.remove('bg-purple-600');
            renderAudioKnob.style.transform = 'translateX(-24px)';
        }
    });
}

// --- Format Change (hide audio for image sequence) ---
if (renderFormat) {
    renderFormat.addEventListener('change', () => {
        const isVideo = ['mp4', 'webm'].includes(renderFormat.value);
        if (isVideo) {
            renderAudioRow.classList.remove('hidden');
        } else {
            renderAudioRow.classList.add('hidden');
        }
    });
}

if (renderScope) {
    renderScope.addEventListener('change', updateRenderScopeUI);
}

if (btnRenderSelectAll) {
    btnRenderSelectAll.addEventListener('click', () => selectRenderScenes(true));
}

if (btnRenderSelectNone) {
    btnRenderSelectNone.addEventListener('click', () => selectRenderScenes(false));
}

// --- Select Output Folder ---
if (btnSelectOutput) {
    btnSelectOutput.addEventListener('click', async () => {
        const folder = await ipcRenderer.invoke('select-output-folder');
        if (folder) {
            renderOutputFolder = folder;
            renderOutputPath.value = folder;
        }
    });
}

// --- Start Render ---
if (btnRenderStart) {
    btnRenderStart.addEventListener('click', async () => {
        const sceneFiles = getRenderSceneFiles();
        if (sceneFiles.length === 0) {
            alert('No scenes selected.');
            return;
        }
        if (!renderOutputFolder) {
            alert('Please select an output folder.');
            return;
        }

        const scope = renderScope ? renderScope.value : 'current';
        const isBatch = scope !== 'current' || sceneFiles.length > 1;
        const failures = [];

        // Close modal, show progress popup
        renderModal.classList.add('hidden');
        showRenderProgress();

        renderBatchActive = isBatch;
        renderBatchCancelled = false;
        renderQueueTotal = sceneFiles.length;
        renderQueueIndex = 0;
        lastRenderOutputPath = null;

        for (let i = 0; i < sceneFiles.length; i++) {
            if (renderBatchCancelled) break;

            const sceneName = sceneFileToName(sceneFiles[i]);
            const outputName = isBatch ? sceneName : ((renderOutputName && renderOutputName.value.trim()) || sceneName);
            const options = createRenderOptions(sceneName, outputName);

            renderQueueIndex = i + 1;
            renderingSceneName = sceneName;
            updateSceneListRenderLock();

            renderProgressLabel.textContent = isBatch
                ? `Rendering ${renderQueueIndex}/${renderQueueTotal}: ${sceneName}`
                : 'Preparing...';

            const result = await ipcRenderer.invoke('start-render', options);
            if (!result.success) {
                failures.push({ sceneName, error: result.error });
                break;
            }
            lastRenderOutputPath = result.outputPath || lastRenderOutputPath;
        }

        renderBatchActive = false;
        renderingSceneName = null;
        updateSceneListRenderLock();

        if (renderBatchCancelled) {
            renderProgressLabel.textContent = 'Render cancelled';
            setTimeout(hideRenderProgress, 1000);
            return;
        }

        if (failures.length > 0) {
            const firstFailure = failures[0];
            alert(`Render failed for ${firstFailure.sceneName}: ${firstFailure.error}`);
            hideRenderProgress();
            return;
        }

        if (!isBatch) {
            return;
        }

        renderProgressLabel.textContent = isBatch ? `Batch render complete (${sceneFiles.length})` : 'Render complete!';
        renderTimeEstimate.textContent = '';
        if (lastRenderOutputPath && confirm(isBatch ? 'Batch render complete! Open output folder?' : 'Render complete! Open output folder?')) {
            ipcRenderer.invoke('open-render-output', lastRenderOutputPath);
        }
        hideRenderProgress();
    });
}

// --- Scene Render Lock State ---
let renderingSceneName = null;

function updateSceneListRenderLock() {
    // Find and update the scene item in the list
    const sceneItems = document.querySelectorAll('#scene-list > div');
    sceneItems.forEach(item => {
        const nameSpan = item.querySelector('span');
        if (nameSpan) {
            const sceneName = nameSpan.textContent.replace('.html', '').replace('🔒 ', '').replace('🎬 ', '').trim();
            if (renderingSceneName && sceneName === renderingSceneName) {
                nameSpan.textContent = '🎬 ' + sceneName + '.html';
                item.style.backgroundColor = 'rgba(147, 51, 234, 0.2)';
                item.title = 'Currently rendering - editing disabled';
            } else {
                nameSpan.textContent = sceneName + '.html';
                if (!item.classList.contains('bg-blue-600')) {
                    item.style.backgroundColor = '';
                }
                item.title = '';
            }
        }
    });
}

// --- Progress Popup Functions ---
function showRenderProgress() {
    renderProgressPopup.classList.remove('hidden');
    renderProgressContent.classList.remove('hidden');
    renderProgressMinimized.classList.add('hidden');
    renderProgressBar.style.width = '0%';
    renderProgressPercent.textContent = '0%';
    renderMiniPercent.textContent = '0%';
    renderProgressLabel.textContent = 'Preparing...';
    renderFrameInfo.textContent = 'Frame 0 / 0';
    renderTimeEstimate.textContent = 'Estimating...';
}

function hideRenderProgress() {
    renderProgressPopup.classList.add('hidden');
}

// --- Minimize/Restore ---
if (btnRenderMinimize) {
    btnRenderMinimize.addEventListener('click', () => {
        renderProgressContent.classList.add('hidden');
        renderProgressMinimized.classList.remove('hidden');
    });
}

if (renderProgressMinimized) {
    renderProgressMinimized.addEventListener('click', () => {
        renderProgressContent.classList.remove('hidden');
        renderProgressMinimized.classList.add('hidden');
    });
}

// --- Abort Render ---
if (btnRenderAbort) {
    btnRenderAbort.addEventListener('click', async () => {
        if (confirm('Cancel the current render?')) {
            renderBatchCancelled = true;
            await ipcRenderer.invoke('abort-render');
        }
    });
}

// --- Listen for Progress Updates ---
ipcRenderer.on('render-progress', (event, data) => {
    const { status, percent, label, currentFrame, totalFrames, outputPath } = data;

    renderProgressBar.style.width = percent + '%';
    renderProgressPercent.textContent = percent + '%';
    renderMiniPercent.textContent = percent + '%';
    renderProgressLabel.textContent = renderBatchActive
        ? `${renderQueueIndex}/${renderQueueTotal} ${renderingSceneName || ''}: ${label || status}`
        : (label || status);

    if (currentFrame !== undefined && totalFrames !== undefined) {
        renderFrameInfo.textContent = `Frame ${currentFrame} / ${totalFrames}`;
        // Estimate time
        if (currentFrame > 0) {
            const remaining = totalFrames - currentFrame;
            // Rough estimate: 0.5s per frame (will vary)
            const estSeconds = remaining * 0.5;
            if (estSeconds < 60) {
                renderTimeEstimate.textContent = `~${Math.round(estSeconds)}s remaining`;
            } else {
                renderTimeEstimate.textContent = `~${Math.round(estSeconds / 60)}m remaining`;
            }
        }
    }

    if (status === 'complete') {
        if (renderBatchActive) {
            return;
        }

        renderProgressLabel.textContent = '✅ Render complete!';
        renderTimeEstimate.textContent = '';

        // Clear scene lock
        renderingSceneName = null;
        updateSceneListRenderLock();

        // Show "Open Folder" option
        setTimeout(() => {
            if (outputPath && confirm('Render complete! Open output folder?')) {
                ipcRenderer.invoke('open-render-output', outputPath);
            }
            hideRenderProgress();
        }, 1000);
    } else if (status === 'error' || status === 'aborted') {
        if (renderBatchActive) {
            return;
        }

        // Clear scene lock on error/abort
        renderingSceneName = null;
        updateSceneListRenderLock();

        setTimeout(() => {
            hideRenderProgress();
        }, 2000);
    }
});

console.log('Render UI Module initialized');
