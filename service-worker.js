const defaultInitOptions = {
    highlightClick: false,
    highlightHover: false,
    preventTouch: false,
    showMethods: false,
    showPrivate: true
};

const portsByKey = new Map();
const stageUrls = new Map();
const viewUrls = new Map();
const stageViewMapping = new Map();
let indexPort = null;
let inspectedTabId = null;

function safeDecode(value) {
    if (typeof value !== "string") {
        return "";
    }

    try {
        return decodeURIComponent(value);
    } catch (error) {
        return value;
    }
}

function getMappedPort(key) {
    const mappedKey = stageViewMapping.get(key);
    return mappedKey ? portsByKey.get(mappedKey) : null;
}

function updateStageList() {
    if (!indexPort) {
        return;
    }

    const stages = Object.fromEntries(stageUrls);

    try {
        indexPort.postMessage({
            data: {
                name: "stageListUpdated",
                stages
            }
        });
    } catch (error) {
        indexPort = null;
    }
}

function saveConnection(message, port) {
    const from = message?.data?.from;
    const key = safeDecode(message?.key);
    const targetKey = safeDecode(message?.data?.targetKey);
    const href = typeof message?.data?.href === "string" ? message.data.href : "";

    if (!from || !key) {
        return;
    }

    port._egretKey = key;
    port._egretFrom = from;
    portsByKey.set(key, port);

    if (from === "stage") {
        stageUrls.set(key, href);
    } else if (from === "view") {
        viewUrls.set(key, href);
    }

    if (targetKey) {
        stageViewMapping.set(targetKey, key);
        stageViewMapping.set(key, targetKey);
    }

    updateStageList();
}

function clearConnection(key) {
    if (!key) {
        return;
    }

    const mappedKey = stageViewMapping.get(key);

    portsByKey.delete(key);
    stageUrls.delete(key);
    viewUrls.delete(key);
    stageViewMapping.delete(key);

    if (mappedKey) {
        stageViewMapping.delete(mappedKey);
    }

    updateStageList();
}

function notifyPeerDisconnected(key) {
    if (!key) {
        return;
    }

    const peerPort = getMappedPort(key);
    if (!peerPort) {
        return;
    }

    try {
        peerPort.postMessage({
            data: {
                name: "initOptions",
                ...defaultInitOptions
            },
            key
        });
    } catch (error) {
        const peerKey = stageViewMapping.get(key);
        clearConnection(peerKey);
    }
}

function handleDevtoolsBridgeMessage(message) {
    if (typeof message?.tabId === "number") {
        inspectedTabId = message.tabId;
    }
}

function handleIsDevToolOpen(message, port, key) {
    const mappedKey = stageViewMapping.get(key);
    const isOpen = Boolean(mappedKey && portsByKey.get(mappedKey));

    port.postMessage({
        id: message.id,
        toContent: true,
        data: isOpen
    });
}

function handleOpenMessage(message) {
    if (!message?.open || typeof inspectedTabId !== "number") {
        return;
    }

    chrome.scripting.executeScript({
        target: { tabId: inspectedTabId },
        func: () => {
            if (typeof window.startListen === "function") {
                window.startListen();
            }
        }
    }).catch(() => {
        // Ignore legacy open messages when the inspected page is not ready.
    });
}

chrome.runtime.onConnect.addListener((port) => {
    port.onMessage.addListener((message = {}) => {
        const key = safeDecode(message.key);

        if (key) {
            message.key = key;
        }

        if (message?.data?.name === "init") {
            saveConnection(message, port);
        }

        if (message?.data?.type === "index") {
            indexPort = port;
            updateStageList();
        }

        if (!message.data) {
            handleDevtoolsBridgeMessage(message);
        }

        if (message?.data?.name === "isDevToolOpen") {
            handleIsDevToolOpen(message, port, key);
        }

        handleOpenMessage(message);

        const mappedPort = getMappedPort(key);
        if (!mappedPort) {
            return;
        }

        try {
            mappedPort.postMessage(message);
        } catch (error) {
            const mappedKey = stageViewMapping.get(key);
            clearConnection(mappedKey);
        }
    });

    port.onDisconnect.addListener(() => {
        if (indexPort === port) {
            indexPort = null;
        }

        const key = port._egretKey || safeDecode(port.name);
        notifyPeerDisconnected(key);
        clearConnection(key);
    });
});
