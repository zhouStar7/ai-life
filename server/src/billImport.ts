import type { Prisma } from '@prisma/client';
import type { BillImportReceipt, BillStatus } from '../../shared/bills.js';
import { isTag, type BillDraft } from './adapters/bills.js';
import { uid } from './ids.js';
import { isLocalDate } from './localDate.js';
import { centsToYuan, yuanToCents } from './money.js';
import { currentMemberId } from './requestContext.js';

function keys(row: BillDraft) {
  const source = ['wechat', 'alipay', 'csv', 'image'].includes(row.source ?? '') ? row.source! : 'csv';
  const transactionId = typeof row.transactionId === 'string' ? row.transactionId.trim() || null : null;
  const rowKey = typeof row.rowKey === 'string' && /^[a-f0-9]{64}:\d+$/.test(row.rowKey) ? row.rowKey : null;
  return { source, transactionId, rowKey, platformKey: transactionId ? `${source}:${transactionId}` : null };
}

function signature(date: string, merchant: string, cents: bigint) {
  return JSON.stringify([date, merchant.trim(), String(cents)]);
}

/** Classify against both the committed ledger and preceding accepted rows of this batch. */
export async function prepareBills(db: Prisma.TransactionClient, rows: BillDraft[]) {
  const memberId = currentMemberId();
  const existing = await db.expense.findMany({
    where: { memberId },
    select: { date: true, merchant: true, amountCents: true, billImport: true, fingerprint: true },
  });
  const legacy = new Set(existing.map(({ fingerprint }) => fingerprint).filter(Boolean));
  const exact = new Set<string>();
  const signatures = new Set<string>();
  const withoutId = new Set<string>();
  function remember(key: string, rowKey?: string | null, platformKey?: string | null) {
    if (rowKey) exact.add(rowKey);
    if (platformKey) exact.add(platformKey);
    else withoutId.add(key);
    signatures.add(key);
  }
  for (const item of existing) remember(signature(item.date, item.merchant, item.amountCents), item.billImport?.rowKey, item.billImport?.platformKey);

  const receipt: BillImportReceipt = { imported: 0, duplicates: 0, skipped: 0, incomplete: 0, amount: 0 };
  let importedCents = 0n;
  const classified: BillDraft[] = [];
  const expenses: Prisma.ExpenseCreateManyInput[] = [];
  const identities: Prisma.BillImportCreateManyInput[] = [];
  for (const row of rows) {
    const identity = keys(row);
    const cents = yuanToCents(row.amount);
    const merchant = typeof row.merchant === 'string' ? row.merchant.trim() : '';
    const key = signature(row.date, merchant, cents ?? 0n);
    const note = typeof row.note === 'string' ? row.note.trim() : '';
    const legacyKey = `fp:${row.date}|${merchant}|${cents}|${note}`;
    const legacySource = identity.transactionId && legacy.has(`src:${identity.transactionId}`);
    let status: BillStatus = 'new';
    if (exact.has(identity.rowKey ?? '') || exact.has(identity.platformKey ?? '') || legacy.has(legacyKey) || legacySource) status = 'duplicate';
    else if (!isLocalDate(row.date) || !isTag(row.tag) || !cents || !merchant) status = 'incomplete';
    else if (identity.platformKey ? withoutId.has(key) : signatures.has(key)) status = 'review';
    classified.push({ ...row, status });
    if (status === 'duplicate') receipt.duplicates++;
    else if (status === 'incomplete') receipt.incomplete++;
    else if (row.decision === 'skip' || (status === 'review' && row.decision !== 'import')) receipt.skipped++;
    else {
      remember(key, identity.rowKey, identity.platformKey);
      const id = uid('e');
      expenses.push({ id, tag: row.tag!, date: row.date, merchant, amountCents: cents!, note: row.note || '账单导入' });
      identities.push({ expenseId: id, ...identity });
      importedCents += cents!;
      receipt.imported++;
    }
  }
  receipt.amount = centsToYuan(importedCents);
  return { rows: classified, receipt, expenses, identities };
}
