/**
 * Render Engine Module
 * Handles background rendering of scenes to video or image sequences
 */

const path = require('path');
const fs = require('fs-extra');
const { spawn, spawnSync } = require('child_process');

function canRunExecutable(candidate) {
    if (!candidate) return false;
    if (candidate !== 'ffmpeg' && !fs.existsSync(candidate)) return false;

    const result = spawnSync(candidate, ['-version'], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 5000
    });

    return !result.error && result.status === 0;
}

function getFfmpegExecutable() {
    if (process.env.FFMPEG_BIN && canRunExecutable(process.env.FFMPEG_BIN)) {
        return process.env.FFMPEG_BIN;
    }

    const bundledCandidates = [
        process.resourcesPath ? path.join(process.resourcesPath, 'ffmpeg.exe') : null,
        path.join(__dirname, '../build/ffmpeg.exe')
    ];

    const bundledExecutable = bundledCandidates.find((candidate) => candidate && fs.existsSync(candidate));
    if (bundledExecutable) {
        return bundledExecutable;
    }

    const candidates = [];

    try {
        const staticPath = require('ffmpeg-static');
        candidates.push(staticPath);
        candidates.push(staticPath && staticPath.replace('app.asar', 'app.asar.unpacked'));
    } catch {
        // Fall back to a system FFmpeg below.
    }

    candidates.push('ffmpeg');
    return candidates.find(canRunExecutable);
}

class RenderEngine {
    constructor(webContents) {
        this.webContents = webContents;
        this.isRendering = false;
        this.shouldAbort = false;
        this.currentProcess = null;
    }

    /**
     * Start a render job
     * @param {Object} options - Render options
     * @param {string} options.sceneUrl - URL of the scene to render
     * @param {string} options.outputPath - Output directory
     * @param {string} options.sceneName - Name of the scene
     * @param {string} options.format - Output format (mp4, webm, png, jpeg)
     * @param {string} options.resolution - Resolution (e.g., "1920x1080")
     * @param {number} options.fps - Frames per second
     * @param {number} options.startTime - Start time in seconds
     * @param {number} options.duration - Duration in seconds (0 = full scene)
     * @param {boolean} options.includeAudio - Whether to include audio
     * @param {string} options.audioPath - Path to audio file (if any)
     */
    async startRender(options) {
        if (this.isRendering) {
            throw new Error('A render is already in progress');
        }

        this.isRendering = true;
        this.shouldAbort = false;

        const {
            sceneUrl,
            outputPath,
            sceneName,
            format,
            resolution,
            fps,
            startTime = 0,
            duration,
            includeAudio,
            audioPath
        } = options;

        const [width, height] = resolution.split('x').map(Number);
        const isImageSequence = ['png', 'jpeg'].includes(format);

        // Create output directory
        const outputDir = path.join(outputPath, `${sceneName}_render`);
        await fs.ensureDir(outputDir);

        // Frame output directory
        const framesDir = path.join(outputDir, 'frames');
        await fs.ensureDir(framesDir);

        try {
            this.sendProgress({ status: 'preparing', percent: 0, label: 'Preparing render...' });

            // Calculate total frames
            const totalDuration = duration > 0
                ? duration
                : await this.resolveSceneDuration(this.buildRenderUrl(sceneUrl), width, height);
            const totalFrames = Math.ceil(totalDuration * fps);

            this.sendProgress({
                status: 'rendering',
                percent: 0,
                label: 'Capturing frames...',
                currentFrame: 0,
                totalFrames
            });

            const ffmpegExecutable = getFfmpegExecutable();

            if (!ffmpegExecutable) {
                throw new Error('FFmpeg not found or could not be started. Reinstall Motion Director or set FFMPEG_BIN to a working ffmpeg.exe.');
            }

            if (isImageSequence) {
                await this.captureFrames({
                    sceneUrl: this.buildRenderUrl(sceneUrl),
                    framesDir,
                    frameFormat: format,
                    width,
                    height,
                    fps,
                    startTime,
                    totalFrames
                });

                this.sendProgress({
                    status: 'complete',
                    percent: 100,
                    label: 'Render complete!',
                    outputPath: framesDir
                });

                this.isRendering = false;
                return framesDir;
            }

            const outputFile = path.join(outputDir, `${sceneName}.${format}`);
            const silentOutputFile = includeAudio && audioPath ? path.join(outputDir, `${sceneName}.silent.${format}`) : outputFile;

            await this.captureFrames({
                sceneUrl: this.buildRenderUrl(sceneUrl),
                framesDir,
                frameFormat: 'png',
                width,
                height,
                fps,
                startTime,
                totalFrames
            });

            this.sendProgress({ status: 'encoding', percent: 88, label: 'Encoding video...' });
            await this.encodeVideo(framesDir, silentOutputFile, format, fps, ffmpegExecutable, width, height);

            if (this.shouldAbort) {
                this.sendProgress({ status: 'aborted', percent: 0, label: 'Render cancelled' });
                this.cleanup(outputDir);
                return null;
            }

            if (includeAudio && audioPath && fs.existsSync(audioPath)) {
                this.sendProgress({ status: 'encoding', percent: 90, label: 'Muxing audio...' });
                await this.muxAudio(silentOutputFile, outputFile, format, audioPath, ffmpegExecutable);
                await fs.remove(silentOutputFile);
            }

            if (this.shouldAbort) {
                this.sendProgress({ status: 'aborted', percent: 0, label: 'Render cancelled' });
                return null;
            }

            await fs.remove(framesDir);

            this.sendProgress({
                status: 'complete',
                percent: 100,
                label: 'Render complete!',
                outputPath: outputFile
            });

            this.isRendering = false;
            return outputFile;

        } catch (error) {
            console.error('Render error:', error);
            this.sendProgress({
                status: 'error',
                percent: 0,
                label: 'Render failed: ' + error.message
            });
            this.isRendering = false;
            throw error;
        }
    }

