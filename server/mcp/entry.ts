import { isAbsolute } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { isMonth } from '../../shared/spending.js';
import { budget, openReadOnly, outfit, packing } from './queries.js';

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function result(read: () => unknown) {
  try {
    const value = read();
    if (value !== null) return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
    return { isError: true, content: [{ type: 'text' as const, text: '找不到所选行程。' }] };
  } catch {
    return { isError: true, content: [{ type: 'text' as const, text: '读取失败，请检查数据库是否已由 AI Life 应用初始化并升级。' }] };
  }
}

async function main() {
  const filename = process.env.AI_LIFE_MCP_DB;
  if (!filename || !isAbsolute(filename)) throw new Error('Database path required');
  const db = openReadOnly(filename);
  const server = new McpServer({ name: 'ai-life-readonly', version: '1.0.0' });
  server.registerTool('outfit_suggestion', {
    description: '按当前衣橱及已保存的天气生成一套穿搭建议。', inputSchema: z.strictObject({}), annotations,
  }, () => result(() => outfit(db)));
  server.registerTool('packing_list', {
    description: '读取指定行程的打包项目及勾选状态；省略 tripId 时读取当前行程。',
    inputSchema: z.strictObject({ tripId: z.string().trim().min(1).max(200).optional() }), annotations,
  }, ({ tripId }) => result(() => packing(db, tripId)));
  server.registerTool('budget_summary', {
    description: '按月汇总消费、预算、余额及六个月走势，单位为人民币元。',
    inputSchema: z.strictObject({ month: z.string().refine(isMonth, '请使用 YYYY-MM').optional() }), annotations,
  }, ({ month }) => result(() => budget(db, month)));
  server.server.onclose = () => db.close();
  await server.connect(new StdioServerTransport());
}

main().catch(() => {
  console.error('AI Life MCP 启动失败，请将 AI_LIFE_MCP_DB 设为已有 SQLite 数据库的绝对路径。');
  process.exitCode = 1;
});
