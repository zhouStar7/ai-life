import { useMemo, useRef, useState } from 'react';
import { colorHex, itemNames, yuan } from '../format';
import { useStore } from '../store';
import { CATEGORIES, type ClothingDraft, type WardrobeCategory, type WardrobeItem } from '../types';
import { readClothingPhotos } from '../wardrobePhotos';
import { blankDraft } from '../wardrobePlan';
import { Empty, SpendCard } from '../components/ui';
import { BatchModal, ItemModal, OrderModal } from '../components/WardrobeEntry';


export function WardrobePage() {
  const store = useStore();
  const [category, setCategory] = useState<'全部' | WardrobeCategory>('全部');
  const [sort, setSort] = useState<'new' | 'wears'>('new');
  const [editor, setEditor] = useState<WardrobeItem | ClothingDraft | 'new' | null>(null);
  const [batch, setBatch] = useState<ClothingDraft[] | null>(null);
  const [batchManual, setBatchManual] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [reading, setReading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const filtered = store.items.filter((item) => category === '全部' || item.category === category);
    return [...filtered].sort((a, b) => (sort === 'wears' ? b.wears - a.wears : b.createdAt.localeCompare(a.createdAt)));
  }, [category, sort, store.items]);

  async function onPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setReading(true);
    setPhotoError('');
    try {
      const result = await readClothingPhotos(Array.from(files), store.recognizeClothing);
      if (result.failed.length) setPhotoError(`${result.failed.length} 张照片读取失败，请重新选择 JPG、PNG 或 WebP 图片。`);
      if (result.drafts.length === 1) setEditor(result.drafts[0]);
      else if (result.drafts.length > 1) { setBatchManual(result.manual); setBatch(result.drafts); }
    } finally {
      setReading(false);
      if (photoRef.current) photoRef.current.value = '';
    }
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
          <button type="button" className="btn-ghost" disabled={reading} onClick={() => setOrdering(true)}>粘贴订单</button>
          <button type="button" className="btn-ghost" data-testid="batch-items" disabled={reading} onClick={() => { setBatchManual(true); setBatch([blankDraft(), blankDraft()]); }}>批量入库</button>
          <button type="button" className="btn" data-testid="add-item" disabled={reading} onClick={() => setEditor('new')}>添加单品</button>
        </div>
      </header>
      <input ref={photoRef} hidden type="file" accept="image/*" multiple onChange={(event) => { void onPhotos(event.target.files); }} />
      {photoError ? <p className="note" role="alert">{photoError}</p> : null}
      <div className="layout-2">
        <section>
          <div className="pills">
            <button type="button" className={category === '全部' ? 'pill active' : 'pill'} onClick={() => setCategory('全部')}>全部</button>
            {CATEGORIES.map((item) => (
              <button type="button" key={item} className={category === item ? 'pill active' : 'pill'} onClick={() => setCategory(item)}>{item}</button>
            ))}
          </div>
          <div className="wardrobe-sort">
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
                  <div className="swatch swatch-tile">
                    {item.cover ? <img src={item.cover} alt={item.name} loading="lazy" decoding="async" /> : <span className={`swatch-dot swatch-${item.category}`} style={{ background: colorHex(item.color), boxShadow: item.color === '白色' ? 'inset 0 0 0 1px #dbe2e8, 0 18px 34px rgba(15, 23, 42, 0.14)' : undefined }} />}
                  </div>
                  <h3>{item.name}</h3>
                  <span className="pill">{item.category}</span>
                  <p className="meta">{item.season} · {item.color} · {item.occasion}</p>
                  <p className="wears">穿过 {item.wears} 次{item.price != null ? ` · 购入 ${yuan(item.price)}` : ''}</p>
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
            <div className="weather">{store.weatherOn ? store.weatherLabel : '天气未知'}</div>
            {store.suggestion.source === 'model' ? <p className="meta">由已连接的模型从衣橱里选出</p> : null}
            {store.items.length === 0 ? (
              <p className="reason">还没有单品，建议会在你添加之后出现。</p>
            ) : (
              <>
                <h3>{store.suggestion.title}</h3>
                <p className="reason">{store.suggestion.reason.split('。').slice(1).join('。') || store.suggestion.reason}</p>
                <div className="row-actions">
                  <button type="button" className="btn small" data-testid="adopt-outfit" disabled={store.outfitAdopted || store.suggestion.itemIds.length === 0} onClick={store.adoptOutfitSuggestion}>
                    {store.outfitAdopted ? '已采纳' : '采纳'}
                  </button>
                  <button type="button" className="btn-ghost small" disabled={store.suggesting} onClick={store.refreshSuggestion}>{store.suggesting ? '搭配中…' : '换一换'}</button>
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
      {batch ? <BatchModal initial={batch} manual={batchManual} onClose={() => setBatch(null)} /> : null}
      {ordering ? <OrderModal onClose={() => setOrdering(false)} onDrafts={(drafts) => { setOrdering(false); setBatchManual(drafts.some((draft) => !draft.name || !draft.color)); setBatch(drafts); }} /> : null}
    </>
  );
}