    buildRenderUrl(sceneUrl) {
        return sceneUrl + (sceneUrl.includes('?') ? '&' : '?') + 'render=true';
    }

    async resolveSceneDuration(sceneUrl, width, height) {
        const { BrowserWindow } = require('electron');
        const win = new BrowserWindow({
            show: false,
            width,
            height,
            useContentSize: true,
            webPreferences: {
                backgroundThrottling: false,
                offscreen: true,
                contextIsolation: true,
                nodeIntegration: false
            }
        });

        try {
            win.webContents.setAudioMuted(true);
            await win.loadURL(sceneUrl);
            await this.waitForTimeline(win);
            const duration = await win.webContents.executeJavaScript(`
                Number(
                    (window.sceneMetadata && window.sceneMetadata.totalDuration) ||
                    (window.masterTl && window.masterTl.duration && window.masterTl.duration()) ||
                    10
                );
            `);
            return Number.isFinite(duration) && duration > 0 ? duration : 10;
        } finally {
            if (!win.isDestroyed()) {
                win.destroy();
            }
        }
    }

    async captureFrames({ sceneUrl, framesDir, frameFormat, width, height, fps, startTime, totalFrames }) {
        const { BrowserWindow } = require('electron');
        if (!BrowserWindow) {
            throw new Error('Electron BrowserWindow is unavailable. Render from the Motion Director app, not plain Node.');
        }

        const win = new BrowserWindow({
            show: false,
            width,
            height,
            useContentSize: true,
            webPreferences: {
                backgroundThrottling: false,
                offscreen: true,
                contextIsolation: true,
                nodeIntegration: false
            }
        });

        try {
            win.webContents.setAudioMuted(true);
            await win.loadURL(sceneUrl);
            await this.waitForTimeline(win);

            await win.webContents.executeJavaScript(`
                if (window.Howler) {
                    window.Howler.mute(true);
                }
                window.masterTl.pause(0);
                true;
            `);

            const extension = frameFormat === 'jpeg' ? 'jpg' : 'png';
            const screenshotType = frameFormat === 'jpeg' ? 'jpeg' : 'png';

            for (let frame = 0; frame < totalFrames; frame++) {
                if (this.shouldAbort) {
                    break;
                }

                const currentTime = startTime + frame / fps;
                await win.webContents.executeJavaScript(`
                    window.masterTl.pause();
                    window.masterTl.seek(${JSON.stringify(currentTime)}, false);
                    window.dispatchEvent(new CustomEvent('motion-director:render-frame', { detail: { time: ${JSON.stringify(currentTime)} } }));
                    true;
                `);

                const fileName = `frame-${String(frame + 1).padStart(5, '0')}.${extension}`;
                const image = await win.webContents.capturePage();
                const buffer = screenshotType === 'jpeg' ? image.toJPEG(92) : image.toPNG();
                await fs.writeFile(path.join(framesDir, fileName), buffer);

                this.sendProgress({
                    status: 'rendering',
                    percent: Math.min(85, Math.round(((frame + 1) / totalFrames) * 85)),
                    label: 'Capturing frames...',
                    currentFrame: frame + 1,
                    totalFrames
                });
            }
        } finally {
            if (!win.isDestroyed()) {
                win.destroy();
            }
        }
    }

