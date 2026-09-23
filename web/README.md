# AI Life 演示

本地可点击的生活管家。页面和交互对齐 `docs/requirements.md`、`docs/design-system.md` 与 `designs/` 里的现行稿。

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:1117 。只跑这个命令时，数据只保存在当前页面会话中。

同时在 `server/` 执行 `npm run dev` 后，页面改走本机 SQLite，刷新不会丢。模型地址在设置页填写。
