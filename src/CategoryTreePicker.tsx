import { useMemo, useState } from 'react';
import { Check, ChevronRight, Search, X } from 'lucide-react';
import type { CatalogOption } from './types';

export default function CategoryTreePicker({ options, selected, onChange, label, onManage }: {
  options: CatalogOption[]; selected: string[]; onChange: (ids: string[]) => void; label: string; onManage?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [activeRootId, setActiveRootId] = useState('');
  const [childQuery, setChildQuery] = useState('');
  const roots = useMemo(() => options.filter(o => o.kind === 'category' && !o.deletedAt && !o.parentOptionId), [options]);
  const children = useMemo(() => options.filter(o => o.kind === 'category' && !o.deletedAt && o.parentOptionId), [options]);
  const lowered = query.trim().toLocaleLowerCase();
  const visibleRoots = roots.filter(root => !lowered || root.label.toLocaleLowerCase().includes(lowered) || children.some(child => child.parentOptionId === root.id && child.label.toLocaleLowerCase().includes(lowered)));
  function toggle(id: string, rootId: string) {
    const branchIds = [rootId, ...children.filter(child => child.parentOptionId === rootId).map(child => child.id)];
    const branchSelected = selected.filter(value => branchIds.includes(value));
    const nextBranch = id === rootId
      ? (branchSelected.length === 1 && branchSelected[0] === rootId ? [] : [rootId])
      : (branchSelected.includes(id) ? branchSelected.filter(value => value !== id) : [...branchSelected.filter(value => value !== rootId), id]);
    onChange([...selected.filter(value => !branchIds.includes(value)), ...nextBranch]);
  }
  const activeRoot = roots.find(root => root.id === activeRootId);
  const activeChildren = activeRoot ? children.filter(child => child.parentOptionId === activeRoot.id) : [];
  const visibleChildren = activeChildren.filter(child => child.label.toLocaleLowerCase().includes(childQuery.trim().toLocaleLowerCase()));
  function openChildren(rootId: string) {
    setActiveRootId(rootId);
    setChildQuery('');
  }
  function closeChildren() {
    setActiveRootId('');
    setChildQuery('');
  }
  return <div className="category-tree-picker">
    <div className="category-tree-heading"><b>{label}</b><span>{selected.length ? `已選 ${selected.length} 種` : '可跨大類複選'}</span></div>
    <label className="category-tree-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋料理類型" aria-label="搜尋料理類型"/>{query&&<button type="button" onClick={()=>setQuery('')}>清除</button>}</label>
    <div className="category-tree-groups">{visibleRoots.map(root=>{
      const subs=children.filter(child=>child.parentOptionId===root.id);
      const rootSelected=selected.includes(root.id);
      return <section className="category-tree-group" key={root.id}>
        <div className="category-tree-parent-row"><button type="button" className="category-tree-toggle" aria-label={`開啟${root.label}子類`} aria-haspopup="dialog" onClick={()=>openChildren(root.id)}><ChevronRight size={16}/></button><button type="button" className={`category-tree-chip${rootSelected?' active':''}`} aria-pressed={rootSelected} onClick={()=>toggle(root.id,root.id)}>{root.label}{rootSelected&&<Check size={14}/>}</button><small>{subs.length} 子類</small></div>
      </section>;
    })}{!visibleRoots.length&&<p className="category-tree-empty">{roots.length?'沒有符合的料理類型':'請先新增料理大類'}</p>}</div>
    {onManage&&<button type="button" className="category-tree-manage" onClick={onManage}>管理料理類型</button>}
    {activeRoot&&<div className="category-sub-sheet-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)closeChildren();}}><section className="category-sub-sheet" role="dialog" aria-modal="true" aria-labelledby="category-sub-sheet-title"><div className="category-sub-sheet-header"><div><p className="eyebrow">料理子類</p><h3 id="category-sub-sheet-title">{activeRoot.label}<small>{activeChildren.length} 子類</small></h3></div><button type="button" className="icon-btn" aria-label="關閉" onClick={closeChildren}><X size={17}/></button></div><label className="category-tree-search"><Search size={15}/><input value={childQuery} onChange={event=>setChildQuery(event.target.value)} placeholder={`搜尋${activeRoot.label}子類`} aria-label={`搜尋${activeRoot.label}子類`}/>{childQuery&&<button type="button" onClick={()=>setChildQuery('')}>清除</button>}</label>{selected.includes(activeRoot.id)&&<p className="category-sub-sheet-hint">已選取整個{activeRoot.label}，點選子類可改為個別選取。</p>}<div className="category-sub-sheet-options">{visibleChildren.map(child=>{const active=selected.includes(activeRoot.id)||selected.includes(child.id);return <button type="button" className={`category-sub-option${active?' active':''}`} key={child.id} aria-pressed={active} onClick={()=>toggle(child.id,activeRoot.id)}><span>{child.label}</span>{active&&<Check size={17}/>}</button>})}{!visibleChildren.length&&<p className="category-tree-empty">沒有符合的子類</p>}</div><div className="category-sub-sheet-footer"><span>{selected.includes(activeRoot.id)?'已選整個大類':`已選 ${activeChildren.filter(child=>selected.includes(child.id)).length} 種`}</span><button type="button" className="primary-btn" onClick={closeChildren}>完成</button></div></section></div>}
  </div>;
}
