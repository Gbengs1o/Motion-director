/**
 * Render Engine Module
 * Handles background rendering of scenes to video or image sequences
 */

const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');

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
        const isVideo = ['mp4', 'webm'].includes(format);
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
            const totalDuration = duration || 10; // Default 10s if not specified
            const totalFrames = Math.ceil(totalDuration * fps);

            this.sendProgress({
                status: 'rendering',
                percent: 0,
                label: 'Capturing frames...',
                currentFrame: 0,
                totalFrames
            });

            // Use timecut for frame capture
            // Add ?render=true to trigger auto-play in scene
            const renderUrl = sceneUrl + (sceneUrl.includes('?') ? '&' : '?') + 'render=true';
            const timecutArgs = [
                require.resolve('timecut/cli.js'),
                renderUrl,
                '--output', path.join(framesDir, 'frame-%05d.png'),
                '--viewport', `${width},${height}`,
                '--fps', fps.toString(),
                '--start', startTime.toString(),
                '--duration', totalDuration.toString(),
                '--launch-arguments', '--no-sandbox --disable-setuid-sandbox'
            ];

            // Run timecut
            await this.runTimecutWithProgress(timecutArgs, totalFrames, framesDir);

            if (this.shouldAbort) {
                this.sendProgress({ status: 'aborted', percent: 0, label: 'Render cancelled' });
                this.cleanup(outputDir);
                return null;
            }

            // For image sequence, we're done
            if (isImageSequence) {
                // Rename/convert frames if needed
                if (format === 'jpeg') {
                    await this.convertFramesToJpeg(framesDir);
                }

                this.sendProgress({
                    status: 'complete',
                    percent: 100,
                    label: 'Render complete!',
                    outputPath: framesDir
                });

                this.isRendering = false;
                return framesDir;
            }

            // For video, use FFmpeg to encode
            this.sendProgress({ status: 'encoding', percent: 90, label: 'Encoding video...' });

            const outputFile = path.join(outputDir, `${sceneName}.${format}`);
            await this.encodeVideo(framesDir, outputFile, format, fps, includeAudio, audioPath);

            if (this.shouldAbort) {
                this.sendProgress({ status: 'aborted', percent: 0, label: 'Render cancelled' });
                return null;
            }

            // Clean up frames
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

    async runTimecutWithProgress(args, totalFrames, framesDir) {
        return new Promise((resolve, reject) => {
            const process = spawn('node', args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.currentProcess = process;
            let frameCount = 0;

            // Check frame output periodically
            const checkInterval = setInterval(async () => {
                if (this.shouldAbort) {
                    process.kill('SIGTERM');
                    clearInterval(checkInterval);
                    return;
                }

                try {
                    const files = await fs.readdir(framesDir);
                    const pngFiles = files.filter(f => f.endsWith('.png'));
                    if (pngFiles.length > frameCount) {
                        frameCount = pngFiles.length;
                        const percent = Math.min(85, Math.round((frameCount / totalFrames) * 85));
                        this.sendProgress({
                            status: 'rendering',
                            percent,
                            label: 'Capturing frames...',
                            currentFrame: frameCount,
                            totalFrames
                        });
                    }
                } catch (e) {
                    // Ignore errors during check
                }
            }, 500);

            process.on('close', (code) => {
                clearInterval(checkInterval);
                this.currentProcess = null;
                if (code === 0 || this.shouldAbort) {
                    resolve();
                } else {
                    reject(new Error(`Timecut exited with code ${code}`));
                }
            });

            process.on('error', (err) => {
                clearInterval(checkInterval);
                this.currentProcess = null;
                reject(err);
            });

            // Capture stderr for debugging
            process.stderr.on('data', (data) => {
                console.log('Timecut stderr:', data.toString());
            });
        });
    }

    async encodeVideo(framesDir, outputFile, format, fps, includeAudio, audioPath) {
        return new Promise((resolve, reject) => {
            const ffmpegArgs = [
                '-y', // Overwrite output
                '-framerate', fps.toString(),
                '-i', path.join(framesDir, 'frame-%05d.png')
            ];

            // Add audio if requested and available
            if (includeAudio && audioPath && fs.existsSync(audioPath)) {
                ffmpegArgs.push('-i', audioPath);
                ffmpegArgs.push('-c:a', 'aac');
                ffmpegArgs.push('-shortest');
            }

            // Video encoding options
            if (format === 'mp4') {
                ffmpegArgs.push('-c:v', 'libx264');
                ffmpegArgs.push('-pix_fmt', 'yuv420p');
                ffmpegArgs.push('-preset', 'medium');
                ffmpegArgs.push('-crf', '18');
            } else if (format === 'webm') {
                ffmpegArgs.push('-c:v', 'libvpx-vp9');
                ffmpegArgs.push('-b:v', '0');
                ffmpegArgs.push('-crf', '30');
            }

            ffmpegArgs.push(outputFile);

            const process = spawn('ffmpeg', ffmpegArgs, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.currentProcess = process;

            process.on('close', (code) => {
                this.currentProcess = null;
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg exited with code ${code}`));
                }
            });

            process.on('error', (err) => {
                this.currentProcess = null;
                if (err.code === 'ENOENT') {
                    reject(new Error('FFmpeg not found. Please install FFmpeg and add it to your PATH.'));
                } else {
                    reject(err);
                }
            });

            process.stderr.on('data', (data) => {
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
