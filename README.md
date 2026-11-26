# AI Life · 生活管家

AI 生活管家工作台：从**衣食住行**四个维度管理日常生活，并按模块统计支出。

本仓库沉淀产品需求说明与 UI 设计稿（高保真草图）。

## 仓库结构

```
docs/                 需求与设计规范、可行性分析报告
designs/              静态原型稿（PNG）
ai-life-designs/      多视觉风格高保真交互原型（HTML + Tailwind + Lucide）
web/                  可运行演示（今日概览与衣食住行支）
server/               本机接口与 SQLite（阶段一持久化；阶段二识衣与账单导入；阶段三家居与行程）
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

在 macOS 或 Linux 的项目根目录使用 Node.js 24 和 npm。首次使用或更新代码后，运行 `npm run setup` 安装锁定依赖并生成数据库客户端，随后选择工作台。

| 命令 | 页面 | 首次运行 |
| --- | --- | --- |
| `npm run dev` | `http://127.0.0.1:1117` | 使用个人库 `server/data/personal.sqlite`，首次打开时创建管理员账号 |
| `npm run dev:demo` | `http://127.0.0.1:1118` | 使用独立演示库 `server/data/demo.sqlite`，自动写入示例数据，无需登录 |

启动器等待本机 API 就绪后启动页面。按 Ctrl+C 可同时停止前后端。两个模式使用不同的页面端口隔离浏览器缓存，API 端口分别为 8787 和 8788。个人模式下，管理员可以在设置中添加成员，每个成员有独立的衣橱、饮食、行程和账单。天气、模型与 Home Assistant 配置由管理员维护。顶栏搜索支持 ⌘K / Ctrl+K。

### 备份、恢复与旧库迁移

升级前创建备份。下面的备份文件名可替换为自己的私有备份路径，数据库可能包含模型密钥和家居令牌。

```sh
npm run db:backup -- server/data/personal.sqlite server/data/personal-backup.sqlite
```

旧版本使用 `server/data/ai-life.sqlite`。在启动新个人库前，把旧库备份并恢复到新路径，再用 `npm run dev` 打开，核对流水、衣物和行程数量。

```sh
npm run db:backup -- server/data/ai-life.sqlite server/data/legacy-backup.sqlite
npm run db:restore -- server/data/legacy-backup.sqlite server/data/personal.sqlite
```

目标库已存在时，先关闭使用该库的服务，再在恢复命令末尾追加 `--replace`。恢复工具会保存替换前的回滚副本并输出路径。需要回滚时，停止服务，把该副本作为恢复命令的源文件。

若从旧分支升级，启动时会迁移原有个人记录及成员数据。旧版 `xingyu` 账号仍使用公开默认密码时，启动会使该凭据和该账号的旧会话失效。为该账号设置新密码，可以在个人模式启动时提供 `AI_LIFE_LEGACY_PASSWORD`（6–72 个字符且不同于旧默认密码）。完成后可从启动环境中移除此变量。已使用自定义密码的账号可以照常登录。

## 日常使用

- **饮食和衣橱**支持手工记录。记餐可从常用餐食或一句话估算开始，核对份量后入账。衣物可通过订单文字和照片进入可编辑草稿，保存前提示相似单品。
- **支出**按选定月份统计，金额精确到分。微信和支付宝 CSV 可直接导入。预览标出重复、疑似重复和待补全项，确认后展示导入回执。照片识衣和账单截图在设置里配置模型后可用，发送前会显示处理位置。
- **出行**可从铁路短信和航班邮件生成可编辑草稿。保存后可复用打包模板，准备页集中预览穿搭、打包和预算。离家设备操作在独立确认后执行。
- **设置**提供模型发现、文字和图片诊断，以及城市天气刷新。Home Assistant 可先同步设备、绑定场景，再选择测试设备。设备动作确认后显示各项执行结果。

## 扩展与试用

- [优化方案和分期验收](docs/optimization-plan.md)
- [手机安装与离线打包清单](docs/mobile-pwa.md)
- [iOS 快捷指令记餐](docs/ios-meal-shortcut.md)
- [只读 MCP 服务](server/mcp/README.md)

## 视觉基准（摘要）

- 主色青绿 `#0D9488`
- 页面底 `#F8FAFC`，白卡片约 12px 圆角
- 顶栏：全局搜索（⌘K）+「今天想安排什么？」AI 入口
