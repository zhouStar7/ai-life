export type BillStatus = 'new' | 'duplicate' | 'review' | 'incomplete';
export interface BillIdentity {
  source?: 'wechat' | 'alipay' | 'csv' | 'image';
  transactionId?: string;
  rowKey?: string;
  status?: BillStatus;
  decision?: 'skip' | 'import';
}

export interface BillImportReceipt {
  imported: number;
  duplicates: number;
  skipped: number;
  incomplete: number;
  amount: number;
}
