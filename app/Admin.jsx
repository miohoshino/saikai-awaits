"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const KIND_LABELS={event:"イベント",news:"GOOD NEWS",work:"仕事・募集",community:"コミュニティ",challenge:"チャレンジ"};
const ORIGIN_LABELS={member:"会員投稿",admin:"運営",ingest:"自動収集"};
const STATUS_LABELS={pending:"確認待ち",published:"公開中",rejected:"見送り",archived:"終了"};
const DETAIL_FIELDS={
  event:[["date","日付","date"],["time","時間","text"],["venue","場所","text"],["price","参加費","text"],["capacity","定員","number"]],
  work:[["reward","報酬","text"],["type","形態","text"],["organization","依頼元","text"]],
  news:[],community:[],challenge:[]
};
const ADMIN_ENTRY_COLUMNS="id,kind,status,origin,title,summary,body,area,tags,details,image_url,source_name,source_url,community_id,review_note,published_at,created_at,submitter:members!entries_submitted_by_fkey(name)";

const TABS=[["pending","確認待ち"],["published","公開中"],["closed","見送り・終了"],["invites","招待コード"]];

export default function Admin({onBack,onChanged}){
  const [tab,setTab]=useState("pending");
  const [counts,setCounts]=useState({});

  async function loadCounts(){
    const {data}=await supabase.from("entries").select("status");
    const c={};
    for(const r of data||[]) c[r.status]=(c[r.status]||0)+1;
    setCounts(c);
  }
  useEffect(()=>{loadCounts();},[]);

  async function changed(){
    await Promise.all([loadCounts(),onChanged?.()]);
  }

  return <div className="adminPage">
    <header className="detailHeader adminHeader"><button onClick={onBack} aria-label="戻る">‹</button><b>運営メニュー</b><span></span></header>
    <nav className="adminTabs">
      {TABS.map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>
        {label}{id==="pending"&&counts.pending?<i>{counts.pending}</i>:null}
      </button>)}
    </nav>
    <section className="adminBody">
      {tab==="invites"
        ? <InviteManager/>
        : <EntryList key={tab} statuses={tab==="closed"?["rejected","archived"]:[tab]} allowCreate={tab==="published"} onChanged={changed}/>}
    </section>
  </div>;
}

function EntryList({statuses,allowCreate,onChanged}){
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [editing,setEditing]=useState(null);
  const [error,setError]=useState("");
  const [communities,setCommunities]=useState([]);

  async function load(){
    setLoading(true);
    const {data:hosts}=await supabase.from("entries").select("id,kind,title").in("kind",["community","challenge"]).eq("status","published").order("title");
    setCommunities(hosts||[]);
    const {data,error}=await supabase.from("entries").select(ADMIN_ENTRY_COLUMNS).in("status",statuses).order("created_at",{ascending:false});
    if(error) setError("読み込めませんでした。");
    setItems(data||[]); setLoading(false);
  }
  useEffect(()=>{load();},[]);

  async function review(item,status){
    let note="";
    if(status==="rejected"){
      note=window.prompt("見送りの理由（任意・投稿者のマイページには表示されません）","");
      if(note===null) return;
    }
    const {error}=await supabase.rpc("review_entry",{p_entry:item.id,p_status:status,p_note:note});
    if(error){setError("更新できませんでした。");return;}
    setError(""); await load(); await onChanged();
  }

  async function save(item,values){
    const payload={
      kind:values.kind,title:values.title.trim(),summary:values.summary.trim(),body:values.body.trim(),
      area:values.area.trim(),tags:splitList(values.tags),image_url:values.image_url.trim(),
      source_url:values.source_url.trim(),details:{...(item?.details||{}),...values.details},
      community_id:values.kind==="event"&&values.community_id?values.community_id:null
    };
    const {error}=item
      ? await supabase.from("entries").update(payload).eq("id",item.id)
      : await supabase.from("entries").insert({...payload,status:"published",origin:"admin",source_name:"運営"});
    if(error){setError(error.message.includes("check")?"入力内容を確認してください（タイトルは3〜140文字）。":"保存できませんでした。");return false;}
    setError(""); setEditing(null); await load(); await onChanged(); return true;
  }

  if(editing) return <EntryEditor item={editing==="new"?null:editing} communities={communities} onSave={save} onCancel={()=>{setEditing(null);setError("");}} error={error}/>;

  return <>
    {allowCreate&&<button className="primaryCta fullCta adminCreate" onClick={()=>setEditing("new")}>＋ 運営として新規作成</button>}
    {error&&<div className="inlineMessage">{error}</div>}
    {loading?<p className="adminEmpty">読み込み中…</p>:!items.length?<p className="adminEmpty">該当する投稿はありません。</p>:
    <div className="adminList">{items.map(item=><article key={item.id} className="adminCard">
      <div className="adminMeta">
        <span className="adminKind">{KIND_LABELS[item.kind]}</span>
        <span>{ORIGIN_LABELS[item.origin]}{item.submitter?.name?`：${item.submitter.name}`:""}</span>
        {statuses.length>1&&<span className="adminStatus">{STATUS_LABELS[item.status]}</span>}
        <small>{formatDateTime(item.created_at)}</small>
      </div>
      <h3>{item.title}</h3>
      {item.summary&&<p>{item.summary}</p>}
      <dl className="adminFacts">
        {item.area&&<><dt>エリア</dt><dd>{item.area}</dd></>}
        {(DETAIL_FIELDS[item.kind]||[]).filter(([k])=>item.details?.[k]).map(([k,label])=><span key={k} className="adminFactPair"><dt>{label}</dt><dd>{String(item.details[k])}</dd></span>)}
        {item.origin==="ingest"&&item.details?.score!=null&&<><dt>分類</dt><dd>{item.details.classifier==="ai"?"AI":"ルール"}・確度 {Math.round(Number(item.details.score)*100)}%</dd></>}
        {item.review_note&&<><dt>メモ</dt><dd>{item.review_note}</dd></>}
      </dl>
      {item.source_url&&<a className="adminSource" href={item.source_url} target="_blank" rel="noopener noreferrer">元ページを開く ↗</a>}
      <div className="adminActions">
        <button className="secondaryCta" onClick={()=>setEditing(item)}>編集</button>
        {item.status==="pending"&&<>
          <button className="secondaryCta dangerCta" onClick={()=>review(item,"rejected")}>見送り</button>
          <button className="primaryCta" onClick={()=>review(item,"published")}>公開する</button>
        </>}
        {item.status==="published"&&<button className="secondaryCta dangerCta" onClick={()=>window.confirm("この投稿を終了して非公開にしますか？")&&review(item,"archived")}>終了する</button>}
        {(item.status==="rejected"||item.status==="archived")&&<button className="secondaryCta" onClick={()=>review(item,"pending")}>確認待ちに戻す</button>}
      </div>
    </article>)}</div>}
  </>;
}

