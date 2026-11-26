import { useRef, useState } from 'react';
import { colorHex, uid, yuan } from '../format';
import { useStore } from '../store';
import { CATEGORIES, type ClothingDraft, type WardrobeCategory, type WardrobeItem } from '../types';
import { blankDraft, similarItems } from '../wardrobePlan';
import { Field, Modal } from './ui';
import { coverFromFile, readClothingPhotos } from '../wardrobePhotos';

type EntryDraft = Omit<ClothingDraft, 'price'> & { price: string };
const SEASONS = ['四季', '春', '夏', '秋', '冬', '春夏', '春秋', '秋冬'];
const OCCASIONS = ['通勤', '休闲', '正式', '运动', '约会'];
function formDraft(item: ClothingDraft): EntryDraft {
  return { ...item, price: item.price == null ? '' : String(item.price) };
}
function validPrice(price: string) {
  return price.trim() === '' || (/^\d+(\.\d{1,2})?$/.test(price) && Number(price) <= 21_474_836.47);
}
function isReady(row: EntryDraft) {
  return !!row.name.trim() && !!row.color.trim() && validPrice(row.price);
}
function payload(row: EntryDraft): ClothingDraft {
  return { ...row, name: row.name.trim(), color: row.color.trim(), season: row.season.trim() || '四季', occasion: row.occasion.trim() || '通勤', price: row.price.trim() === '' ? null : Number(row.price) };
}


function EntryFields({ draft, onChange, autoFocus = false }: { draft: EntryDraft; onChange: (patch: Partial<EntryDraft>) => void; autoFocus?: boolean }) {
  return <div className="form-grid entry-fields">
    <Field label="单品名称 *" wide><input autoFocus={autoFocus} required maxLength={80} placeholder="例如：白色牛津衬衫" value={draft.name} onChange={(e) => onChange({ name: e.target.value })} /></Field>
    <Field label="分类"><select value={draft.category} onChange={(e) => onChange({ category: e.target.value as WardrobeCategory })}>{CATEGORIES.map((v) => <option key={v}>{v}</option>)}</select></Field>
    <Field label="颜色 *"><input required maxLength={40} placeholder="例如：白色、藏青、碎花" value={draft.color} onChange={(e) => onChange({ color: e.target.value })} /></Field>
    <Field label="适穿季节"><select value={draft.season} onChange={(e) => onChange({ season: e.target.value })}>{[...new Set([...SEASONS, draft.season])].filter(Boolean).map((v) => <option key={v}>{v}</option>)}</select></Field>
    <Field label="场合 / 风格"><select value={draft.occasion} onChange={(e) => onChange({ occasion: e.target.value })}>{[...new Set([...OCCASIONS, draft.occasion])].filter(Boolean).map((v) => <option key={v}>{v}</option>)}</select></Field>
    <Field label="购入价格（元，选填）" wide><input type="number" inputMode="decimal" min="0" max="21474836.47" step="0.01" placeholder="可留空，例如 199.00" value={draft.price} onChange={(e) => onChange({ price: e.target.value })} />{!validPrice(draft.price) ? <span className="entry-error">请输入非负金额，最多两位小数。</span> : <small className="muted">不知道价格也可以入库。</small>}</Field>
  </div>;
}

function CoverPicker({ cover, onChange, onBusy }: { cover?: string; onChange: (cover: string) => void; onBusy: (busy: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function select(file?: File) {
    if (!file) return;
    setBusy(true); onBusy(true); setError('');
    try { onChange(await coverFromFile(file)); }
    catch (error) { setError(error instanceof Error ? error.message : '照片读取失败，请重试。'); }
    finally { setBusy(false); onBusy(false); if (input.current) input.current.value = ''; }
  }
  return <div className="entry-cover-picker">
    <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void select(e.target.files?.[0]); }} />
    <button type="button" className="entry-cover-button" disabled={busy} onClick={() => input.current?.click()} aria-label={cover ? '更换单品照片' : '添加单品照片'}>
      {cover ? <img src={cover} alt="单品照片" /> : <span aria-hidden="true">＋</span>}
    </button>
    <div><strong>{busy ? '处理照片中…' : cover ? '照片已添加' : '给衣物拍张照'}</strong><p className="muted">{cover ? '点照片可以更换' : '选填，方便以后找回这件衣物'}</p>{cover ? <button type="button" className="btn-text small" disabled={busy} onClick={() => onChange('')}>移除照片</button> : null}{error ? <p role="alert" className="entry-error">{error}</p> : null}</div>
  </div>;
}

function SimilarList({ items, onPreview }: { items: WardrobeItem[]; onPreview: (item: WardrobeItem) => void }) {
  if (items.length === 0) return null;
  return <section className="entry-similar" aria-label="相近单品">
    <div className="entry-section-title"><strong>衣橱里有 {items.length} 件相近单品</strong><span>点开对比一下</span></div>
    <div className="similar-list">{items.map((item) => <button type="button" className="similar-item" key={item.id} onClick={() => onPreview(item)} aria-label={`预览 ${item.name}`}>
      {item.cover ? <img src={item.cover} alt="" /> : <span className="similar-swatch" style={{ background: colorHex(item.color) }} />}
      <span><strong>{item.name}</strong><small>{item.category} · {item.color}{item.price != null ? ` · ${yuan(item.price)}` : ''}</small></span><span aria-hidden="true">›</span>
    </button>)}</div>
  </section>;
}

