(function () {
    var MESSAGE_SOURCE = "egret-inspector-content";
    var MESSAGE_TYPE = "start-inspect";
    var PATCH_FLAG = "__egretExpandTreeSafePatched";

    function getEmptyTreeNode(hashCode) {
        return {
            rawHash: hashCode || 0,
            _children: [],
            _props: [],
            children: null,
            props: null,
            show: false,
            hasChildren: false,
            icon: "&nbsp;"
        };
    }

    function installExpandTreeSafePatch() {
        var devtool = window.egret && window.egret.devtool;
        var PortBase = devtool && devtool.PortBase;
        var proto = PortBase && PortBase.prototype;

        if (!proto || typeof proto.on !== "function") {
            return false;
        }

        if (proto[PATCH_FLAG]) {
            return true;
        }

        var originalOn = proto.on;
        proto.on = function (name, callback) {
            if (name !== "expandTree" || typeof callback !== "function") {
                return originalOn.call(this, name, callback);
            }

            var safeCallback = function (message, respond) {
                try {
                    return callback(message, respond);
                } catch (error) {
                    try {
                        if (typeof respond === "function") {
                            respond(getEmptyTreeNode(message && message.hashCode));
                        }
                    } catch (ignore) {
                    }
                }
            };

            return originalOn.call(this, name, safeCallback);
        };

        proto[PATCH_FLAG] = true;
        return true;
    }

    (function ensurePatchReady() {
        if (installExpandTreeSafePatch()) {
            return;
        }

        var tryCount = 0;
        var maxTry = 100;
        var timer = window.setInterval(function () {
            tryCount += 1;
            if (installExpandTreeSafePatch() || tryCount >= maxTry) {
                window.clearInterval(timer);
            }
        }, 100);
    })();

    function ensureLegacyGlobals() {
        if (typeof window.lark_stages === "undefined") {
            window.lark_stages = [];
        }
    }

    function tryStartInspector() {
        ensureLegacyGlobals();

        var canStart = window.egret &&
            window.egret.devtool &&
            typeof window.egret.devtool.start === "function";

        if (!canStart) {
            return false;
        }

        try {
            window.egret.devtool.start();
            return true;
        } catch (error) {
            try {
                if (window.egret &&
                    window.egret.devtool &&
                    typeof window.egret.devtool.ping === "function") {
                    window.egret.devtool.ping();
                }
            } catch (ignore) {
            }

            return false;
        }
    }

    function startInspector() {
        var attemptCount = 0;
        var maxAttempts = 200;

        var timer = window.setInterval(function () {
            attemptCount += 1;

            if (tryStartInspector()) {
                window.clearInterval(timer);
                return;
            }

            if (attemptCount >= maxAttempts) {
                window.clearInterval(timer);
            }
        }, 100);

        if (tryStartInspector()) {
            window.clearInterval(timer);
        }
    }

    window.addEventListener("message", function (event) {
        if (event.source !== window) {
            return;
        }

        var data = event.data || {};
        if (data.from !== MESSAGE_SOURCE || data.type !== MESSAGE_TYPE) {
            return;
        }

        startInspector();
    });
})();
