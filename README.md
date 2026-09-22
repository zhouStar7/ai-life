# AI Life · 生活管家

AI 生活管家工作台：从**衣食住行**四个维度管理日常生活，并按模块统计支出。

本仓库沉淀产品需求说明与 UI 设计稿（高保真草图）。

## 仓库结构

```
docs/                 需求与设计规范
designs/
  overview/           今日概览
  modules/            衣橱 / 饮食 / 家居 / 出行（统一规范版）
  spending/           支出统计
  archive/            统一规范前的初版稿
```

## 产品导航

`今日概览` → `衣橱` → `饮食` → `家居` → `出行` → `支出统计` → `设置`

## 设计稿一览

| 页面 | 文件 |
|------|------|
| 今日概览 | [designs/overview/01-today-overview.png](designs/overview/01-today-overview.png) |
| 衣橱 | [designs/modules/02-wardrobe.png](designs/modules/02-wardrobe.png) |
| 饮食 | [designs/modules/03-diet.png](designs/modules/03-diet.png) |
| 家居 | [designs/modules/04-smart-home.png](designs/modules/04-smart-home.png) |
| 出行 | [designs/modules/05-travel.png](designs/modules/05-travel.png) |
| 支出统计 | [designs/spending/06-expense-stats.png](designs/spending/06-expense-stats.png) |

## 文档

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

打开 http://localhost:5173 。顶栏搜索支持 ⌘K / Ctrl+K。

## 优先级

- **P0**：衣橱、饮食、家居、出行、支出统计
- **P1**：今日概览串联四模块摘要 + 支出摘要 + AI 建议
- **P2**：设置、账单导入、智能家居真实设备对接

## 视觉基准（摘要）

- 主色青绿 `#0D9488`
- 页面底 `#F8FAFC`，白卡片约 12px 圆角
- 顶栏：全局搜索（⌘K）+「今天想安排什么？」AI 入口
