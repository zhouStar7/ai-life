# AI Life · 生活管家

AI 生活管家工作台：从**衣食住行**四个维度管理日常生活，并按模块统计支出。

本仓库沉淀产品需求说明与 UI 设计稿（高保真草图）。

## 仓库结构

```
docs/                 需求与设计规范、可行性分析报告
designs/              静态原型稿（PNG）
ai-life-designs/      多视觉风格高保真交互原型（HTML + Tailwind + Lucide）
web/                  可运行演示（今日概览与衣食住行支）
server/               本机接口与 SQLite（阶段一持久化；阶段二识衣与账单导入）
```

## 产品导航

`今日概览` → `衣橱` → `饮食` → `家居` → `出行` → `支出统计` → `设置`

## 交互设计稿（HTML 原型）

详见 [`ai-life-designs/README.md`](ai-life-designs/README.md)：

| 模块 | 设计稿文件 | 视觉风格 | 说明 |
|------|-----------|----------|------|
| **画廊索引** | [ai-life-designs/index.html](ai-life-designs/index.html) | Editorial 画廊风 | 视觉索引与多风格导览 |
| **衣 · 衣橱** | [ai-life-designs/wardrobe.html](ai-life-designs/wardrobe.html) | 时尚杂志编辑风 | 衬线版式、胶囊穿搭、象牙白底 |
| **食 · 饮食** | [ai-life-designs/diet.html](ai-life-designs/diet.html) | 暖阳有机风 | 奶油色底、卡路里平衡环、轻量记录 |
| **住 · 家居** | [ai-life-designs/home.html](ai-life-designs/home.html) | 深色中控面板 | 状态呼吸灯、传感器监控、全屋联动 |
| **行 · 出行** | [ai-life-designs/travel.html](ai-life-designs/travel.html) | 瑞士国际主义 | 12 列严网格、机票票据质感、行程清单 |
| **支 · 支出** | [ai-life-designs/spending.html](ai-life-designs/spending.html) | 暗夜极客仪表盘 | JetBrains Mono 等宽字系、单一青色强调 |
| **综合工作台** | [ai-life-designs/ai-life-redesign.html](ai-life-designs/ai-life-redesign.html) | 多主题切换 (宋式/极客/北欧等) | 跨域协同引擎、⌘K 全局 Omni Agent |

## 设计稿一览（静态切图）

| 页面 | 文件 |
|------|------|
| 今日概览 | [designs/overview/01-today-overview.png](designs/overview/01-today-overview.png) |
| 衣橱 | [designs/modules/02-wardrobe.png](designs/modules/02-wardrobe.png) |
| 饮食 | [designs/modules/03-diet.png](designs/modules/03-diet.png) |
| 家居 | [designs/modules/04-smart-home.png](designs/modules/04-smart-home.png) |
| 出行 | [designs/modules/05-travel.png](designs/modules/05-travel.png) |
| 支出统计 | [designs/spending/06-expense-stats.png](designs/spending/06-expense-stats.png) |

## 文档

- [项目可行性深度分析报告](docs/feasibility-analysis.md)
- [二级页需求说明](docs/requirements.md)
- [视觉与导航规范](docs/design-system.md)
- [支出分类口径](docs/spending-taxonomy.md)

## 运行演示

演示在 `web/`，数据只存在当前浏览器会话里。

```bash
cd web
npm install
npm run dev
```

打开 http://localhost:1117 。顶栏搜索支持 ⌘K / Ctrl+K。只开这个命令时，数据仍只留在当前页面会话里。

要让刷新后数据还在，并接上本机模型，另开一个终端：

```bash
cd server
npm install
npm run dev
```

接口在 http://127.0.0.1:8787 ，页面会把 `/api` 转到这里。设置里可以填写模型地址。模型没开时，示例句仍可以一键采纳。

阶段二在本机接口上：衣橱可以拍照或从相册选图，由模型填上分类、颜色和风格；支出统计可以导入 CSV，或把账单截图交给同一个模型。导入的九月流水会进入本月环图和预算进度。CSV 不依赖模型。识衣和截图需要先在设置里保存模型地址。

## 优先级

- **P0**：衣橱、饮食、家居、出行、支出统计
- **P1**：今日概览串联四模块摘要 + 支出摘要 + AI 建议
- **P2**：设置、账单导入、智能家居真实设备对接

## 视觉基准（摘要）

- 主色青绿 `#0D9488`
- 页面底 `#F8FAFC`，白卡片约 12px 圆角
- 顶栏：全局搜索（⌘K）+「今天想安排什么？」AI 入口