function EntryEditor({item,communities,onSave,onCancel,error}){
  const [values,setValues]=useState({
    kind:item?.kind||"event",title:item?.title||"",summary:item?.summary||"",body:item?.body||"",
    area:item?.area||"",tags:(item?.tags||[]).join(", "),image_url:item?.image_url||"",source_url:item?.source_url||"",community_id:item?.community_id||"",
    details:Object.fromEntries(Object.values(DETAIL_FIELDS).flat().map(([k])=>[k,item?.details?.[k]??""]))
  });
  const [saving,setSaving]=useState(false);
  const set=(k,v)=>setValues({...values,[k]:v});
  const setDetail=(k,v)=>setValues({...values,details:{...values.details,[k]:v}});

  async function submit(e){
    e.preventDefault(); setSaving(true);
    const fields=DETAIL_FIELDS[values.kind]||[];
    const details=Object.fromEntries(fields.map(([k,,type])=>[k,type==="number"&&values.details[k]!==""?Number(values.details[k]):values.details[k]]));
    await onSave(item,{...values,details});
    setSaving(false);
  }

  return <form className="entryForm adminEditor" onSubmit={submit}>
    <div className="formTitle"><b>{item?"投稿を編集":"新規作成（公開されます）"}</b><button type="button" onClick={onCancel} aria-label="閉じる">×</button></div>
    {error&&<div className="inlineMessage">{error}</div>}
    <label>種類<select value={values.kind} onChange={e=>set("kind",e.target.value)}>{Object.entries(KIND_LABELS).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
    <label>タイトル<input required minLength={3} maxLength={140} value={values.title} onChange={e=>set("title",e.target.value)}/></label>
    <label>概要<textarea rows="3" maxLength={500} value={values.summary} onChange={e=>set("summary",e.target.value)}/></label>
    <label>本文<textarea rows="5" maxLength={5000} value={values.body} onChange={e=>set("body",e.target.value)}/></label>
    <div className="formTwo">
      <label>エリア<input maxLength={80} value={values.area} onChange={e=>set("area",e.target.value)}/></label>
      <label>タグ（カンマ区切り）<input value={values.tags} onChange={e=>set("tags",e.target.value)}/></label>
    </div>
    {values.kind==="event"&&<label>主催コミュニティ・チャレンジ<select value={values.community_id} onChange={e=>set("community_id",e.target.value)}><option value="">なし（SAIKAI AWAITS 主催）</option>{communities.map(c=><option key={c.id} value={c.id}>{KIND_LABELS[c.kind]}：{c.title}</option>)}</select></label>}
    {(DETAIL_FIELDS[values.kind]||[]).length>0&&<div className="formTwo">
      {DETAIL_FIELDS[values.kind].map(([k,label,type])=><label key={k}>{label}<input type={type} min={type==="number"?0:undefined} value={values.details[k]} onChange={e=>setDetail(k,e.target.value)}/></label>)}
    </div>}
    <label>画像URL<input type="url" value={values.image_url} onChange={e=>set("image_url",e.target.value)} placeholder="https://"/></label>
    <label>元ページURL<input type="url" value={values.source_url} onChange={e=>set("source_url",e.target.value)} placeholder="https://"/></label>
    <button className="primaryCta fullCta" disabled={saving}>{saving?"保存中…":"保存する"}</button>
  </form>;
}

function InviteManager(){
  const [invites,setInvites]=useState([]);
  const [form,setForm]=useState({role:"member",max_uses:1,note:"",days:""});
  const [created,setCreated]=useState(null);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);

  async function load(){
    const {data}=await supabase.from("invites").select("*").order("created_at",{ascending:false});
    setInvites(data||[]);
  }
  useEffect(()=>{load();},[]);

  async function create(e){
    e.preventDefault(); setSaving(true);
    if(form.role==="admin"&&!window.confirm("管理者用のコードを発行します。このコードで入った人は運営メニューを使えます。よろしいですか？")){setSaving(false);return;}
    const expires=form.days?new Date(Date.now()+Number(form.days)*86400000).toISOString():null;
    const {data,error}=await supabase.rpc("create_invite",{p_role:form.role,p_max_uses:Number(form.max_uses)||1,p_note:form.note.trim(),p_expires_at:expires});
    setSaving(false);
    if(error){setError("発行できませんでした。");return;}
    setError(""); setCreated(data); setForm({...form,note:""}); await load();
  }

  async function toggleRevoked(inv){
    if(!inv.revoked&&!window.confirm(`招待コード「${inv.code}」を無効にしますか？`)) return;
    const {error}=await supabase.from("invites").update({revoked:!inv.revoked}).eq("id",inv.id);
    if(error){setError("更新できませんでした。");return;}
    await load();
  }

  return <>
    <form className="entryForm" onSubmit={create}>
      <div className="formTitle"><b>招待コードを発行</b></div>
      <div className="formTwo">
        <label>種類<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="member">一般会員</option><option value="admin">管理者</option></select></label>
        <label>使える人数<input type="number" min="1" max="500" value={form.max_uses} onChange={e=>setForm({...form,max_uses:e.target.value})}/></label>
      </div>
      <div className="formTwo">
        <label>メモ（誰に渡すか）<input value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="〇〇さん / 11月交流会"/></label>
        <label>有効期限（日数・空欄で無期限）<input type="number" min="1" value={form.days} onChange={e=>setForm({...form,days:e.target.value})}/></label>
      </div>
      <button className="primaryCta fullCta" disabled={saving}>{saving?"発行中…":"発行する"}</button>
    </form>
    {error&&<div className="inlineMessage">{error}</div>}
    {created&&<div className="inviteCreated">
      <small>発行しました</small>
      <strong>{created.code}</strong>
      <button className="secondaryCta" onClick={()=>navigator.clipboard?.writeText(created.code)}>コピー</button>
    </div>}
    <div className="adminList">{invites.map(inv=>{
      const expired=inv.expires_at&&new Date(inv.expires_at)<=new Date();
      const usedUp=inv.used_count>=inv.max_uses;
      const state=inv.revoked?"無効":expired?"期限切れ":usedUp?"使用済み":"有効";
      return <article key={inv.id} className={"inviteRow"+(state==="有効"?"":" inactive")}>
        <div>
          <b>{inv.code}</b>
          <small>{inv.role==="admin"?"管理者 · ":""}{inv.used_count} / {inv.max_uses}人{inv.expires_at?` · ${formatDateTime(inv.expires_at)}まで`:""}{inv.note?` · ${inv.note}`:""}</small>
        </div>
        <span className="adminStatus">{state}</span>
        <button className="secondaryCta" onClick={()=>toggleRevoked(inv)}>{inv.revoked?"有効化":"無効化"}</button>
      </article>;
    })}</div>
  </>;
}

function splitList(v=""){return v.split(/[,、]/).map(x=>x.trim()).filter(Boolean).slice(0,8);}

function formatDateTime(v){
  if(!v) return "";
  const d=new Date(v);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
