import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

const Terminal = () => {
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const fitAddonRef = useRef(null);

    useEffect(() => {
        // Safety check just in case
        if (!terminalRef.current) return;

        try {
            // Initialize XTerm with safer defaults
            const term = new XTerm({
                cursorBlink: true,
                fontFamily: '"Cascadia Code", "Fira Code", monospace',
                fontSize: 14,
                allowProposedApi: true,
                bg: '#000000',
                theme: {
                    background: '#000000',
                    foreground: '#cccccc',
                },
            });

            const fitAddon = new FitAddon();
            const webLinksAddon = new WebLinksAddon();

            term.loadAddon(fitAddon);
            term.loadAddon(webLinksAddon);

            term.open(terminalRef.current);

            // DEFER FIT: This is crucial. Wait for layout loop.
            setTimeout(() => {
                try {
                    fitAddon.fit();
                } catch (e) {
                    console.warn("Fit failed on init:", e);
                }
            }, 100);

            xtermRef.current = term;
            fitAddonRef.current = fitAddon;

            // Connect to Electron IPC
            if (window.electron && window.electron.terminal) {
                // 1. Send input to PTY
                term.onData((data) => {
                    window.electron.terminal.write(data);
                });

                // 2. Receive output from PTY
                const removeListener = window.electron.terminal.onData((data) => {
                    term.write(data);
                });

                // 3. Initialize PTY
                window.electron.terminal.init();

                // 4. Handle resize
                const handleResize = () => {
                    try {
                        fitAddon.fit();
                        if (term.cols && term.rows) {
                            window.electron.terminal.resize(term.cols, term.rows);
                        }
                    } catch (e) {
                        console.warn("Resize error:", e);
                    }
                };

                window.addEventListener('resize', handleResize);

                // ResizeObserver for specific container changes
                const resizeObserver = new ResizeObserver(() => {
                    // Debounce resize slightly?
                    requestAnimationFrame(() => handleResize());
                });
                resizeObserver.observe(terminalRef.current);

                // Cleanup
                return () => {
                    removeListener();
                    window.removeEventListener('resize', handleResize);
                    resizeObserver.disconnect();
                    term.dispose();
                };
            } else {
                term.writeln('Electron IPC not available. Terminal is in mock mode.');
            }
        } catch (err) {
            console.error("Terminal initialization failed:", err);
        }
    }, []);

    return <div className="w-full h-full" ref={terminalRef} style={{ minHeight: '100px', backgroundColor: 'black' }} />;
};

export default Terminal;