    async waitForTimeline(win) {
        const started = Date.now();
        while (Date.now() - started < 15000) {
            const ready = await win.webContents.executeJavaScript('Boolean(window.masterTl)');
            if (ready) return;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('Scene did not expose window.masterTl within 15 seconds.');
    }

    async encodeVideo(framesDir, outputFile, format, fps, ffmpegExecutable, width, height) {
        return new Promise((resolve, reject) => {
            const outputWidth = Math.max(2, Math.floor(width / 2) * 2);
            const outputHeight = Math.max(2, Math.floor(height / 2) * 2);
            const ffmpegArgs = [
                '-y',
                '-framerate', fps.toString(),
                '-i', path.join(framesDir, 'frame-%05d.png'),
                '-vf', `scale=${outputWidth}:${outputHeight}:flags=lanczos,setsar=1`
            ];

            if (format === 'mp4') {
                ffmpegArgs.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '18');
            } else if (format === 'webm') {
                ffmpegArgs.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30');
            }

            ffmpegArgs.push(outputFile);

            const child = spawn(ffmpegExecutable, ffmpegArgs, {
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
            });

            this.currentProcess = child;

            child.on('close', (code) => {
                this.currentProcess = null;
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg exited with code ${code}`));
                }
            });

            child.on('error', (err) => {
                this.currentProcess = null;
                if (err.code === 'ENOENT' || err.code === 'UNKNOWN') {
                    reject(new Error('FFmpeg could not be started. Reinstall Motion Director or set FFMPEG_BIN to a working ffmpeg.exe.'));
                } else {
                    reject(err);
                }
            });

            child.stderr.on('data', (data) => {
                console.log('FFmpeg:', data.toString());
            });
        });
    }

    async muxAudio(videoPath, outputFile, format, audioPath, ffmpegExecutable) {
        return new Promise((resolve, reject) => {
            const ffmpegArgs = [
                '-y',
                '-i', videoPath,
                '-i', audioPath,
                '-map', '0:v:0',
                '-map', '1:a:0',
                '-c:v', 'copy',
                '-shortest'
            ];

            if (format === 'mp4') {
                ffmpegArgs.push('-c:a', 'aac');
            } else if (format === 'webm') {
                ffmpegArgs.push('-c:a', 'libopus');
            }

            ffmpegArgs.push(outputFile);

            const child = spawn(ffmpegExecutable, ffmpegArgs, {
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
            });

            this.currentProcess = child;

            child.on('close', (code) => {
                this.currentProcess = null;
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg exited with code ${code}`));
                }
            });

            child.on('error', (err) => {
                this.currentProcess = null;
                if (err.code === 'ENOENT' || err.code === 'UNKNOWN') {
                    reject(new Error('FFmpeg could not be started. Reinstall Motion Director or set FFMPEG_BIN to a working ffmpeg.exe.'));
                } else {
                    reject(err);
                }
            });

            child.stderr.on('data', (data) => {
                console.log('FFmpeg:', data.toString());
            });
        });
    }

    async convertFramesToJpeg(framesDir) {
        const files = await fs.readdir(framesDir);
        for (const file of files) {
            if (file.endsWith('.png')) {
                const pngPath = path.join(framesDir, file);
                const jpegPath = path.join(framesDir, file.replace('.png', '.jpg'));
                // Use FFmpeg for conversion
                await new Promise((resolve, reject) => {
                    const process = spawn('ffmpeg', ['-y', '-i', pngPath, jpegPath]);
                    process.on('close', (code) => {
                        if (code === 0) {
                            fs.removeSync(pngPath);
                            resolve();
                        } else {
                            resolve(); // Keep PNG if conversion fails
                        }
                    });
                    process.on('error', () => resolve());
                });
            }
        }
    }

    abort() {
        this.shouldAbort = true;
        if (this.currentProcess) {
            this.currentProcess.kill('SIGTERM');
        }
    }

    sendProgress(data) {
        if (this.webContents && !this.webContents.isDestroyed()) {
            this.webContents.send('render-progress', data);
        }
    }

    async cleanup(dir) {
        try {
            await fs.remove(dir);
        } catch (e) {
            console.error('Cleanup error:', e);
        }
        this.isRendering = false;
    }
}

module.exports = RenderEngine;
