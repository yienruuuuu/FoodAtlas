import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import type { CatalogOption } from './types';

export default function CategoryTreePicker({ options, selected, onChange, label, onManage }: {
  options: CatalogOption[]; selected: string[]; onChange: (ids: string[]) => void; label: string; onManage?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
  return <div className="category-tree-picker">
    <div className="category-tree-heading"><b>{label}</b><span>可跨大類複選</span></div>
    <label className="category-tree-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋料理類型" aria-label="搜尋料理類型"/>{query&&<button type="button" onClick={()=>setQuery('')}>清除</button>}</label>
    <div className="category-tree-groups">{visibleRoots.map(root=>{
      const subs=children.filter(child=>child.parentOptionId===root.id);
      const isOpen=!!lowered||expanded.has(root.id);
      const rootSelected=selected.includes(root.id);
      return <section className="category-tree-group" key={root.id}>
        <div className="category-tree-parent-row"><button type="button" className={`category-tree-toggle${isOpen?' open':''}`} aria-label={`${isOpen?'收合':'展開'}${root.label}`} aria-expanded={isOpen} onClick={()=>setExpanded(current=>{const next=new Set(current);next.has(root.id)?next.delete(root.id):next.add(root.id);return next;})}>{isOpen?'⌄':'›'}</button><button type="button" className={`category-tree-chip${rootSelected?' active':''}`} aria-pressed={rootSelected} onClick={()=>toggle(root.id,root.id)}>{root.label}{rootSelected&&<Check size={14}/>}</button><small>{subs.length} 子類</small></div>
        {isOpen&&subs.filter(child=>!lowered||root.label.toLocaleLowerCase().includes(lowered)||child.label.toLocaleLowerCase().includes(lowered)).length>0&&<div className="category-tree-children">{subs.filter(child=>!lowered||root.label.toLocaleLowerCase().includes(lowered)||child.label.toLocaleLowerCase().includes(lowered)).map(child=>{const active=selected.includes(child.id);return <button type="button" className={`category-tree-chip child${active?' active':''}`} key={child.id} aria-pressed={active} onClick={()=>toggle(child.id,root.id)}>{child.label}{active&&<Check size={14}/>}</button>;})}</div>}
      </section>;
    })}{!visibleRoots.length&&<p className="category-tree-empty">{roots.length?'沒有符合的料理類型':'請先新增料理大類'}</p>}</div>
    {onManage&&<button type="button" className="category-tree-manage" onClick={onManage}>管理料理類型</button>}
  </div>;
}
