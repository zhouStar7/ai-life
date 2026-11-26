import { useRef, useState } from 'react';
import { uid } from '../format';
import { useStore } from '../store';
import { CATEGORIES, type ClothingDraft, type WardrobeCategory, type WardrobeItem } from '../types';
import { coverFromFile } from '../wardrobePhotos';
import { blankDraft, similarItems } from '../wardrobePlan';
import { Field, Modal } from './ui';

type EntryDraft = Omit<ClothingDraft, 'price'> & { price: string };

function entryDraft(draft: ClothingDraft): EntryDraft {
  return { ...draft, price: draft.price == null ? '' : String(draft.price) };
}

function validPrice(price: string) {
  return price === '' || (/^\d{1,14}(\.\d{1,2})?$/.test(price) && Number(price) < 2 ** 46);
}

function itemPayload(draft: EntryDraft): ClothingDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    color: draft.color.trim(),
    season: draft.season.trim() || '四季',
    occasion: draft.occasion.trim() || '通勤',
    price: draft.price === '' ? null : Number(draft.price),
  };
}

function EntryFields({ draft, onChange, disabled, autoFocus }: {
  draft: EntryDraft;
  onChange: (patch: Partial<EntryDraft>) => void;
  disabled: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div className="form-grid">
      <Field label="名称" wide><input autoFocus={autoFocus} required disabled={disabled} value={draft.name} onChange={(event) => onChange({ name: event.target.value })} /></Field>
      <Field label="分类">
        <select value={draft.category} disabled={disabled} onChange={(event) => onChange({ category: event.target.value as WardrobeCategory })}>
          {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <Field label="颜色"><input required disabled={disabled} value={draft.color} onChange={(event) => onChange({ color: event.target.value })} /></Field>
      <Field label="季节"><input value={draft.season} disabled={disabled} onChange={(event) => onChange({ season: event.target.value })} /></Field>
      <Field label="场合 / 风格"><input value={draft.occasion} disabled={disabled} onChange={(event) => onChange({ occasion: event.target.value })} /></Field>
      <Field label="购入价格（元，选填）" wide>
        <input inputMode="decimal" placeholder="例如 199.00" value={draft.price} disabled={disabled} aria-invalid={!validPrice(draft.price)} onChange={(event) => onChange({ price: event.target.value.trim() })} />
        {!validPrice(draft.price) ? <span className="entry-error">请输入非负金额，最多两位小数。</span> : null}
      </Field>
    </div>
  );
}

export function ItemModal({ initial, onClose }: { initial: WardrobeItem | ClothingDraft | 'new'; onClose: () => void }) {
  const store = useStore();
  const editing = typeof initial === 'object' && 'id' in initial ? initial : null;
  const fromPhoto = initial !== 'new' && !editing;
  const [draft, setDraft] = useState(() => entryDraft(initial === 'new' ? blankDraft() : initial));
  const [reading, setReading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const photo = useRef<HTMLInputElement>(null);
  const busy = reading || store.saving;
  const similar = similarItems(store.items, draft, editing?.id);

  function patch(next: Partial<EntryDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function selectPhoto(file?: File) {
    if (!file) return;
    setReading(true);
    setPhotoError('');
    try {
      patch({ cover: await coverFromFile(file) });
    } catch {
      setPhotoError('照片读取失败，请重新选择 JPG、PNG 或 WebP 图片。');
    } finally {
      setReading(false);
      if (photo.current) photo.current.value = '';
    }
  }

  async function save() {
    if (busy || !draft.name.trim() || !draft.color.trim() || !validPrice(draft.price)) return;
    const payload = itemPayload(draft);
    if (editing ? await store.updateItem({ ...editing, ...payload }) : await store.addItem(payload)) onClose();
  }

  return (
    <Modal title={editing ? '编辑单品' : fromPhoto ? '确认入库' : '添加单品'} onClose={() => { if (!busy) onClose(); }}>
      {fromPhoto ? <p className="muted">{initial.name ? '核对识别结果后入库。' : '照片已保留，请手动填写名称和颜色。'}</p> : null}
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="entry-cover-picker">
          <input ref={photo} hidden type="file" accept="image/*" onChange={(event) => { void selectPhoto(event.target.files?.[0]); }} />
          <button type="button" className="entry-cover-button" disabled={busy} onClick={() => photo.current?.click()} aria-label={draft.cover ? '更换单品照片' : '添加单品照片'}>
            {draft.cover ? <img src={draft.cover} alt="单品照片" /> : <span aria-hidden="true">＋</span>}
          </button>
          <div>
            <strong>{reading ? '处理照片中…' : draft.cover ? '点照片可以更换' : '单品照片（选填）'}</strong>
            {draft.cover ? <button type="button" className="btn-text small" disabled={busy} onClick={() => patch({ cover: '' })}>移除照片</button> : null}
            {photoError ? <p role="alert" className="entry-error">{photoError}</p> : null}
          </div>
        </div>
        <EntryFields draft={draft} onChange={patch} disabled={busy} autoFocus={!fromPhoto} />
        {similar.length > 0 ? <p className="note" style={{ marginTop: 12 }}>衣橱里已有相近单品：{similar.map((item) => item.name).join('、')}</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>取消</button>
          <button type="submit" className="btn" disabled={busy || !validPrice(draft.price)}>{store.saving ? '保存中…' : fromPhoto ? '确认入库' : '保存'}</button>
        </div>
      </form>
    </Modal>
  );
}

function batchRow(draft: ClothingDraft) {
  return { key: uid('draft'), draft: entryDraft(draft) };
}

export function BatchModal({ initial, onClose }: { initial: ClothingDraft[]; onClose: () => void }) {
  const store = useStore();
  const [rows, setRows] = useState(() => initial.map(batchRow));
  const ready = rows.length > 0 && rows.every(({ draft }) => draft.name.trim() && draft.color.trim() && validPrice(draft.price));

  function patch(key: string, next: Partial<EntryDraft>) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, draft: { ...row.draft, ...next } } : row));
  }

  async function save() {
    if (ready && !store.saving && await store.addItems(rows.map(({ draft }) => itemPayload(draft)))) onClose();
  }

  return (
    <Modal title="批量入库" onClose={() => { if (!store.saving) onClose(); }}>
      <p className="muted">逐件核对名称、颜色和价格后一起入库。</p>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        {rows.map(({ key, draft }, index) => {
          const similar = similarItems(store.items, draft);
          return (
            <div className="stack" key={key} style={{ marginTop: 12 }}>
              {draft.cover ? <img src={draft.cover} className="batch-cover" alt={`第 ${index + 1} 件单品照片`} /> : null}
              <EntryFields draft={draft} onChange={(next) => patch(key, next)} disabled={store.saving} />
              {similar.length > 0 ? <p className="note">衣橱里已有相近单品：{similar.map((item) => item.name).join('、')}</p> : null}
              <button type="button" className="btn-text small" disabled={store.saving} onClick={() => setRows((current) => current.filter((row) => row.key !== key))}>去掉这件</button>
            </div>
          );
        })}
        <button type="button" className="btn-ghost small" style={{ marginTop: 12 }} disabled={store.saving} onClick={() => setRows((current) => [...current, batchRow(blankDraft())])}>添加一件</button>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" disabled={store.saving} onClick={onClose}>取消</button>
          <button type="submit" className="btn" disabled={!ready || store.saving}>{store.saving ? '入库中…' : '确认入库'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function OrderModal({ onClose, onDrafts }: { onClose: () => void; onDrafts: (rows: ClothingDraft[]) => void }) {
  const store = useStore();
  const [text, setText] = useState('');
  const [reading, setReading] = useState(false);
  const [empty, setEmpty] = useState(false);

  async function read() {
    if (reading || !text.trim()) return;
    setReading(true);
    try {
      const drafts = await store.draftFromOrder(text);
      if (drafts.length) onDrafts(drafts);
      else setEmpty(true);
    } finally {
      setReading(false);
    }
  }

  return (
    <Modal title="粘贴订单" onClose={() => { if (!reading) onClose(); }}>
      <p className="muted">每行粘贴一件商品，可带 ¥ 或 ￥ 价格。</p>
      <form onSubmit={(event) => { event.preventDefault(); void read(); }}>
        <Field label="订单商品">
          <textarea autoFocus disabled={reading} value={text} onChange={(event) => { setText(event.target.value); setEmpty(false); }} rows={6} placeholder={'白色牛津衬衫 ¥199\n深蓝直筒牛仔裤 ¥259.90'} style={{ width: '100%' }} />
        </Field>
        {empty ? <p className="note" role="alert">没有读出衣物。写上衬衫、裤子、裙子、外套或鞋包后再试。</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" disabled={reading} onClick={onClose}>取消</button>
          <button type="submit" className="btn" disabled={reading || !text.trim()}>{reading ? '读取中…' : '生成草稿'}</button>
        </div>
      </form>
    </Modal>
  );
}
