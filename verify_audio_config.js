const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3000/api/scenes';
const SCENE_NAME = 'test-audio-scene.html'; // Use HTML extension as expected by API logic
const SCENE_SAFE_NAME = 'test-audio-scene';

// 1. Create Scene first
function createScene() {
    const postData = JSON.stringify({ name: SCENE_SAFE_NAME });
    const req = http.request(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    }, (res) => {
        res.on('end', () => {
            console.log('Scene created.');
            testAudioConfig();
        });
        res.resume();
    });
    req.write(postData);
    req.end();
}

function testAudioConfig() {
    console.log('Testing Audio Config...');
    const audioData = JSON.stringify({
        audioFile: 'test.mp3',
        startTime: 5,
        duration: 10
    });

    // POST Audio Config
    const req = http.request(`${API_BASE}/${SCENE_NAME}/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(audioData) }
    }, (res) => {
        res.on('end', () => {
            console.log('Audio config saved. Verifying...');

            // GET Audio Config
            http.get(`${API_BASE}/${SCENE_NAME}/audio`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    const config = JSON.parse(data);
                    if (config.audioFile === 'test.mp3' && config.startTime === 5) {
                        console.log('[PASS] Audio config verified!');
                    } else {
                        console.log('[FAIL] Audio config mismatch:', config);
                    }
                    cleanup();
                });
            });
        });
        res.resume();
    });
    req.write(audioData);
    req.end();
}

function cleanup() {
    // DELETE Scene
    const req = http.request(`${API_BASE}/${SCENE_NAME}`, { method: 'DELETE' }, (res) => {
        console.log('Cleanup complete.');
    });
    req.end();
}

createScene();
