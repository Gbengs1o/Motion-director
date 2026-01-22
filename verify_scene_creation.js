const http = require('http');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3000/api/scenes';
const SCENE_NAME = 'test-scene-creation';

const postData = JSON.stringify({
    name: SCENE_NAME
});

const options = {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

const req = http.request(API_URL, options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
    res.on('end', () => {
        // Verify File System
        const scenesDir = path.join(process.cwd(), 'scenes');
        const assetsDir = path.join(process.cwd(), 'assets', SCENE_NAME);
        const sceneFile = path.join(scenesDir, SCENE_NAME + '.html');

        console.log('--- Verification ---');

        let success = true;

        if (fs.existsSync(sceneFile)) {
            console.log('[PASS] Scene file created: ' + sceneFile);
        } else {
            console.log('[FAIL] Scene file NOT created: ' + sceneFile);
            success = false;
        }

        if (fs.existsSync(assetsDir)) {
            console.log('[PASS] Asset folder created: ' + assetsDir);
        } else {
            console.log('[FAIL] Asset folder NOT created: ' + assetsDir);
            success = false;
        }

        if (success) {
            console.log('Test Passed!');
            // Cleanup
            try {
                fs.unlinkSync(sceneFile);
                fs.rmdirSync(assetsDir);
                console.log('Cleanup successful.');
            } catch (e) {
                console.log('Cleanup failed:', e.message);
            }
        } else {
            console.log('Test Failed!');
        }
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(postData);
req.end();