function ItemPreview({ item, onClose }: { item: WardrobeItem; onClose: () => void }) {
  return <Modal title="单品预览" onClose={onClose}>
    <div className="item-preview">
      {item.cover ? <img className="preview-cover" src={item.cover} alt={item.name} /> : <div className="preview-placeholder" style={{ background: colorHex(item.color) }}><span>暂无照片</span></div>}
      <h3>{item.name}</h3>
      <dl className="preview-details">{[['分类', item.category], ['颜色', item.color], ['季节', item.season], ['场合 / 风格', item.occasion], ['购入价格', item.price == null ? '未填写' : yuan(item.price)], ['穿着次数', `${item.wears} 次`], ['入库日期', item.createdAt]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <button type="button" className="btn" onClick={onClose}>返回入库表单</button>
    </div>
  </Modal>;
}

export function ItemModal({ initial, onClose }: { initial: WardrobeItem | ClothingDraft | 'new'; onClose: () => void }) {
  const store = useStore();
  const editing = typeof initial === 'object' && 'id' in initial ? initial : null;
  const [draft, setDraft] = useState(() => formDraft(initial === 'new' ? blankDraft() : initial));
  const [preview, setPreview] = useState<WardrobeItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const similar = similarItems(store.items, draft, editing?.id);
  function patch(next: Partial<EntryDraft>) { setDraft((current) => ({ ...current, ...next })); setError(''); }
  async function save() {
    if (saving || reading) return;
    if (!isReady(draft)) { setError('请填写名称、颜色，并检查价格。'); return; }
    setSaving(true); setError('');
    try {
      const saved = editing ? await store.updateItem({ ...editing, ...payload(draft) }) : await store.addItem(payload(draft));
      if (saved) onClose(); else setError('这件单品没有保存，请检查内容后重试。');
    } catch { setError('保存失败，请重试。填写的内容已保留。'); }
    finally { setSaving(false); }
  }
  return <>
    <Modal title={editing ? '编辑单品' : '单品入库'} onClose={() => { if (!saving && !reading) onClose(); }}>
      <p className="entry-intro">{initial !== 'new' && !editing ? '核对照片与识别结果，补充信息后入库。' : '记下这件衣物，让每一次穿搭更有把握。'}<span>带 * 为必填，其余可以稍后补充。</span></p>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <fieldset className="entry-fieldset" disabled={saving || reading}>
          <CoverPicker cover={draft.cover} onChange={(cover) => patch({ cover })} onBusy={setReading} />
          <EntryFields draft={draft} onChange={patch} />
          <SimilarList items={similar} onPreview={setPreview} />
        </fieldset>
        {error ? <p className="entry-error" role="alert">{error}</p> : null}
        <div className="modal-actions entry-footer"><button type="button" className="btn-ghost" disabled={saving || reading} onClick={onClose}>取消</button><button type="submit" className="btn" disabled={saving || reading}>{saving ? '保存中…' : editing ? '保存修改' : '确认入库'}</button></div>
      </form>
    </Modal>
    {preview ? <ItemPreview item={preview} onClose={() => setPreview(null)} /> : null}
  </>;
}

type BatchRow = { key: string; draft: EntryDraft };
const batchRow = (draft: ClothingDraft): BatchRow => ({ key: uid('draft'), draft: formDraft(draft) });
export function BatchModal({ initial, manual, onClose }: { initial: ClothingDraft[]; manual: boolean; onClose: () => void }) {
  const store = useStore();
  const [rows, setRows] = useState(() => initial.map(batchRow));
  const [preview, setPreview] = useState<WardrobeItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [photoNote, setPhotoNote] = useState('');
  const photos = useRef<HTMLInputElement>(null);
  const readyCount = rows.filter(({ draft }) => isReady(draft)).length;
  const priced = rows.filter(({ draft }) => draft.price.trim() !== '' && validPrice(draft.price));
  const totalCents = priced.reduce((sum, { draft }) => sum + Math.round(Number(draft.price) * 100), 0);
  function patch(key: string, next: Partial<EntryDraft>) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, draft: { ...row.draft, ...next } } : row));
    setError('');
  }
  async function addPhotos(files: File[]) {
    if (!files.length) return;
    setReading(true); setPhotoNote('');
    try {
      const result = await readClothingPhotos(files, store.recognizeClothing);
      setRows((current) => [...current, ...result.drafts.map(batchRow)]);
      setPhotoNote([result.manual ? '部分照片需手动补充名称和颜色。' : '', result.failed.length ? `${result.failed.length} 张照片无法读取，请重新选择。` : ''].filter(Boolean).join(' '));
    } finally { setReading(false); if (photos.current) photos.current.value = ''; }
  }
  async function save() {
    if (saving || reading || rows.length === 0 || readyCount !== rows.length) return;
    setSaving(true); setError('');
    try {
      if (await store.addItems(rows.map(({ draft }) => payload(draft)))) onClose();
      else setError('本批次未保存，请检查内容后重试。');
    } catch { setError('保存失败，所有草稿已保留，请重试。'); }
    finally { setSaving(false); }
  }
  return <>
    <Modal title="批量入库" onClose={() => { if (!saving && !reading) onClose(); }}>
      <p className="entry-intro">{manual ? '逐件补充名称和颜色，价格可以留空。' : '核对每件衣物，再一次加入衣橱。'}<span>展开单品可编辑，移除不需要入库的衣物。</span></p>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <fieldset className="entry-fieldset" disabled={saving || reading}>
          <div className="batch-toolbar"><button type="button" className="btn-ghost" onClick={() => setRows((current) => [...current, batchRow(blankDraft())])}>＋ 添加一件</button><button type="button" className="btn-ghost" onClick={() => photos.current?.click()}>{reading ? '处理照片中…' : '从相册批量添加'}</button></div>
          <input ref={photos} type="file" hidden multiple accept="image/*" onChange={(e) => { void addPhotos(Array.from(e.target.files ?? [])); }} />
          {photoNote ? <p className="note" role="status">{photoNote}</p> : null}
          <div className="batch-list">{rows.map(({ key, draft }, index) => <details className="batch-entry" key={key} open>
            <summary><span className="batch-number">{String(index + 1).padStart(2, '0')}</span><span><strong>{draft.name || '待填写的单品'}</strong><small>{draft.category} · {draft.color || '颜色未填'}{draft.price !== '' && validPrice(draft.price) ? ` · ${yuan(Number(draft.price))}` : ''}</small></span><span className={isReady(draft) ? 'batch-status ready' : 'batch-status'}>{isReady(draft) ? '可入库' : '待完善'}</span></summary>
            <div className="batch-entry-body">
              {draft.cover ? <img className="batch-cover" src={draft.cover} alt={`第 ${index + 1} 件单品照片`} /> : null}
              <EntryFields draft={draft} onChange={(next) => patch(key, next)} />
              <SimilarList items={similarItems(store.items, draft)} onPreview={setPreview} />
              <button type="button" className="btn-text batch-remove" aria-label={`移除第 ${index + 1} 件`} onClick={() => setRows((current) => current.filter((row) => row.key !== key))}>移除这件</button>
            </div>
          </details>)}</div>
          {!rows.length ? <p className="empty">还没有待入库单品，添加一件或选择多张照片。</p> : null}
        </fieldset>
        {error ? <p className="entry-error" role="alert">{error}</p> : null}
        <div className="batch-total" aria-live="polite"><strong>{readyCount} / {rows.length} 件已就绪</strong><span>{priced.length ? `已填价格合计 ${yuan(totalCents / 100)}（${priced.length} 件）` : '价格可留空'}</span>{readyCount < rows.length ? <small>还有 {rows.length - readyCount} 件需要完善名称、颜色或价格。</small> : null}</div>
        <div className="modal-actions entry-footer"><button type="button" className="btn-ghost" disabled={saving || reading} onClick={onClose}>取消</button><button type="submit" className="btn" disabled={saving || reading || !rows.length || readyCount !== rows.length}>{saving ? '入库中…' : reading ? '处理照片中…' : `确认入库 ${rows.length} 件`}</button></div>
      </form>
    </Modal>
    {preview ? <ItemPreview item={preview} onClose={() => setPreview(null)} /> : null}
  </>;
}

