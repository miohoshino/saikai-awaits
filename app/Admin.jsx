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

// Old news/event review tabs are hidden (out of spec); their data and EntryList code are kept.
const TABS=[["clubs","クラブ"],["members","会員"],["tags","タグ"],["invites","招待コード"]];

export default function Admin({onBack,onChanged,selfId}){
  const [tab,setTab]=useState("clubs");

  return <div className="adminPage">
    <header className="detailHeader adminHeader"><button onClick={onBack} aria-label="戻る">‹</button><b>運営メニュー</b><span></span></header>
    <nav className="adminTabs">
      {TABS.map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}
    </nav>
    <section className="adminBody">
      {tab==="clubs"&&<ClubManager onChanged={onChanged}/>}
      {tab==="members"&&<MemberManager onChanged={onChanged} selfId={selfId}/>}
      {tab==="tags"&&<TagManager onChanged={onChanged}/>}
      {tab==="invites"&&<InviteManager/>}
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

function ClubManager({onChanged}){
  const [clubs,setClubs]=useState([]);
  const [error,setError]=useState("");
  const [busyId,setBusyId]=useState(null);

  async function load(){
    const [c,m]=await Promise.all([
      supabase.from("clubs").select("id,name,district,hidden,updated_at").order("updated_at",{ascending:false}),
      supabase.from("club_members").select("club_id")
    ]);
    if(c.error){setError("クラブを読み込めませんでした。");return;}
    const counts={};
    for(const x of m.data||[]) counts[x.club_id]=(counts[x.club_id]||0)+1;
    setClubs((c.data||[]).map(x=>({...x,members:counts[x.id]||0})));
  }
  useEffect(()=>{load();},[]);

  async function run(id,fn){
    setBusyId(id);
    const {error}=await fn();
    setBusyId(null);
    if(error){setError("更新できませんでした。");return;}
    setError(""); await load(); await onChanged?.();
  }

  function toggleHidden(c){
    const msg=c.hidden?`「${c.name}」を表示に戻しますか？`:`「${c.name}」を非表示にしますか？運営以外の人には見えなくなります。`;
    if(!window.confirm(msg)) return;
    run(c.id,()=>supabase.rpc("admin_set_club_hidden",{p_club:c.id,p_hidden:!c.hidden}));
  }

  function remove(c){
    if(!window.confirm(`「${c.name}」を削除しますか？\nクラブと、所属の記録（${c.members}人分）が消えます。`)) return;
    if(!window.confirm("本当に削除しますか？元には戻せません。")) return;
    run(c.id,()=>supabase.rpc("admin_delete_club",{p_club:c.id}));
  }

  return <>
    {error&&<div className="inlineMessage">{error}</div>}
    {!clubs.length&&<p className="emptyNote">クラブはまだありません。</p>}
    <div className="adminList">{clubs.map(c=><article key={c.id} className={"inviteRow adminRow"+(c.hidden?" inactive":"")}>
      <div>
        <b>{c.name}{c.hidden&&<span className="adminStatus">非表示</span>}</b>
        <small>{c.district||"地区未設定"} · {c.members}人 · {formatDateTime(c.updated_at)}更新</small>
      </div>
      <div className="adminActions">
        <button className="secondaryCta" disabled={busyId===c.id} onClick={()=>toggleHidden(c)}>{c.hidden?"表示に戻す":"非表示にする"}</button>
        <button className="secondaryCta dangerCta" disabled={busyId===c.id} onClick={()=>remove(c)}>削除</button>
      </div>
    </article>)}</div>
  </>;
}

function MemberManager({onChanged,selfId}){
  const [members,setMembers]=useState([]);
  const [error,setError]=useState("");
  const [busyId,setBusyId]=useState(null);

  async function load(){
    const {data,error}=await supabase.from("members").select("id,name,area,role,is_minor,visible,created_at").order("created_at",{ascending:false});
    if(error){setError("会員を読み込めませんでした。");return;}
    setMembers(data||[]);
  }
  useEffect(()=>{load();},[]);

  async function run(id,fn,failMsg="更新できませんでした。"){
    setBusyId(id);
    const {error}=await fn();
    setBusyId(null);
    if(error){setError(failMsg);return;}
    setError(""); await load(); await onChanged?.();
  }

  const nameOf=m=>m.name||"名前未設定の会員";

  function toggleMinor(m){
    const msg=m.is_minor?`「${nameOf(m)}」の未成年マークを外しますか？`:`「${nameOf(m)}」に未成年マークを付けますか？\nその人の「よくいる場所」と「連絡先」は消えます。`;
    if(!window.confirm(msg)) return;
    run(m.id,()=>supabase.rpc("set_member_minor",{p_member:m.id,p_is_minor:!m.is_minor}));
  }

  function toggleVisible(m){
    const msg=m.visible?`「${nameOf(m)}」を非表示にしますか？運営以外の人には見えなくなります。`:`「${nameOf(m)}」を表示に戻しますか？`;
    if(!window.confirm(msg)) return;
    run(m.id,()=>supabase.rpc("admin_set_member_visible",{p_member:m.id,p_visible:!m.visible}));
  }

  function remove(m){
    if(!window.confirm(`「${nameOf(m)}」を削除しますか？\nアカウント、プロフィール、所属がすべて消え、この人はもう入れなくなります。`)) return;
    if(!window.confirm("本当に削除しますか？元には戻せません。")) return;
    run(m.id,()=>supabase.rpc("admin_delete_member",{p_member:m.id}),"削除できませんでした。");
  }

  return <>
    {error&&<div className="inlineMessage">{error}</div>}
    <div className="adminList">{members.map(m=><article key={m.id} className={"inviteRow adminRow"+(m.visible?"":" inactive")}>
      <div>
        <b>{m.name||"名前未設定"}{m.is_minor&&<span className="minorBadge">未成年</span>}{!m.visible&&<span className="adminStatus">非表示</span>}</b>
        <small>{m.role==="admin"?"運営 · ":""}{m.area||"地区未設定"} · {formatDateTime(m.created_at)}登録{m.id===selfId?" · あなた":""}</small>
      </div>
      <div className="adminActions">
        <button className="secondaryCta" disabled={busyId===m.id} onClick={()=>toggleMinor(m)}>{m.is_minor?"マークを外す":"未成年にする"}</button>
        {m.id!==selfId&&<>
          <button className="secondaryCta" disabled={busyId===m.id} onClick={()=>toggleVisible(m)}>{m.visible?"非表示にする":"表示に戻す"}</button>
          <button className="secondaryCta dangerCta" disabled={busyId===m.id} onClick={()=>remove(m)}>削除</button>
        </>}
      </div>
    </article>)}</div>
  </>;
}

function TagManager({onChanged}){
  const [tags,setTags]=useState([]);
  const [draft,setDraft]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  async function load(){
    const [t,m]=await Promise.all([
      supabase.from("tags").select("label,is_official"),
      supabase.from("members").select("tags")
    ]);
    if(t.error){setError("タグを読み込めませんでした。");return;}
    const uses={};
    for(const x of m.data||[]) for(const l of x.tags||[]) uses[l]=(uses[l]||0)+1;
    setTags((t.data||[]).map(x=>({...x,uses:uses[x.label]||0}))
      .sort((a,b)=>Number(b.is_official)-Number(a.is_official)||b.uses-a.uses||a.label.localeCompare(b.label,"ja")));
  }
  useEffect(()=>{load();},[]);

  async function add(e){
    e.preventDefault();
    const label=draft.trim();
    if(!label) return;
    setBusy(true);
    const {error}=await supabase.rpc("admin_add_tag",{p_label:label});
    setBusy(false);
    if(error){setError("追加できませんでした（40文字まで）。");return;}
    setError(""); setDraft(""); await load(); await onChanged?.();
  }

  async function remove(t){
    const msg=t.uses
      ? `タグ「${t.label}」を削除しますか？\n付けている${t.uses}人のプロフィールからも外れます。元には戻せません。`
      : `タグ「${t.label}」を削除しますか？`;
    if(!window.confirm(msg)) return;
    setBusy(true);
    const {error}=await supabase.rpc("admin_delete_tag",{p_label:t.label});
    setBusy(false);
    if(error){setError("削除できませんでした。");return;}
    setError(""); await load(); await onChanged?.();
  }

  return <>
    <form className="entryForm" onSubmit={add}>
      <div className="formTitle"><b>運営のタグを追加</b></div>
      <div className="adminTagAdd">
        <input value={draft} maxLength={40} onChange={e=>setDraft(e.target.value)} placeholder="例：元バレー部" aria-label="追加するタグ"/>
        <button className="primaryCta" disabled={busy||!draft.trim()}>追加</button>
      </div>
    </form>
    {error&&<div className="inlineMessage">{error}</div>}
    <div className="adminList">{tags.map(t=><article key={t.label} className="inviteRow adminRow">
      <div>
        <b>{t.label}{t.is_official&&<span className="adminStatus">運営</span>}</b>
        <small>{t.uses}人が使用</small>
      </div>
      <div className="adminActions">
        <button className="secondaryCta dangerCta" disabled={busy} onClick={()=>remove(t)}>削除</button>
      </div>
    </article>)}</div>
  </>;
}

function splitList(v=""){return v.split(/[,、]/).map(x=>x.trim()).filter(Boolean).slice(0,8);}

function formatDateTime(v){
  if(!v) return "";
  const d=new Date(v);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
