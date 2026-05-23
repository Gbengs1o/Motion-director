const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const { startServer } = require('./server');

try {
    require('fs').appendFileSync(path.join(process.cwd(), '.motion-director-main-loaded.log'), `main loaded verify=${process.env.MOTION_DIRECTOR_VERIFY_RENDER || ''}\n`);
} catch {}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

let mainWindow;
const ptyShell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, '../build/icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: false, // Allow Node.js in renderer
            nodeIntegration: true,   // Allow Node.js in renderer
        },
    });

    // Load the local URL for development or the local file for production.
    // Load the index.html directly
    mainWindow.loadFile(path.join(__dirname, '../index.html'));

    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        console.log('[DEBUG] mainWindow closed');
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    startServer(3000); // Start Preview Server
    if (process.env.MOTION_DIRECTOR_VERIFY_RENDER === '1') {
        runRenderVerification()
            .then(() => app.quit())
            .catch((error) => {
                console.error(error);
                app.exit(1);
            });
        return;
    }
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    console.log('[DEBUG] window-all-closed triggered');
    if (renderEngine && renderEngine.isRendering) {
        console.log('[DEBUG] Render in progress; keeping app alive');
        return;
    }

    if (process.platform !== 'darwin') {
        console.log('[DEBUG] Quitting app from window-all-closed');
        app.quit();
    }
});

app.on('before-quit', () => {
    console.log('[DEBUG] before-quit triggered');
});

// --- PTY Logic ---
let ptyProcess = null;

ipcMain.on('terminal-init', (event, targetPath) => {
    if (ptyProcess) return;

    const pty = require('node-pty');
    const CWD = targetPath || process.cwd();

    ptyProcess = pty.spawn(ptyShell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: CWD,
        env: process.env,
    });

    ptyProcess.on('data', (data) => {
        if (mainWindow) {
            mainWindow.webContents.send('terminal-incoming', data);
        }
    });
});

ipcMain.on('terminal-input', (event, data) => {
    if (ptyProcess) {
        ptyProcess.write(data);
    }
});

ipcMain.on('terminal-resize', (event, { cols, rows }) => {
    if (ptyProcess) {
        ptyProcess.resize(cols, rows);
    }
});

ipcMain.handle('open-work-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Open Work Folder'
    });
    return result;
});

ipcMain.handle('create-work-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Folder to Create Work'
    });
    return result;
});

// [Deleted duplicate handlers: delete-scene, list-assets, open-asset-folder]

ipcMain.handle('open-file-dialog', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        title: 'Select Assets to Import'
    });
    return result;
});

ipcMain.handle('upload-assets', async (event, { workPath, sceneName, filePaths }) => {
    if (!workPath || !sceneName || !filePaths || filePaths.length === 0) return { success: false };

    const assetsDir = path.join(workPath, 'assets', sceneName);
    await fs.ensureDir(assetsDir);

    let count = 0;
    for (const srcPath of filePaths) {
        try {
            const fileName = path.basename(srcPath);
            const destPath = path.join(assetsDir, fileName);
            await fs.copy(srcPath, destPath);
            count++;
        } catch (e) {
            console.error(`Failed to copy ${srcPath}:`, e);
        }
    }
    return { success: true, count };
});
// --- Scene Management ---
const fs = require('fs-extra');

const AI_PROTOCOL_TEMPLATE_PATH = path.join(__dirname, 'AI_SCENE_PROTOCOL.template.md');

async function ensureAIProtocol(scenesDir) {
    try {
        await fs.ensureDir(scenesDir);
        const protocolPath = path.join(scenesDir, 'AI_SCENE_PROTOCOL.md');
        if (!await fs.pathExists(protocolPath)) {
            // Read template if not cached/loaded
            if (await fs.pathExists(AI_PROTOCOL_TEMPLATE_PATH)) {
                const content = await fs.readFile(AI_PROTOCOL_TEMPLATE_PATH, 'utf8');
                await fs.writeFile(protocolPath, content, 'utf8');
                console.log('Created AI_SCENE_PROTOCOL.md in', scenesDir);
            } else {
                console.error("Template file not found:", AI_PROTOCOL_TEMPLATE_PATH);
            }
        }
    } catch (error) {
        console.error('Failed to create AI protocol file:', error);
    }
}

ipcMain.handle('open-asset-folder', async (event, folderPath) => {
    // Renderer sends string: "C:\path\to\folder"
    if (!folderPath) return;
    await shell.openPath(folderPath);
});

