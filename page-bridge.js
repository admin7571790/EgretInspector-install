(function () {
    var MESSAGE_SOURCE = "egret-inspector-content";
    var MESSAGE_TYPE = "start-inspect";

    function startInspector() {
        var timer = window.setInterval(function () {
            var canStart = window.egret &&
                window.egret.devtool &&
                typeof window.egret.devtool.start === "function";

            if (!canStart) {
                return;
            }

            window.clearInterval(timer);
            window.egret.devtool.start();
        }, 100);

        var canStartImmediately = window.egret &&
            window.egret.devtool &&
            typeof window.egret.devtool.start === "function";

        if (canStartImmediately) {
            window.clearInterval(timer);
            window.egret.devtool.start();
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