export function OrderModal({ onClose, onDrafts }: { onClose: () => void; onDrafts: (drafts: ClothingDraft[]) => void }) {
  const store = useStore();
  const [text, setText] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  async function read() {
    if (reading || !text.trim()) return;
    setReading(true); setError('');
    try {
      const drafts = await store.draftFromOrder(text);
      if (!drafts.length) setError('没有读出衣物。请每行写一件商品，例如：白色衬衫 ¥199。');
      else onDrafts(drafts);
    } catch { setError('读取失败，请重试，订单内容已保留。'); }
    finally { setReading(false); }
  }
  return <Modal title="从订单批量入库" onClose={() => { if (!reading) onClose(); }}>
    <p className="entry-intro">每行一件商品，支持带 ¥ 或 ￥ 的价格。<span>下一步逐件核对后再入库。</span></p>
    <form onSubmit={(e) => { e.preventDefault(); void read(); }}><Field label="订单商品"><textarea autoFocus disabled={reading} value={text} onChange={(e) => { setText(e.target.value); setError(''); }} rows={6} placeholder={'白色牛津衬衫 ¥199\n深蓝直筒牛仔裤 ¥259.90\n黑色乐福鞋'} /></Field>
      {error ? <p className="entry-error" role="alert">{error}</p> : null}
      <div className="modal-actions"><button type="button" className="btn-ghost" disabled={reading} onClick={onClose}>取消</button><button type="submit" className="btn" disabled={reading || !text.trim()}>{reading ? '读取中…' : '下一步：核对单品'}</button></div>
    </form>
  </Modal>;
}
