// Hosts can launch this absolute path from any working directory.
process.env.TSX_DISABLE_CACHE = '1';
const { tsImport } = await import('tsx/esm/api');
await tsImport('./entry.ts', { parentURL: import.meta.url, tsconfig: false });
