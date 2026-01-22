(function () {
    let active = false;
    let hoveredElement = null;
    let overlay = null;
    let infoBox = null;

    // Listen for messages from parent
    window.addEventListener('message', (event) => {
        if (event.data.command === 'toggleInspector') {
            toggleInspector(event.data.state);
        }
    });

    function toggleInspector(state) {
        active = state;
        const hud = document.getElementById('motion-director-hud');

        if (active) {
            initOverlay();
            document.body.style.cursor = 'crosshair';
            document.addEventListener('mouseover', handleHover);
            document.addEventListener('click', handleClick, true);

            // Disable HUD interaction while inspecting
            if (hud) hud.style.pointerEvents = 'none';
        } else {
            removeOverlay();
            document.body.style.cursor = 'default';
            document.removeEventListener('mouseover', handleHover);
            document.removeEventListener('click', handleClick, true);

            // Re-enable HUD
            if (hud) hud.style.pointerEvents = 'auto';
        }
    }

    function initOverlay() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.style.position = 'absolute';
        overlay.style.border = '2px solid #00aaff';
        overlay.style.backgroundColor = 'rgba(0, 170, 255, 0.2)';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '2147483647';
        overlay.style.display = 'none';
        document.body.appendChild(overlay);
    }

    function removeOverlay() {
        if (overlay) overlay.remove();
        overlay = null;
    }

    function handleHover(e) {
        if (!active) return;
        e.stopPropagation();
        hoveredElement = e.target;

        // Skip inspector UI specific checks as we removed infoBox, but keep safety
        if (e.target === overlay) return;

        const rect = hoveredElement.getBoundingClientRect();
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        overlay.style.top = (rect.top + window.scrollY) + 'px';
        overlay.style.left = (rect.left + window.scrollX) + 'px';
        overlay.style.display = 'block';
    }

    function handleClick(e) {
        if (!active) return;
        e.preventDefault();
        e.stopPropagation();

        const el = e.target;

        // 1. Get Element Info
        let name = el.getAttribute('data-name') || el.tagName.toLowerCase();
        let selector = el.id ? `#${el.id}` : el.tagName.toLowerCase();

        // 2. Notify Parent (Manager) to handle the UI
        window.parent.postMessage({
            command: 'inspector:elementSelected',
            selector: selector,
            id: el.id,
            name: name
        }, '*');
    }

    // REMOVE window.copyContext as we use direct listeners now

})();
