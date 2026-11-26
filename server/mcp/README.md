# AI Life 只读 MCP 服务

外部助手可以通过 stdio 查询本地 AI Life 的穿搭、行李和预算。宿主每次启动一个独立 Node.js 子进程。应用可以在服务运行时继续更新同一个数据库，每次调用都会重新查询。

## 接入宿主

使用 Node.js 22.13 或更新版本。在项目根目录安装此服务的依赖：

```sh
npm ci --prefix server/mcp
```

服务独立安装和运行，直接加载同一版本仓库中的领域源码。部署时保留 `server/mcp/`、`server/src/` 和 `shared/` 的相对位置，在目标机器执行上面的安装命令。根目录的 `npm run setup` 仅安装 Web 和 API 依赖。

先用 AI Life 应用初始化目标数据库。将下面配置中的 `/absolute/path/ai-life` 替换为项目的绝对路径，再将配置加入支持 stdio 的 MCP 宿主。若桌面应用找不到 `node`，将 `command` 改为 Node 可执行文件的绝对路径。

```json
{
  "mcpServers": {
    "ai-life": {
      "command": "node",
      "args": ["/absolute/path/ai-life/server/mcp/start.mjs"],
      "env": {
        "AI_LIFE_MCP_DB": "/absolute/path/ai-life/server/data/demo.sqlite",
        "AI_LIFE_MODE": "demo"
      }
    }
  }
}
```

`AI_LIFE_MCP_DB` 必须指向已有 SQLite 文件。使用个人数据时，将路径换成个人数据库，并把 `AI_LIFE_MODE` 设为 `personal`。数据库选择始终取决于文件路径；模式只影响默认预算月份。启动器可以在任意工作目录运行。stdout 专供 MCP 协议，启动错误输出到 stderr。

## 查询工具

| 名称 | 调用参数示例 | 返回内容 |
| --- | --- | --- |
| `outfit_suggestion` | `{}` | 复用应用的衣橱搭配规则，按已保存的天气和推荐序号返回名称、理由、单品 ID 和近期少穿的单品。 |
| `packing_list` | `{}` 或 `{"tripId":"t-bj"}` | 返回当前或指定行程的 ID、标题以及每件行李的文字和勾选状态。行程不存在时返回工具错误。 |
| `budget_summary` | `{"month":"2026-09"}` | 返回指定月份的四类消费、月总额、各项预算、总余额及近六个月走势，金额单位为元。省略月份时使用本地当前月份，演示模式使用 2026 年 9 月。 |

成功结果的 `content[0].text` 是 JSON。SQLite 连接以 `readOnly: true` 打开，仅执行固定查询。查询列限定为以上工具所需的数据，模型密钥、家居令牌、票务详情、消费商户与备注均在查询范围之外。宿主可以读取返回的个人数据，请选择你信任的宿主及数据库。

## 验证

```sh
npm test --prefix server/mcp
```

宿主测试通过官方 MCP SDK 的 `Client` 和 `StdioClientTransport` 从另一个工作目录启动服务，验证握手、发现、三个工具的返回值、拒绝未知工具及无效输入。测试使用一次性 SQLite 库，验证底层连接拒绝写入，数据库文件在整个会话前后逐字节相同。
