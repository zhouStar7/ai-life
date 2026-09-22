import { useMemo, useState } from 'react';
import { colorHex, itemNames } from '../format';
import { useStore } from '../store';
import { CATEGORIES, type WardrobeCategory, type WardrobeItem } from '../types';
import { Empty, Field, Modal, SpendCard } from '../components/ui';

type Draft = Omit<WardrobeItem, 'id' | 'wears' | 'createdAt'>;

const EMPTY: Draft = { name: '', category: '上衣', season: '四季', color: '', occasion: '通勤' };

export function WardrobePage() {
  const store = useStore();
  const [category, setCategory] = useState<'全部' | WardrobeCategory>('全部');
  const [sort, setSort] = useState<'new' | 'wears'>('new');
  const [editor, setEditor] = useState<WardrobeItem | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const visible = useMemo(() => {
    const filtered = store.items.filter((item) => category === '全部' || item.category === category);
    return [...filtered].sort((a, b) => (sort === 'wears' ? b.wears - a.wears : b.createdAt.localeCompare(a.createdAt)));
  }, [category, sort, store.items]);

  return (
    <>
      <header className="page-head">
        <div>
          <p className="kicker">AI Life · 衣橱卷</p>
          <h1 className="display">本周衣橱</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p className="display" style={{ fontSize: 36 }}>{store.items.length} <span style={{ fontSize: 14, fontWeight: 400 }}>件单品</span></p>
          <button type="button" className="btn" data-testid="add-item" onClick={() => setEditor('new')}>拍照录入</button>
        </div>
      </header>
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
                desc="可以手动记一件，或从相册导入。演示里拍照会转到手动添加。"
                action={
                  <>
                    <button type="button" className="btn" onClick={() => setEditor('new')}>手动添加</button>
                    <button type="button" className="btn-ghost" onClick={() => setEditor('new')}>拍照导入</button>
                  </>
                }
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
            <button type="button" className="btn-text" onClick={store.toggleWeather}>{store.weatherOn ? '模拟无天气' : '恢复天气'}</button>
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
    </>
  );
}

function ItemModal({ initial, onClose }: { initial: WardrobeItem | 'new'; onClose: () => void }) {
  const store = useStore();
  const editing = initial === 'new' ? null : initial;
  const [draft, setDraft] = useState<Draft>(editing ?? EMPTY);
  const similar = store.items.filter((item) => item.id !== editing?.id && item.category === draft.category && draft.color && item.color === draft.color);

  function save() {
    if (!draft.name.trim() || !draft.color.trim()) return;
    if (editing) store.updateItem({ ...editing, ...draft, name: draft.name.trim(), color: draft.color.trim() });
    else store.addItem({ ...draft, name: draft.name.trim(), color: draft.color.trim() });
    onClose();
  }

  return (
    <Modal title={editing ? '编辑单品' : '添加单品'} onClose={onClose}>
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
          <button type="submit" className="btn">保存</button>
        </div>
      </form>
    </Modal>
  );
}
