v2.0
- 修复新版谷歌不兼容
- 修改标签显示标签 id

v2.5.5
- 重构 DevTools 面板与后台连接逻辑，新增断线重连与 `open` 心跳，减少面板打开后未及时连接的问题。
- `service-worker.js` 增强 stage/view 端口映射与清理策略，补充兜底映射、节流触发与 DevTools 打开状态提示。
- `page-bridge.js` 增加 `expandTree` 安全补丁与 Inspector 启动重试机制，避免异常导致树展开失败或启动中断。
- `ipt/panel/index.html` 引入 3 个新脚本：`port-guard.js`、`tree-expand-preserve.js`、`panel-recover.js`。
- 新增 `port-guard.js`：为 `chrome.runtime.connect` 增加韧性重连、消息暂存/回放，并规避 `window.name` eval 异常路径。
- 新增 `tree-expand-preserve.js`：刷新树数据时保留已展开节点，减少刷新后树状态丢失。
- 新增 `panel-recover.js`：在面板聚焦与可见性切换时自动尝试恢复树面板数据。