// Update create-scene to ensure protocol
ipcMain.handle('create-scene', async (event, { workPath, sceneName }) => {
    if (!workPath || !sceneName) return { success: false, error: 'Missing path or name' };

    const assetsDir = path.join(workPath, 'assets', sceneName);
    const scenesDir = path.join(workPath, 'scenes');
    const sceneFile = path.join(scenesDir, sceneName + '.html');

    try {
        await fs.ensureDir(assetsDir);
        await fs.ensureDir(scenesDir);
        await ensureAIProtocol(scenesDir);

        const template = '<!DOCTYPE html>\n' +
            '<html lang="en">\n' +
            '<head>\n' +
            '    <meta charset="UTF-8">\n' +
            '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
            '    <title>' + sceneName + '</title>\n' +
            '    <!-- GSAP (Required) -->\n' +
            '    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>\n' +
            '    <script src="https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.3/howler.min.js"></script>\n' +
            '    <style>\n' +
            '        body { margin: 0; padding: 0; overflow: hidden; background: #000; color: white; font-family: \'Inter\', sans-serif; }\n' +
            '        #stage { width: 1920px; height: 1080px; position: relative; overflow: hidden; }\n' +
            '        .frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; }\n' +
            '        .center-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 80px; font-weight: bold; }\n' +
            '    </style>\n' +
            '</head>\n' +
            '<body>\n' +
            '    <div id="stage">\n' +
            '        <!-- FRAME 1 -->\n' +
            '        <div class="frame" id="frame1" data-frame="1" data-start="0" data-end="3">\n' +
            '            <h1 class="center-text" data-name="Title" data-type="on-frame">' + sceneName + '</h1>\n' +
            '        </div>\n' +
            '    </div>\n' +
            '\n' +
            '    <script>\n' +
            '        // --- 1. Scene Metadata (MANDATORY) ---\n' +
            '        window.sceneMetadata = {\n' +
            '            title: "' + sceneName + '",\n' +
            '            totalDuration: 3,\n' +
            '            audioFile: null,\n' +
            '            frames: [\n' +
            '                { id: 1, start: 0, end: 3, text: "Scene initialized." }\n' +
            '            ]\n' +
            '        };\n' +
            '\n' +
            '        // --- 2. GSAP Timeline (MANDATORY) ---\n' +
            '        const tl = gsap.timeline({ paused: true });\n' +
            '        window.masterTl = tl;\n' +
            '\n' +
            '        // Frame 1 Animation\n' +
            '        tl.addLabel("frame1", 0);\n' +
            '        tl.set("#frame1", { opacity: 1 }, 0);\n' +
            '        tl.from("#frame1 h1", { opacity: 0, y: 50, duration: 1, ease: "power2.out" }, 0);\n' +
            '        tl.to("#frame1", { opacity: 0, duration: 0.5 }, 2.5);\n' +
            '\n' +
            '        // --- 3. Audio Sync System (DO NOT REMOVE) ---\n' +
            '        console.log("Scene loaded: ' + sceneName + '");\n' +
            '    </script>\n' +
            '</body>\n' +
            '</html>';

        await fs.writeFile(sceneFile, template);
        return { success: true };

    } catch (error) {
        console.error("Create Scene Error:", error);
        return { success: false, error: error.message };
    }
});

// Update list-scenes to ensure protocol
ipcMain.handle('list-scenes', async (event, workPath) => {
    if (!workPath) return [];
    try {
        const scenesDir = path.join(workPath, 'scenes');
        if (!await fs.pathExists(scenesDir)) return [];

        await ensureAIProtocol(scenesDir); // Ensure protocol exists on list

        const files = await fs.readdir(scenesDir);
        return files.filter(f => f.endsWith('.html'));
    } catch (e) {
        console.error("List Scenes Error:", e);
        return [];
    }
});

ipcMain.handle('delete-scene', async (event, { workPath, sceneName }) => {
    if (!workPath || !sceneName) return { success: false, error: 'Missing path' };
    try {
        const sceneFile = path.join(workPath, 'scenes', `${sceneName}.html`);
        const assetsDir = path.join(workPath, 'assets', sceneName);

        // Delete both
        await fs.remove(sceneFile);
        await fs.remove(assetsDir);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('list-assets', async (event, { workPath, sceneName }) => {
    if (!workPath || !sceneName) return [];
    try {
        const assetsDir = path.join(workPath, 'assets', sceneName);
        if (!await fs.pathExists(assetsDir)) return [];
        return await fs.readdir(assetsDir);
    } catch (e) {
        return [];
    }
});

// =============================================================================
// RENDER ENGINE
// =============================================================================
const RenderEngine = require('./renderEngine');
let renderEngine = null;

async function runRenderVerification() {
    const outputPath = path.join(process.cwd(), '.render-test-output');
    await fs.remove(outputPath);

    const logPath = path.join(outputPath, 'verify-render.log');
    const log = async (message) => {
        await fs.ensureDir(outputPath);
        await fs.appendFile(logPath, `${new Date().toISOString()} ${message}\n`);
    };

    await log('verify start');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const engine = new RenderEngine({
        isDestroyed: () => false,
        send: async (_channel, data) => {
            await log(`progress ${JSON.stringify(data)}`);
        }
    });
    renderEngine = engine;

    const result = await engine.startRender({
        sceneUrl: 'http://localhost:3000/scene/test-audio-scene.html',
        outputPath,
        sceneName: 'smoke-test',
        format: 'mp4',
        resolution: '320x180',
        fps: 5,
        startTime: 0,
        duration: 0,
        includeAudio: false,
        audioPath: null
    });

    const stat = await fs.stat(result);
    await log(`render verified ${result} ${stat.size}`);
}

ipcMain.handle('select-output-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Output Folder'
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('start-render', async (event, options) => {
    try {
        if (!renderEngine) {
            renderEngine = new RenderEngine(mainWindow.webContents);
        }

        const result = await renderEngine.startRender(options);
        return { success: true, outputPath: result };
    } catch (error) {
        console.error('Render error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('abort-render', async () => {
    if (renderEngine) {
        renderEngine.abort();
        return { success: true };
    }
    return { success: false, error: 'No render in progress' };
});

ipcMain.handle('open-render-output', async (event, outputPath) => {
    if (outputPath) {
        await shell.showItemInFolder(outputPath);
    }
});
