(function () {
    var retryCount = 0;
    var maxRetryBeforeBackoff = 20;

    function canRecover(mainPanel) {
        if (!mainPanel || !mainPanel.port || !mainPanel.treePanel) {
            return false;
        }

        if (mainPanel.treePanel.data) {
            retryCount = 0;
            return false;
        }

        return typeof mainPanel.treePanel.refresh === "function";
    }

    function recoverTree() {
        var mainPanel = window.mainPanel;
        if (!canRecover(mainPanel)) {
            return;
        }

        try {
            mainPanel.treePanel.refresh();
            retryCount += 1;
        } catch (error) {
        }
    }

    function tick() {
        if (retryCount >= maxRetryBeforeBackoff) {
            return;
        }
        recoverTree();
    }

    window.setInterval(tick, 1500);
    window.addEventListener("focus", recoverTree, true);
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            recoverTree();
        }
    }, true);
})();

