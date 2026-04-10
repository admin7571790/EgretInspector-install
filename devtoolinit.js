// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// Disabled Elements sidebar runtime-eval path to avoid stale-context
// Runtime.evaluate failures during page reload (uniqueContextId not found).
//(function () {    var t = window.setInterval(function () { var a = egret && (window.clearInterval(t) || egret.devtool.start()); console.log("waiting") }, 100);egret && egret.devtool && (window.clearInterval(t) || egret.devtool.start());})();
chrome.devtools.panels.create("Egret", "icon.png", "ipt/panel/index.html", function (panel) {
    var backgroundPageConnection = null;
    var reconnectTimer = null;
    var openHeartbeatTimer = null;

    function scheduleReconnect() {
        if (reconnectTimer !== null) {
            return;
        }

        reconnectTimer = window.setTimeout(function () {
            reconnectTimer = null;
            ensureBackgroundConnection();
        }, 250);
    }

    function ensureBackgroundConnection() {
        if (backgroundPageConnection) {
            return backgroundPageConnection;
        }

        try {
            var connection = chrome.runtime.connect({
                name: btoa("for" + String(chrome.devtools.inspectedWindow.tabId))
            });

            connection.onMessage.addListener(function (message) {
                // Handle responses from the background page, if any
            });

            connection.onDisconnect.addListener(function () {
                if (backgroundPageConnection === connection) {
                    backgroundPageConnection = null;
                    scheduleReconnect();
                }
            });

            backgroundPageConnection = connection;
            backgroundPageConnection.postMessage({
                tabId: chrome.devtools.inspectedWindow.tabId
            });
        } catch (error) {
            backgroundPageConnection = null;
            scheduleReconnect();
        }

        return backgroundPageConnection;
    }

    function postToBackground(message) {
        ensureBackgroundConnection();
        if (!backgroundPageConnection) {
            return;
        }

        try {
            backgroundPageConnection.postMessage(message);
        } catch (error) {
            backgroundPageConnection = null;
            scheduleReconnect();
        }
    }

    function requestOpen() {
        postToBackground({
            open: true
        });
    }

    function startOpenHeartbeat() {
        requestOpen();
        if (openHeartbeatTimer !== null) {
            return;
        }

        openHeartbeatTimer = window.setInterval(function () {
            requestOpen();
        }, 1000);
    }

    function stopOpenHeartbeat() {
        if (openHeartbeatTimer === null) {
            return;
        }

        window.clearInterval(openHeartbeatTimer);
        openHeartbeatTimer = null;
    }

    panel.onShown.addListener(function (w) {
        startOpenHeartbeat();
        postToBackground({
            toDevTool: true,
            toggleMask: true,
            devToolHidden: false
        });
    });
    panel.onHidden.addListener(function (w) {
        stopOpenHeartbeat();
        postToBackground({
            toDevTool: true,
            toggleMask: true,
            devToolHidden: true
        });
    });
    ensureBackgroundConnection();
    panel.onSearch.addListener(function (action, query) {
        return false;
    });
});
