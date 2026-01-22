const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    terminal: {
        init: () => ipcRenderer.send('terminal-init'),
        onData: (callback) => {
            const subscription = (_event, data) => callback(data);
            ipcRenderer.on('terminal-incoming', subscription);
            return () => {
                ipcRenderer.removeListener('terminal-incoming', subscription);
            };
        },
        write: (data) => ipcRenderer.send('terminal-input', data),
        resize: (cols, rows) => ipcRenderer.send('terminal-resize', { cols, rows }),
    },
});
