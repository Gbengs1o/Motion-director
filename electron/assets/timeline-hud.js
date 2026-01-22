(function () {
    // Headless Bridge - No UI, just sync
    // The UI is now in the parent (manager.html)

    let tl = null;
    let duration = 0;

    // 1. Initial Hook
    function checkForTimeline() {
        if (window.masterTl) {
            init(window.masterTl);
        } else {
            setTimeout(checkForTimeline, 100);
        }
    }

    function init(timeline) {
        tl = timeline;
        duration = tl.duration();

        // Detect Dimensions
        let width = 1920;
        let height = 1080;
        const stage = document.getElementById('stage');
        if (stage) {
            width = stage.offsetWidth;
            height = stage.offsetHeight;
        }

        // Check for Audio Config
        let audioConfig = window.audioConfig || null;

        // Notify Parent: Ready
        notifyParent('timeline:ready', {
            duration: duration,
            width: width,
            height: height,
            audioConfig: audioConfig
        });

        // Listen for updates (throttled to 30fps for performance)
        let lastUpdate = 0;
        tl.eventCallback("onUpdate", () => {
            const now = Date.now();
            if (now - lastUpdate < 33) return; // ~30fps
            lastUpdate = now;

            notifyParent('timeline:progress', {
                time: tl.time(),
                progress: tl.progress()
            });
            notifyParent('timeline:progress', {
                time: tl.time(),
                progress: tl.progress()
            });
        });

        tl.eventCallback("onComplete", () => {
            notifyParent('timeline:complete');
        });
    }

    // 2. Listen for Parent Commands
    window.addEventListener('message', (event) => {
        const cmd = event.data;
        if (!cmd.command || !tl) return;

        switch (cmd.command) {
            case 'timeline:play':
                tl.play();
                break;
            case 'timeline:pause':
                tl.pause();
                break;
            case 'timeline:seek':
                if (typeof cmd.time !== 'undefined') tl.time(cmd.time);
                else if (typeof cmd.progress !== 'undefined') tl.progress(cmd.progress);
                break;
            case 'timeline:loop':
                tl.repeat(cmd.value ? -1 : 0);
                break;
            case 'timeline:speed':
                tl.timeScale(cmd.value || 1);
                break;
        }
    });

    function notifyParent(command, payload = {}) {
        window.parent.postMessage({ command, ...payload }, '*');
    }

    checkForTimeline();
})();
