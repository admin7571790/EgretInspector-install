(function () {
    if (window.__egretPortGuardInstalled) {
        return;
    }
    window.__egretPortGuardInstalled = true;

    var chromeApi = window.chrome;
    if (!chromeApi || !chromeApi.runtime || typeof chromeApi.runtime.connect !== "function") {
        return;
    }

    var originalConnect = chromeApi.runtime.connect.bind(chromeApi.runtime);

    function installSafeWindowNameEval() {
        var devtoolsApi = chromeApi.devtools;
        var inspectedWindow = devtoolsApi && devtoolsApi.inspectedWindow;
        if (!inspectedWindow || typeof inspectedWindow.eval !== "function") {
            return;
        }

        var originalEval = inspectedWindow.eval.bind(inspectedWindow);
        inspectedWindow.eval = function (expression, options, callback) {
            var opts = options;
            var cb = callback;

            if (typeof opts === "function") {
                cb = opts;
                opts = undefined;
            }

            if (expression === "window.name") {
                if (typeof cb === "function") {
                    window.setTimeout(function () {
                        cb("", null);
                    }, 0);
                }
                return;
            }

            if (opts === undefined) {
                return originalEval(expression, cb);
            }

            return originalEval(expression, opts, cb);
        };
    }

    function createEventHub() {
        var listeners = [];

        function addListener(listener) {
            if (typeof listener !== "function") {
                return;
            }
            if (listeners.indexOf(listener) >= 0) {
                return;
            }
            listeners.push(listener);
        }

        function removeListener(listener) {
            var index = listeners.indexOf(listener);
            if (index >= 0) {
                listeners.splice(index, 1);
            }
        }

        function emit(payload) {
            listeners.slice().forEach(function (listener) {
                try {
                    listener(payload);
                } catch (error) {
                    // Keep the bridge alive even if one listener throws.
                }
            });
        }

        return {
            addListener: addListener,
            removeListener: removeListener,
            emit: emit
        };
    }

    function createResilientPort(args) {
        var messageHub = createEventHub();
        var disconnectHub = createEventHub();
        var currentPort = null;
        var reconnectTimer = null;
        var manuallyClosed = false;
        var reconnectDelayMs = 250;
        var pendingMessages = [];
        var stickyInitMessage = null;
        var stickyTabMessage = null;

        function cloneMessage(message) {
            try {
                return JSON.parse(JSON.stringify(message));
            } catch (error) {
                return message;
            }
        }

        function rememberStickyMessage(message) {
            if (!message || typeof message !== "object") {
                return;
            }

            if (typeof message.tabId === "number") {
                stickyTabMessage = cloneMessage(message);
                return;
            }

            var data = message.data;
            if (data && data.name === "init") {
                stickyInitMessage = cloneMessage(message);
            }
        }

        function trySendNow(message) {
            if (!currentPort) {
                return false;
            }

            try {
                currentPort.postMessage(message);
                return true;
            } catch (error) {
                currentPort = null;
                return false;
            }
        }

        function flushPending() {
            if (!currentPort || pendingMessages.length === 0) {
                return;
            }

            var queued = pendingMessages.slice();
            pendingMessages = [];

            for (var i = 0; i < queued.length; i += 1) {
                if (!trySendNow(queued[i])) {
                    pendingMessages = queued.slice(i).concat(pendingMessages);
                    scheduleReconnect();
                    break;
                }
            }
        }

        function replaySticky() {
            if (!currentPort) {
                return;
            }

            if (stickyTabMessage) {
                trySendNow(stickyTabMessage);
            }
            if (stickyInitMessage) {
                trySendNow(stickyInitMessage);
            }
        }

        function attachPort(port) {
            currentPort = port;
            if (!currentPort) {
                scheduleReconnect();
                return;
            }

            currentPort.onMessage.addListener(function (message) {
                messageHub.emit(message);
            });

            currentPort.onDisconnect.addListener(function (p) {
                disconnectHub.emit(p || currentPort);
                currentPort = null;
                scheduleReconnect();
            });

            replaySticky();
            flushPending();
        }

        function connectNow() {
            if (manuallyClosed) {
                return;
            }

            try {
                attachPort(originalConnect.apply(null, args));
            } catch (error) {
                scheduleReconnect();
            }
        }

        function scheduleReconnect() {
            if (manuallyClosed || reconnectTimer !== null) {
                return;
            }

            reconnectTimer = window.setTimeout(function () {
                reconnectTimer = null;
                connectNow();
            }, reconnectDelayMs);
        }

        connectNow();

        return {
            get name() {
                return currentPort && typeof currentPort.name === "string" ? currentPort.name : "";
            },
            onMessage: {
                addListener: messageHub.addListener,
                removeListener: messageHub.removeListener
            },
            onDisconnect: {
                addListener: disconnectHub.addListener,
                removeListener: disconnectHub.removeListener
            },
            postMessage: function (message) {
                if (manuallyClosed) {
                    return;
                }

                rememberStickyMessage(message);

                if (!trySendNow(message)) {
                    pendingMessages.push(cloneMessage(message));
                    scheduleReconnect();
                }
            },
            disconnect: function () {
                manuallyClosed = true;
                if (reconnectTimer !== null) {
                    window.clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
                try {
                    if (currentPort) {
                        currentPort.disconnect();
                    }
                } catch (error) {
                }
                currentPort = null;
            }
        };
    }

    chromeApi.runtime.connect = function () {
        var args = Array.prototype.slice.call(arguments);
        return createResilientPort(args);
    };

    installSafeWindowNameEval();
})();
