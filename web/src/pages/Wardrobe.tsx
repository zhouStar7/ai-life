import { useMemo, useRef, useState } from 'react';
import { colorHex, itemNames } from '../format';
import { useStore } from '../store';
import { CATEGORIES, type ClothingDraft, type WardrobeCategory, type WardrobeItem } from '../types';
import { Empty, Field, Modal, SpendCard } from '../components/ui';

type Draft = Omit<WardrobeItem, 'id' | 'wears' | 'createdAt'>;

const EMPTY: Draft = { name: '', category: '上衣', season: '四季', color: '', occasion: '通勤' };

export function WardrobePage() {
  const store = useStore();
  const [category, setCategory] = useState<'全部' | WardrobeCategory>('全部');
  const [sort, setSort] = useState<'new' | 'wears'>('new');
  const [editor, setEditor] = useState<WardrobeItem | ClothingDraft | 'new' | null>(null);
  const [batch, setBatch] = useState<ClothingDraft[] | null>(null);
  const [reading, setReading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const filtered = store.items.filter((item) => category === '全部' || item.category === category);
    return [...filtered].sort((a, b) => (sort === 'wears' ? b.wears - a.wears : b.createdAt.localeCompare(a.createdAt)));
  }, [category, sort, store.items]);

  async function onPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setReading(true);
    const found: ClothingDraft[] = [];
    for (const file of files) {
      const draft = await store.recognizeClothing(await readFile(file, 'data'));
      if (draft) found.push(draft);
    }
    setReading(false);
    if (photoRef.current) photoRef.current.value = '';
    if (found.length === 1) setEditor(found[0]);
    else if (found.length > 1) setBatch(found);
  }

  function photoButton(testId?: string) {
    return (
      <button type="button" className="btn-ghost" data-testid={testId} disabled={reading} onClick={() => photoRef.current?.click()}>
        {reading ? '识别中…' : '拍照录入'}
      </button>
    );
  }

  return (
    <>
      <header className="page-head">
        <h1 className="display" style={{ fontSize: 32 }}>衣橱</h1>
        <div className="row-actions">
          {photoButton('photo-item')}
          <button type="button" className="btn" data-testid="add-item" onClick={() => setEditor('new')}>添加单品</button>
        </div>
      </header>
      <input ref={photoRef} hidden type="file" accept="image/*" multiple onChange={(event) => { void onPhotos(event.target.files); }} />
      <div className="layout-2">
        <section>
          <div className="pills">
            <button type="button" className={category === '全部' ? 'pill active' : 'pill'} onClick={() => setCategory('全部')}>全部</button>
            {CATEGORIES.map((item) => (
              <button type="button" key={item} className={category === item ? 'pill active' : 'pill'} onClick={() => setCategory(item)}>{item}</button>
            ))}
            <select className="select" aria-label="排序" value={sort} onChange={(event) => setSort(event.target.value as 'new' | 'wears')}>
              <option value="new">添加时间</option>
              <option value="wears">穿着频次</option>
            </select>
          </div>
          {store.items.length === 0 ? (
            <div className="card">
              <Empty
                title="衣橱还是空的"
                desc="拍一张或从相册选几张，模型会填上分类、颜色和风格。也可以手动添加。"
                action={<><button type="button" className="btn" onClick={() => setEditor('new')}>添加单品</button>{photoButton()}</>}
              />
            </div>
          ) : visible.length === 0 ? (
            <div className="card"><Empty title="这个分类里没有单品" desc="换一个胶囊，或者添加一件。" /></div>
          ) : (
            <div className="item-grid">
              {visible.map((item) => (
                <article className="card item-card" key={item.id}>
                  <div className="swatch" style={{ background: colorHex(item.color), boxShadow: item.color === '白色' ? 'inset 0 0 0 1px #e2e8f0' : undefined }} />
                  <h3>{item.name}</h3>
                  <span className="pill">{item.category}</span>
                  <p className="meta">{item.season} · {item.color} · {item.occasion}</p>
                  <p className="wears">穿过 {item.wears} 次</p>
                  {item.wears <= 4 ? <span className="flag">久未穿着</span> : null}
                  <div className="card-actions">
                    <button type="button" className="btn-ghost small" onClick={() => setEditor(item)}>编辑</button>
                    {pendingDelete === item.id ? (
                      <>
                        <button type="button" className="btn small danger" onClick={() => { store.removeItem(item.id); setPendingDelete(null); }}>确认</button>
                        <button type="button" className="btn-text small" onClick={() => setPendingDelete(null)}>取消</button>
                      </>
                    ) : (
                      <button type="button" className="btn-text small" onClick={() => setPendingDelete(item.id)}>删除</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <aside className="stack">
          <article className="card suggestion">
            <h2>今日穿搭</h2>
            <div className="weather">{store.weatherOn ? '22°C · 多云' : '天气未知'}</div>
            {store.items.length === 0 ? (
              <p className="reason">还没有单品，建议会在你添加之后出现。</p>
            ) : (
              <>
                <h3>{store.suggestion.title}</h3>
                <p className="reason">{store.suggestion.reason}</p>
                <div className="row-actions">
                  <button type="button" className="btn small" data-testid="adopt-outfit" disabled={store.outfitAdopted || store.suggestion.itemIds.length === 0} onClick={store.adoptOutfitSuggestion}>
                    {store.outfitAdopted ? '已采纳' : '采纳'}
                  </button>
                  <button type="button" className="btn-ghost small" onClick={store.refreshSuggestion}>换一换</button>
                  <button type="button" className="btn-text small" onClick={store.saveSuggestion}>保存到穿搭集</button>
                </div>
              </>
            )}
          </article>
          <SpendCard tag="衣" label="本月衣类支出" />
          <article className="card">
            <h2>穿搭集</h2>
            {store.outfits.length === 0 ? <p className="muted">还没有保存的穿搭。</p> : store.outfits.map((outfit) => (
              <div className="outfit" key={outfit.id}>
                <button type="button" className="star" aria-label={outfit.favorite ? '取消收藏' : '收藏'} onClick={() => store.toggleFavorite(outfit.id)}>{outfit.favorite ? '★' : '☆'}</button>
                <div>
                  <strong>{outfit.name}</strong>
                  <p>{itemNames(store.items, outfit.itemIds).join('、') || '有单品已被删除'}</p>
                </div>
                <button type="button" className="btn-ghost small" onClick={() => store.applyOutfit(outfit.id)}>套用</button>
              </div>
            ))}
            {store.activeOutfitId ? <p className="muted">最近套用过一套穿搭。</p> : null}
          </article>
        </aside>
      </div>
      {editor ? <ItemModal initial={editor} onClose={() => setEditor(null)} /> : null}
      {batch ? <BatchModal initial={batch} onClose={() => setBatch(null)} /> : null}
    </>
  );
}

function readFile(file: File, kind: 'data' | 'text') {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    if (kind === 'data') reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

function ItemModal({ initial, onClose }: { initial: WardrobeItem | ClothingDraft | 'new'; onClose: () => void }) {
  const store = useStore();
  const editing = typeof initial === 'object' && 'id' in initial ? initial : null;
  const fromPhoto = initial !== 'new' && !editing;
  const [draft, setDraft] = useState<Draft>(editing ?? (initial === 'new' ? EMPTY : initial));
  const similar = store.items.filter((item) => item.id !== editing?.id && item.category === draft.category && draft.color && item.color === draft.color);

  function save() {
    if (!draft.name.trim() || !draft.color.trim()) return;
    if (editing) store.updateItem({ ...editing, ...draft, name: draft.name.trim(), color: draft.color.trim() });
    else store.addItem({ ...draft, name: draft.name.trim(), color: draft.color.trim() });
    onClose();
  }

  return (
    <Modal title={editing ? '编辑单品' : fromPhoto ? '确认入库' : '添加单品'} onClose={onClose}>
      {fromPhoto ? <p className="muted">分类、颜色和风格已由模型填好，场合里记的是风格。确认后入库。</p> : null}
      <form onSubmit={(event) => { event.preventDefault(); save(); }}>
        <div className="form-grid">
          <Field label="名称" wide><input autoFocus required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <Field label="分类">
            <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as WardrobeCategory })}>
              {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="季节"><input value={draft.season} onChange={(event) => setDraft({ ...draft, season: event.target.value })} /></Field>
          <Field label="颜色"><input required value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></Field>
          <Field label="场合"><input value={draft.occasion} onChange={(event) => setDraft({ ...draft, occasion: event.target.value })} /></Field>
        </div>
        {similar.length > 0 ? <p className="note" style={{ marginTop: 12 }}>衣橱里已有相近单品：{similar.map((item) => item.name).join('、')}</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn">{fromPhoto ? '确认入库' : '保存'}</button>
        </div>
      </form>
    </Modal>
  );
}

function BatchModal({ initial, onClose }: { initial: ClothingDraft[]; onClose: () => void }) {
  const store = useStore();
  const [rows, setRows] = useState(initial);

  return (
    <Modal title="确认入库" onClose={onClose}>
      <p className="muted">分类、颜色和风格已填好。确认后一起写入衣橱。</p>
      {rows.map((row, index) => (
        <div className="txn" key={`${row.name}-${index}`}>
          <span className="pill">{row.category}</span>
          <div>
            <strong>{row.name}</strong>
            <p className="muted">{row.color} · {row.occasion}</p>
          </div>
          <button type="button" className="btn-text small" onClick={() => setRows((current) => current.filter((_, item) => item !== index))}>去掉</button>
        </div>
      ))}
      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
        <button type="button" className="btn" disabled={rows.length === 0} onClick={() => { store.addItems(rows); onClose(); }}>确认入库</button>
      </div>
    </Modal>
  );
}
