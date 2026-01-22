const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');

let serverInstance = null;
let ioInstance = null;

// ENGINE_ROOT: Where the app code lives (specifically the electron folder context)
const ENGINE_ROOT = __dirname;
// STATIC_ASSETS: Helper JS files (inspector, hud)
const ASSETS_ROOT = path.join(ENGINE_ROOT, 'assets');

// STATE (Mutable)
let PROJECT_ROOT = process.cwd(); // Default to CWD, updated via API
let WATCHER = null;

function startServer(port = 3000) {
    if (serverInstance) return { server: serverInstance, io: ioInstance };

    const app = express();
    app.use(express.json({ limit: '200mb' }));
    app.use(express.urlencoded({ limit: '200mb', extended: true }));
    app.use(require('cors')({ origin: '*' }));

    // --- STATIC SERVING ---

    // 1. Serve 'assets/' from the user's project
    app.use('/assets', (req, res, next) => {
        if (PROJECT_ROOT) {
            express.static(path.join(PROJECT_ROOT, 'assets'))(req, res, next);
        } else {
            next();
        }
    });

    // 2. Serve Engine Scripts (inspector.js, timeline-hud.js) 
    // These are now inside 'electron/assets/' in the built app
    app.use('/engine', express.static(ASSETS_ROOT));

    // 3. Serve Manager (Root) -> Redirect to our React App? 
    // Actually, the React App IS the manager. The server is just for the iframe content.
    // So we don't serve '/' to manager.html anymore. React handles that.

    // --- API: PROJECT MANAGEMENT ---

    app.post('/api/set-project-root', (req, res) => {
        const { path: newPath } = req.body;
        if (newPath && fs.existsSync(newPath)) {
            PROJECT_ROOT = newPath;
            console.log(`[Preview Server] Project Root set to: ${PROJECT_ROOT}`);
            setupWatcher(); // Restart watcher on new root
            res.json({ success: true, path: PROJECT_ROOT });
        } else {
            res.status(400).json({ error: 'Invalid path' });
        }
    });

    // --- API: SCENES ---

    const SCENE_ROOT = () => path.join(PROJECT_ROOT, 'scenes');

    app.get('/api/scenes', (req, res) => {
        try {
            if (!fs.existsSync(SCENE_ROOT())) fs.mkdirSync(SCENE_ROOT(), { recursive: true });
            const files = fs.readdirSync(SCENE_ROOT()).filter(f => f.endsWith('.html'));
            res.json({ scenes: files });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/scenes', (req, res) => {
        const { name } = req.body;
        try {
            if (!name) throw new Error('Name required');

            const safeName = name.replace(/[^a-z0-9_-]/gi, '');
            const fileName = safeName + '.html';
            const filePath = path.join(SCENE_ROOT(), fileName);

            // 1. Create specific asset folder (Sibling to scenes, in PROEJCT_ROOT/assets)
            const assetFolderPath = path.join(PROJECT_ROOT, 'assets', safeName);
            if (!fs.existsSync(assetFolderPath)) {
                fs.mkdirSync(assetFolderPath, { recursive: true });
            }

            // 2. Copy/Write Template
            const templateContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeName}</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
    <style>
        body { margin: 0; padding: 0; background: #000; overflow: hidden; }
        #stage {
            width: 1920px; height: 1080px; position: relative; overflow: hidden;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        }
        .frame { position: absolute; inset: 0; opacity: 0; display: flex; align-items: center; justify-content: center; }
        .title { font-size: 100px; font-weight: bold; color: #00d4ff; text-shadow: 0 0 30px rgba(0,212,255,0.5); font-family: sans-serif; }
    </style>
</head>
<body>
    <div id="stage">
        <div class="frame" id="frame1" data-frame="1" data-start="0" data-end="3">
            <h1 class="title" data-name="Title">${safeName}</h1>
        </div>
    </div>
    
    <script>
        // Auto-scale stage to fit viewport
        function scaleStage() {
            const stage = document.getElementById('stage');
            const scaleX = window.innerWidth / 1920;
            const scaleY = window.innerHeight / 1080;
            const scale = Math.min(scaleX, scaleY);
            const offsetX = (window.innerWidth - 1920 * scale) / 2;
            const offsetY = (window.innerHeight - 1080 * scale) / 2;
            stage.style.transform = \`translate(\${offsetX}px, \${offsetY}px) scale(\${scale})\`;
            stage.style.transformOrigin = 'top left';
        }
        scaleStage();
        window.addEventListener('resize', scaleStage);
    </script>
    
    <script>
        // Scene Metadata
        window.sceneMetadata = {
            title: "${safeName}",
            totalDuration: 3,
            audioFile: null,
            frames: [{ id: 1, start: 0, end: 3, text: "Scene: ${safeName}" }]
        };
        
        // GSAP Timeline
        const tl = gsap.timeline({ paused: true });
        window.masterTl = tl;
        
        // Animation
        tl.set("#frame1", { opacity: 1 }, 0);
        tl.from("#frame1 .title", { opacity: 0, y: 50, duration: 1 }, 0);
        tl.to("#frame1", { opacity: 0, duration: 0.5 }, 2.5);
    </script>
</body>
</html>`;

            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, templateContent);
            }

            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/api/scenes/:name', (req, res) => {
        try {
            const fileName = req.params.name;
            const filePath = path.join(SCENE_ROOT(), fileName);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);

                // Also delete specific assets folder if it exists
                // The folder name is the scene name without .html
                const folderName = fileName.replace('.html', '');
                const assetFolder = path.join(PROJECT_ROOT, 'assets', folderName);

                if (fs.existsSync(assetFolder)) {
                    fs.rmSync(assetFolder, { recursive: true, force: true });
                }

                res.json({ success: true });
            } else {
                res.status(404).json({ error: 'File not found' });
            }
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // --- API: SCENE AUDIO CONFIG ---
    app.get('/api/scenes/:name/audio', (req, res) => {
        try {
            const configPath = path.join(SCENE_ROOT(), req.params.name.replace('.html', '.audio.json'));
            if (fs.existsSync(configPath)) {
                res.json(JSON.parse(fs.readFileSync(configPath, 'utf8')));
            } else {
                res.json({ audioFile: null, startTime: 0 });
            }
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/scenes/:name/audio', (req, res) => {
        const { audioFile, startTime, duration } = req.body;
        try {
            const configPath = path.join(SCENE_ROOT(), req.params.name.replace('.html', '.audio.json'));
            fs.writeFileSync(configPath, JSON.stringify({ audioFile, startTime, duration }));
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Serve specific scene with HUD injection
    app.get('/scene/:name', (req, res) => {
        const scenePath = path.join(SCENE_ROOT(), req.params.name);
        if (!fs.existsSync(scenePath)) return res.status(404).send('Scene not found');

        fs.readFile(scenePath, 'utf8', (err, data) => {
            if (err) return res.status(500).send(err.message);

            // INJECTION: Add socket.io, inspector, timeline-hud, postMessage bridge, and AUTO-SCALING
            const injection = `
        <!-- MOTION DIRECTOR HUD INJECTION -->
        <script src="/socket.io/socket.io.js"></script>
        <script src="/engine/timeline-hud.js"></script>
        <script src="/engine/inspector.js"></script>
        <style>
            body { 
                margin: 0; 
                padding: 0; 
                overflow: hidden; 
                background-color: #050505; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                height: 100vh;
                width: 100vw;
            }
        </style>
        <script>
            // === GLOBAL AUTO-SCALING ===
            (function() {
                function fitStage() {
                    const stage = document.getElementById('stage') || document.body.firstElementChild;
                    if (!stage) return;
                    
                    // CRITICAL: Prevent flexbox from squashing the stage
                    stage.style.flexShrink = '0';
                    stage.style.flexGrow = '0';
                    stage.style.width = '1920px';
                    stage.style.height = '1080px';
                    
                    const targetWidth = 1920; 
                    const targetHeight = 1080;
                    
                    // Available space (iframe viewport)
                    const availableWidth = window.innerWidth;
                    const availableHeight = window.innerHeight;
                    
                    // Calculate uniform scale to fit
                    const scale = Math.min(
                        availableWidth / targetWidth,
                        availableHeight / targetHeight
                    );
                    
                    // Apply transform - GSAP is preferred if present (smoother)
                    if (window.gsap) {
                        gsap.set(stage, { 
                            scale: scale, 
                            transformOrigin: "center center",
                            x: 0, 
                            y: 0,
                            position: "relative" // Let flexbox handle centering
                        });
                    } else {
                        stage.style.transform = \`scale(\${scale})\`;
                        stage.style.transformOrigin = 'center center';
                        stage.style.position = 'relative'; 
                    }
                }
                
                window.addEventListener('load', fitStage);
                window.addEventListener('resize', fitStage);
                // Run immediately
                if (document.readyState === 'complete') fitStage();
                // Run again after a short delay to ensure DOM is ready
                setTimeout(fitStage, 50);
            })();
            
            const socket = io();
            socket.on('reload', () => window.location.reload());
            
            // === POSTMESSAGE BRIDGE FOR CROSS-ORIGIN COMMUNICATION ===
            (function() {
                let animationFrameId = null;
                
                // Wait for timeline to be ready
                function waitForTimeline(callback, maxAttempts = 50) {
                    let attempts = 0;
                    const check = () => {
                        attempts++;
                        if (window.masterTl) {
                            callback(window.masterTl);
                        } else if (attempts < maxAttempts) {
                            setTimeout(check, 100);
                        } else {
                            console.log('Timeline not found after max attempts');
                        }
                    };
                    check();
                }
                
                // Send scene info to parent when ready
                waitForTimeline((tl) => {
                    const metadata = window.sceneMetadata || null;
                    const duration = metadata ? metadata.totalDuration : tl.duration();
                    
                    window.parent.postMessage({
                        type: 'scene-ready',
                        metadata: metadata,
                        duration: duration
                    }, '*');
                    console.log('Scene ready, sent to parent:', duration);
                    
                    // RENDER MODE: Auto-play timeline when ?render=true is in URL
                    // This is required for timecut to capture animation frames
                    const urlParams = new URLSearchParams(window.location.search);
                    if (urlParams.get('render') === 'true') {
                        console.log('Render mode detected - starting timeline playback');
                        tl.play(0); // Start from beginning
                    }
                });
                
                // Report time updates to parent
                function reportTime() {
                    if (window.masterTl) {
                        window.parent.postMessage({
                            type: 'time-update',
                            currentTime: window.masterTl.time(),
                            isPlaying: window.masterTl.isActive()
                        }, '*');
                    }
                    animationFrameId = requestAnimationFrame(reportTime);
                }
                
                // Listen for commands from parent
                window.addEventListener('message', (event) => {
                    if (!window.masterTl) return;
                    
                    const data = event.data;
                    if (!data || !data.type) return;
                    
                    switch(data.type) {
                        case 'play':
                            window.masterTl.play();
                            if (!animationFrameId) reportTime();
                            break;
                        case 'pause':
                            window.masterTl.pause();
                            if (animationFrameId) {
                                cancelAnimationFrame(animationFrameId);
                                animationFrameId = null;
                            }
                            break;
                        case 'seek':
                            window.masterTl.seek(data.time);
                            window.masterTl.pause();
                            window.parent.postMessage({
                                type: 'time-update',
                                currentTime: data.time,
                                isPlaying: false
                            }, '*');
                            break;
                        case 'restart':
                            window.masterTl.restart();
                            if (!animationFrameId) reportTime();
                            break;
                        case 'speed':
                            window.masterTl.timeScale(data.value);
                            break;
                    }
                });
            })();
        </script>
        </body>
        `;
            res.send(data.replace('</body>', injection));
        });
    });

    // --- API: RENDER (One-way trigger) ---
    app.post('/api/render', (req, res) => {
        // TODO: Port the timecut spawn logic here
        // For now, mock it to verify connectivity
        ioInstance.emit('render-start');
        setTimeout(() => {
            ioInstance.emit('render-progress', 50);
        }, 1000);
        setTimeout(() => {
            ioInstance.emit('render-complete', { path: 'test.mp4' });
        }, 2000);
        res.json({ success: true, message: 'Render started (mock)' });
    });

    // --- SOCKET.IO ---
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: "*" } });

    io.on('connection', (socket) => {
        // console.log('Client connected', socket.id);
        socket.on('log', (data) => console.log('[Client Log]', data));
    });

    server.listen(port, () => {
        console.log(`Preview Server running on http://localhost:${port}`);
    });

    serverInstance = server;
    ioInstance = io;

    // Initial watcher setup
    setupWatcher();

    return { app, server, io };
}

function setupWatcher() {
    if (WATCHER) WATCHER.close();

    // Watch 'scenes' folder for changes
    const watchPath = path.join(PROJECT_ROOT, 'scenes');
    if (!fs.existsSync(watchPath)) return;

    WATCHER = chokidar.watch(watchPath, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true
    });

    WATCHER.on('change', (path) => {
        if (ioInstance) ioInstance.emit('reload');
    });

    WATCHER.on('add', () => { if (ioInstance) ioInstance.emit('file-list-update'); });
    WATCHER.on('unlink', () => { if (ioInstance) ioInstance.emit('file-list-update'); });
}

module.exports = { startServer };
