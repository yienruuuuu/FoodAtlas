import { useEffect, useRef, useState } from 'react';
import { MapPin, Pencil, Shuffle, WalletCards, X } from 'lucide-react';
import type { CatalogOption, Restaurant } from './types';
import { restaurantBudget, restaurantCategories, restaurantCustomTags, restaurantLocation } from './catalog';
import { getAssetUrl } from './photos';
import './pick-result.css';
import { createShareCard, downloadShareCard, type BackgroundSource } from './shareCard';

export default function PickResult({ restaurant, options, onClose, onAgain, onEdit }: {
  restaurant: Restaurant; options: CatalogOption[]; onClose: () => void; onAgain: () => void; onEdit: () => void;
}) {
  const [cover, setCover] = useState<{id: string; url: string}>();
  const [shareOpen, setShareOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const shareJob = useRef<AbortController>();
  useEffect(() => {
    setShareOpen(false); setShareMessage(''); setSharing(false);
    return () => { shareJob.current?.abort(); shareJob.current = undefined; };
  }, [restaurant.id]);
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let disposed = false;
    let url: string | undefined;
    setCover(undefined);
    void getAssetUrl(restaurant.coverAssetId).then(value => {
      if (disposed) { if (value) URL.revokeObjectURL(value); return; }
      url = value;
      if (value && restaurant.coverAssetId) setCover({id: restaurant.coverAssetId, url: value});
    }).catch(() => setCover(undefined));
    return () => { disposed = true; if (url) URL.revokeObjectURL(url); };
  }, [restaurant.coverAssetId]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  const price = restaurantBudget(restaurant, options);
  const budgetLabel = options.find(o => o.id === restaurant.budgetOptionId && !o.deletedAt)?.label;
  const priceText = price.min === undefined && price.max === undefined ? '尚未提供預算'
    : price.min === undefined ? `$${price.max} 以下` : price.max === undefined ? `$${price.min} 起` : `$${price.min}–${price.max}`;
  const categories = restaurantCategories(restaurant, options);
  const tags = restaurantCustomTags(restaurant, options);
  async function share(source: BackgroundSource) {
    if (shareJob.current) return;
    const controller = new AbortController(); shareJob.current = controller;
    setSharing(true); setShareMessage('正在產生圖片…');
    try {
      const result = await createShareCard({ name: restaurant.name, categories, tags, location: restaurantLocation(restaurant, options), budget: budgetLabel || priceText, coverAssetId: restaurant.coverAssetId, mapUrl: restaurant.mapUrl }, source, controller.signal);
      controller.signal.throwIfAborted();
      downloadShareCard(result.blob, restaurant.name);
      setShareMessage(result.used === 'black' ? '照片皆無法使用，已改用黑底字卡下載。' : result.used !== source ? `已改用${result.used === 'random' ? '隨機照片' : '餐廳照片'}下載。` : '已開始下載圖片。');
    } catch {
      if (!controller.signal.aborted) setShareMessage('產生分享圖失敗，請再試一次。');
    } finally {
      if (shareJob.current === controller) { shareJob.current = undefined; setSharing(false); }
    }
  }
  return <div className="modal-backdrop pick-result-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={dialog} className="sheet pick-result" role="dialog" aria-modal="true" aria-labelledby="pick-result-title" onKeyDown={e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }}>
      <div className="pick-result-heading"><div><p className="eyebrow">TODAY’S PICK</p><span>今天，就吃這間？</span></div><button ref={closeButton} className="icon-btn" aria-label="關閉抽選結果" onClick={onClose}><X/></button></div>
      {cover?.id === restaurant.coverAssetId && cover && <img className="pick-result-cover" src={cover.url} alt={`${restaurant.name}的封面`} onError={()=>setCover(undefined)}/>}
      <div className="pick-result-summary" aria-live="polite" aria-atomic="true">
        <h2 id="pick-result-title">{restaurant.name}</h2>
        {(categories.length > 0 || tags.length > 0) && <div className="pick-result-tags">{categories.map(c=><span className="pill" key={`c-${c}`}>{c}</span>)}{tags.map(t=><span className="pill custom-detail-pill" key={`t-${t}`}>{t}</span>)}</div>}
        <dl className="pick-result-facts"><div><dt><MapPin size={17}/>位置</dt><dd>{restaurantLocation(restaurant,options) || '尚未提供位置'}</dd></div><div><dt><WalletCards size={17}/>每人預算</dt><dd>{budgetLabel || priceText}</dd></div></dl>
        {restaurant.memo?.trim() && <p className="pick-result-memo">{restaurant.memo}</p>}
      </div>
      {restaurant.mapUrl && <a className="pick-result-map" href={restaurant.mapUrl} target="_blank" rel="noreferrer"><MapPin size={16}/>開啟地圖 ↗</a>}
      <div className="pick-result-actions"><button disabled={sharing} className="primary-btn" onClick={onAgain}><Shuffle size={17}/>再抽一間</button><button disabled={sharing} className="secondary-btn" onClick={onEdit}><Pencil size={16}/>編輯餐廳</button></div>
      <button className="secondary-btn full-btn share-toggle" disabled={sharing} aria-expanded={shareOpen} aria-controls="share-backgrounds" onClick={()=>setShareOpen(value=>!value)}>{sharing ? '產生中…' : '分享下載'}</button>
      {shareOpen && <div id="share-backgrounds" className="share-backgrounds"><button disabled={sharing} onClick={()=>void share('random')}>隨機照片</button><button disabled={sharing} onClick={()=>void share('restaurant')}>餐廳照片</button></div>}
      {shareMessage && <p className="share-message" role="status">{shareMessage}</p>}
    </section>
  </div>;
}
