(function () {
    var PATCH_FLAG = "__egretTreeExpandPreservePatched";

    function collectExpandedHashes(node, result, visited) {
        if (!node || !result || !visited) {
            return;
        }

        var hash = node.rawHash;
        if (hash !== undefined && hash !== null) {
            if (node.show === true && node.hasChildren === true) {
                if (!visited[hash]) {
                    visited[hash] = true;
                    result.push(hash);
                }
            }
        }

        var children = node._children || node.children || [];
        for (var i = 0; i < children.length; i += 1) {
            collectExpandedHashes(children[i], result, visited);
        }
    }

    function restoreExpandedHashes(devtool, hashes) {
        if (!devtool || !devtool.TreeNode || !Array.isArray(hashes)) {
            return;
        }

        for (var i = 0; i < hashes.length; i += 1) {
            var hash = hashes[i];
            var node = devtool.TreeNode.getByHash(hash);
            if (!node || node.hasChildren !== true) {
                continue;
            }

            try {
                node.showChildren();
            } catch (error) {
                // Ignore stale node errors and continue restoring others.
            }
        }
    }

    function patchTreePanelRefresh() {
        var egret = window.egret;
        var devtool = egret && egret.devtool;
        var TreePanel = devtool && devtool.TreePanel;
        var TreeNode = devtool && devtool.TreeNode;
        if (!TreePanel || !TreeNode || !TreePanel.prototype) {
            return false;
        }

        if (TreePanel.prototype[PATCH_FLAG]) {
            return true;
        }

        TreePanel.prototype.refresh = function () {
            var panel = this;
            var expandedHashes = [];
            collectExpandedHashes(panel.data, expandedHashes, Object.create(null));

            panel.port.post({ name: "refresh" }, null, function (message) {
                devtool.TreeNode.clear();
                var root = devtool.TreeNode.clone(message.tree, false);
                panel.data = root;

                restoreExpandedHashes(devtool, expandedHashes);
                panel.data.naviToNode(message.hash);
            });
        };

        TreePanel.prototype[PATCH_FLAG] = true;
        return true;
    }

    if (patchTreePanelRefresh()) {
        return;
    }

    var tries = 0;
    var maxTries = 100;
    var timer = window.setInterval(function () {
        tries += 1;
        if (patchTreePanelRefresh() || tries >= maxTries) {
            window.clearInterval(timer);
        }
    }, 100);
})();

