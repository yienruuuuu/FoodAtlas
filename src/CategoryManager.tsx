import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type { CatalogOption } from './types';

type SaveCategory = (label: string, parentId?: string, option?: CatalogOption) => Promise<void>;
export default function CategoryManager({ options, onSave, onDelete, busy }: {
  options: CatalogOption[]; onSave: SaveCategory; onDelete: (option: CatalogOption) => void; busy: boolean;
}) {
  const [search, setSearch] = useState(''); const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addRoot, setAddRoot] = useState(false); const [addChild, setAddChild] = useState('');
  const [editingId, setEditingId] = useState(''); const [label, setLabel] = useState(''); const [parentId, setParentId] = useState('');
  const roots = useMemo(()=>options.filter(o=>o.kind==='category'&&!o.deletedAt&&!o.parentOptionId).sort((a,b)=>a.label.localeCompare(b.label,'zh-Hant')),[options]);
  const children = useMemo(()=>options.filter(o=>o.kind==='category'&&!o.deletedAt&&o.parentOptionId),[options]);
  const term=search.trim().toLocaleLowerCase();
  const groups=roots.filter(root=>!term||root.label.toLocaleLowerCase().includes(term)||children.some(child=>child.parentOptionId===root.id&&child.label.toLocaleLowerCase().includes(term)));
  function beginEdit(option:CatalogOption){setEditingId(option.id);setLabel(option.label);setParentId(option.parentOptionId??'');setAddRoot(false);setAddChild('');}
  function stopEdit(){setEditingId('');setLabel('');setParentId('');}
  async function save(parent?:string, option?:CatalogOption){if(!label.trim())return;await onSave(label,parent,option);stopEdit();setAddRoot(false);setAddChild('');setLabel('');}
  function editor(parent:string, option?:CatalogOption){return <form className="category-inline-editor" key={`edit-${option?.id??parent}`} onSubmit={e=>{e.preventDefault();void save(parent||undefined,option);}}><input autoFocus maxLength={80} aria-label={option?'料理類型名稱':'新增料理類型名稱'} value={label} onChange={e=>setLabel(e.target.value)} placeholder={parent?'例如：生魚片':'例如：日式'}/>{option?.parentOptionId&&<select aria-label="子類所屬大類" value={parentId} onChange={e=>setParentId(e.target.value)}>{roots.filter(root=>root.id!==option.id).map(root=><option key={root.id} value={root.id}>{root.label}</option>)}</select>}<button type="submit" className="primary-btn" disabled={busy}>{busy?'儲存中…':'儲存'}</button><button type="button" className="secondary-btn" onClick={stopEdit}><X size={15}/></button></form>;}
  return <section className="category-manager" aria-label="料理類型維護">
    <div className="category-manager-toolbar"><div><h3>料理大類</h3><p>{roots.length} 個大類 · {children.length} 個子類</p></div><button className="primary-btn" type="button" onClick={()=>{setAddRoot(value=>!value);stopEdit();setLabel('');setAddChild('');}}><Plus size={16}/>新增大類</button></div>
    <label className="category-manager-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜尋大類或子類" aria-label="搜尋料理大類與子類"/>{search&&<button type="button" onClick={()=>setSearch('')}>清除</button>}</label>
    {addRoot&&editor('')}
    <div className="category-manager-list">{groups.map(root=>{
      const subs=children.filter(child=>child.parentOptionId===root.id).sort((a,b)=>a.label.localeCompare(b.label,'zh-Hant'));
      const open=!!term||expanded.has(root.id);
      return <article className="category-manager-group" key={root.id}>
        <div className="category-manager-root"><button className="category-manager-expand" aria-label={`${open?'收合':'展開'}${root.label}`} aria-expanded={open} onClick={()=>setExpanded(current=>{const next=new Set(current);next.has(root.id)?next.delete(root.id):next.add(root.id);return next;})}>{open?<ChevronDown size={17}/>:<ChevronRight size={17}/>}</button><div className="category-manager-names"><b>{root.label}</b><small>{subs.length} 個子類</small></div><div className="category-manager-actions"><button aria-label={`新增${root.label}子類`} title="新增子類" onClick={()=>{setAddChild(root.id);setLabel('');stopEdit();setAddRoot(false);setExpanded(current=>new Set(current).add(root.id));}}><Plus size={16}/></button><button aria-label={`編輯${root.label}`} onClick={()=>beginEdit(root)}><Pencil size={15}/></button><button aria-label={`刪除${root.label}`} onClick={()=>onDelete(root)}><Trash2 size={15}/></button></div></div>
        {editingId===root.id&&editor('')}
        {open&&<div className="category-manager-children">{subs.filter(child=>!term||root.label.toLocaleLowerCase().includes(term)||child.label.toLocaleLowerCase().includes(term)).map(child=><div className="category-manager-child-wrap" key={child.id}><div className="category-manager-child"><span>↳</span><b>{child.label}</b><div className="category-manager-actions"><button aria-label={`編輯${root.label}/${child.label}`} onClick={()=>beginEdit(child)}><Pencil size={15}/></button><button aria-label={`刪除${root.label}/${child.label}`} onClick={()=>onDelete(child)}><Trash2 size={15}/></button></div></div>{editingId===child.id&&editor(parentId,child)}</div>)}{addChild===root.id&&editor(root.id)}</div>}
      </article>;
    })}{!groups.length&&<p className="category-tree-empty">{roots.length?'沒有符合的料理類型':'尚無大類，先新增一個料理大類。'}</p>}</div>
  </section>;
}
