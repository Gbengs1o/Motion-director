const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const { startServer } = require('./electron/server');
const RenderEngine = require('./electron/renderEngine');

const logPath = path.join(process.cwd(), '.render-test-output', 'verify-render.log');

function log(message) {
    fs.ensureDirSync(path.dirname(logPath));
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
}

async function main() {
    log('verify start');
    const outputPath = path.join(process.cwd(), '.render-test-output');
    await fs.remove(outputPath);
    log('output cleared');

    startServer(3000);
    log('server started');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const engine = new RenderEngine({
        isDestroyed: () => false,
        send: (_channel, data) => {
            log(`progress ${JSON.stringify(data)}`);
            if (data.status === 'complete' || data.status === 'error') {
                console.log(JSON.stringify(data));
            }
        }
    });

    const result = await engine.startRender({
        sceneUrl: 'http://localhost:3000/scene/test-audio-scene.html',
        outputPath,
        sceneName: 'smoke-test',
        format: 'mp4',
        resolution: '320x180',
        fps: 5,
        startTime: 0,
        duration: 0.5,
        includeAudio: false,
        audioPath: null
    });

    const stat = await fs.stat(result);
    log(`render verified ${result} ${stat.size}`);
    console.log(`Render verified: ${result} (${stat.size} bytes)`);
}

app.whenReady()
    .then(main)
    .then(() => app.quit())
    .catch((error) => {
        log(error && error.stack || String(error));
        console.error(error);
        app.exit(1);
    });
