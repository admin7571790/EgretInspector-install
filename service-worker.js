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
let devtoolsOpenHintUntil = 0;
let lastOpenExecuteAt = 0;

function getFirstLiveKey(mapLike) {
    if (!mapLike || mapLike.size === 0) {
        return null;
    }

    for (const key of mapLike.keys()) {
        if (portsByKey.get(key)) {
            return key;
        }
    }

    return null;
}

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
    if (mappedKey) {
        const mappedPort = portsByKey.get(mappedKey);
        if (mappedPort) {
            return mappedPort;
        }
    }

    const selfPort = portsByKey.get(key);
    const selfFrom = selfPort?._egretFrom;

    if (selfFrom === "stage") {
        const viewKey = getFirstLiveKey(viewUrls);
        if (viewKey) {
            bindMappedKeys(key, viewKey);
            return portsByKey.get(viewKey) || null;
        }
    }

    if (selfFrom === "view") {
        const stageKey = getFirstLiveKey(stageUrls);
        if (stageKey) {
            bindMappedKeys(stageKey, key);
            return portsByKey.get(stageKey) || null;
        }
    }

    return null;
}

function unmapKey(key) {
    if (!key) {
        return;
    }

    const peerKey = stageViewMapping.get(key);
    stageViewMapping.delete(key);

    if (peerKey && stageViewMapping.get(peerKey) === key) {
        stageViewMapping.delete(peerKey);
    }
}

function bindMappedKeys(stageKey, viewKey) {
    if (!stageKey || !viewKey || stageKey === viewKey) {
        return;
    }

    unmapKey(stageKey);
    unmapKey(viewKey);
    stageViewMapping.set(stageKey, viewKey);
    stageViewMapping.set(viewKey, stageKey);
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
        bindMappedKeys(targetKey, key);
    } else if (from === "stage") {
        const viewKey = getFirstLiveKey(viewUrls);
        if (viewKey) {
            bindMappedKeys(key, viewKey);
        }
    } else if (from === "view") {
        const stageKey = getFirstLiveKey(stageUrls);
        if (stageKey) {
            bindMappedKeys(stageKey, key);
        }
    }

    updateStageList();
}

function clearConnection(key, options = {}) {
    if (!key) {
        return;
    }

    const keepPeerMappingIfPeerAlive = options.keepPeerMappingIfPeerAlive === true;
    const mappedKey = stageViewMapping.get(key);

    portsByKey.delete(key);
    stageUrls.delete(key);
    viewUrls.delete(key);

    if (!mappedKey) {
        unmapKey(key);
    } else {
        const mappedPort = portsByKey.get(mappedKey);
        if (keepPeerMappingIfPeerAlive && mappedPort) {
            stageViewMapping.set(key, mappedKey);
            stageViewMapping.set(mappedKey, key);
        } else {
            unmapKey(key);
            unmapKey(mappedKey);
        }
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

    if (message?.devToolHidden === true) {
        devtoolsOpenHintUntil = 0;
    } else if (message?.devToolHidden === false) {
        devtoolsOpenHintUntil = Date.now() + 5000;
    }
}

function handleIsDevToolOpen(message, port, key) {
    const mappedKey = stageViewMapping.get(key);
    let isOpen = Boolean(mappedKey && portsByKey.get(mappedKey));

    if (!isOpen) {
        isOpen = Boolean(getFirstLiveKey(viewUrls));
    }

    if (!isOpen && Date.now() < devtoolsOpenHintUntil) {
        isOpen = true;
    }

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

    // Once stage is connected, ignore repeated open heartbeats from devtools.
    if (getFirstLiveKey(stageUrls)) {
        return;
    }

    const now = Date.now();
    if (now - lastOpenExecuteAt < 500) {
        return;
    }
    lastOpenExecuteAt = now;

    devtoolsOpenHintUntil = Date.now() + 5000;

    chrome.scripting.executeScript({
        target: { tabId: inspectedTabId },
        func: () => {
            try {
                window.postMessage({
                    from: "egret-inspector-content",
                    type: "start-inspect"
                }, "*");
            } catch (error) {
            }

            if (typeof window.startListen === "function") {
                try {
                    window.startListen();
                } catch (error) {
                }
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
        const from = port._egretFrom;
        notifyPeerDisconnected(key);
        clearConnection(key, {
            keepPeerMappingIfPeerAlive: from === "stage"
        });
    });
});
