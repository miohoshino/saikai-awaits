"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import Admin from "./Admin";

const navItems=[
  ["home","ホーム","⌂"],
  ["people","つながる","♙"],
  ["community","コミュニティ","♧"],
  ["me","マイページ","○"]
];

const TOP_IMAGES={
  home:"/images/top-home.jpg",
  people:"/images/top-people.jpg",
  community:"/images/top-community.jpg",
  me:"/images/top-me.jpg"
};

const PEOPLE_CATEGORIES=["AI","釣り","音楽","芸術","地域のお店"];
const JOIN_MESSAGE="コミュニティに参加しました！";

const ENTRY_COLUMNS="id,kind,status,title,summary,body,area,tags,details,image_url,source_name,source_url,submitted_by,community_id,published_at,created_at";

function cleanTitle(v=""){return v.replace(/^【デモ】/,"");}
function normTag(t=""){return t.normalize("NFKC").trim().toLowerCase();}
function splitList(v=""){return v.split(/[,、]/).map(x=>x.trim()).filter(Boolean).slice(0,8);}
function uniqueTags(list){const seen=new Set();return list.filter(t=>{const k=normTag(t);if(!k||seen.has(k))return false;seen.add(k);return true;});}

function formatDay(v){
  if(!v) return "";
  const d=new Date(v);
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
}

function toPerson(x){
  const allTags=uniqueTags([...(x.tags||[]),...(x.skills||[])]);
  return {
    id:x.id,
    name:x.name,
    area:x.area,
    role:x.organization||"SAIKAI AWAITS メンバー",
    bio:x.bio||"",
    tags:allTags.slice(0,6),
    rawTags:allTags,
    avatar:x.avatar_url||"",
    minor:!!x.is_minor
  };
}

function personCategories(person){
  const tags=person.rawTags.map(normTag);
  const hit=PEOPLE_CATEGORIES.filter(c=>tags.includes(normTag(c)));
  return hit.length?hit:["その他"];
}

function MinorBadge(){
  return <span className="minorBadge">未成年</span>;
}

function Avatar({person,size=54}){
  if(person?.avatar) return <img className="avatar" src={person.avatar} alt="" style={{width:size,height:size}}/>;
  return <span className="avatar avatarInitial" aria-hidden="true" style={{width:size,height:size,fontSize:size*.4}}>{(person?.name||"?").slice(0,1)}</span>;
}

export default function Page(){
  const [userId,setUserId]=useState("");
  const [invite,setInvite]=useState("");
  const [entries,setEntries]=useState([]);
  const [profile,setProfile]=useState(null);
  const [directory,setDirectory]=useState([]);
  const [actions,setActions]=useState([]);
  const [actionCounts,setActionCounts]=useState({});
  const [message,setMessage]=useState("");
  const [tab,setTab]=useState("home");
  const [detail,setDetail]=useState(null);
  const [adminOpen,setAdminOpen]=useState(false);
  const [anchor,setAnchor]=useState("");
  const [busy,setBusy]=useState(true);

  useEffect(()=>{(async()=>{
    if(!supabase){setBusy(false);return;}
    const {data:{session}}=await supabase.auth.getSession();
    const uid=session?.user?.id;
    if(uid){
      const member=await loadProfile(uid);
      if(member){setUserId(uid);await loadAll(uid);}
    }
    setBusy(false);
  })();},[]);

  useEffect(()=>{
    if(anchor){document.getElementById(anchor)?.scrollIntoView({block:"start"});setAnchor("");}
    else window.scrollTo(0,0);
  },[adminOpen,detail,tab]);

  async function loadAll(uid){
    await Promise.all([loadEntries(),loadDirectory(),loadActions(uid),loadActionCounts()]);
  }

  async function loadEntries(){
    const {data,error}=await supabase.from("entries").select(ENTRY_COLUMNS).eq("status","published").eq("kind","community").order("published_at",{ascending:false});
    if(error){setMessage("コンテンツを読み込めませんでした。");return;}
    setEntries(data||[]);
  }

  async function loadProfile(uid){
    const {data}=await supabase.from("members").select("*").eq("id",uid).maybeSingle();
    setProfile(data||null);
    return data;
  }

  async function loadDirectory(){
    const {data}=await supabase.from("members").select("id,name,area,organization,bio,tags,skills,avatar_url,is_minor").eq("visible",true).neq("name","").order("updated_at",{ascending:false});
    setDirectory(data||[]);
  }

  async function loadActions(uid){
    const {data}=await supabase.from("member_entry_actions").select("entry_id,action,created_at").eq("member_id",uid).order("created_at",{ascending:false});
    setActions(data||[]);
  }

  async function loadActionCounts(){
    const {data}=await supabase.rpc("get_entry_action_counts");
    const counts={};
    for(const row of data||[]) counts[row.entry_id]={...counts[row.entry_id],[row.action]:Number(row.count)};
    setActionCounts(counts);
  }

  async function saveProfile(payload){
    const {data,error}=await supabase.from("members").update({
      name:payload.name.trim(),
      area:payload.area,
      organization:payload.organization||"",
      bio:payload.bio||"",
      tags:(payload.tags||[]).slice(0,8),
      skills:(payload.skills||[]).slice(0,8)
    }).eq("id",userId).select().single();
    if(error){setMessage("プロフィールを保存できませんでした。");return false;}
    setProfile(data); await loadDirectory(); setMessage(""); return true;
  }

  function hasAction(entryId,action){
    return actions.some(a=>a.entry_id===entryId&&a.action===action);
  }

  async function toggleAction(entryId,action){
    if(!entryId) return false;
    const enabled=!hasAction(entryId,action);
    const {error}=enabled
      ? await supabase.from("member_entry_actions").insert({member_id:userId,entry_id:entryId,action})
      : await supabase.from("member_entry_actions").delete().match({member_id:userId,entry_id:entryId,action});
    if(error) return false;
    await Promise.all([loadActions(userId),loadActionCounts()]);
    return true;
  }

  async function enter(){
    const code=invite.trim().toLowerCase();
    if(!code) return;
    setBusy(true); setMessage("");
    let {data:{session}}=await supabase.auth.getSession();
    if(!session){
      const {data,error}=await supabase.auth.signInAnonymously();
      if(error){setMessage("接続できませんでした。時間をおいてもう一度お試しください。");setBusy(false);return;}
      session=data.session;
    }
    const {data:member,error}=await supabase.rpc("redeem_invite",{p_code:code});
    if(error||!member?.id){setMessage("招待コードが違うか、すでに使用されています。");setBusy(false);return;}
    setProfile(member);
    setUserId(member.id);
    await loadAll(member.id);
    setBusy(false);
  }

  async function logout(){
    if(!window.confirm("ログアウトすると、この端末からは同じアカウントに戻れなくなります。本当にログアウトしますか？")) return;
    await supabase.auth.signOut();
    setUserId(""); setEntries([]); setProfile(null); setDirectory([]); setActions([]); setActionCounts({}); setInvite(""); setTab("home"); setDetail(null); setAdminOpen(false); setMessage("");
  }

  function go(nextTab,nextAnchor=""){
    setAnchor(nextAnchor);
    setDetail(null); setAdminOpen(false); setTab(nextTab);
  }

  const others=useMemo(()=>directory.filter(x=>x.id!==userId).map(toPerson),[directory,userId]);

  const ctx={communities:entries,actions,actionCounts,hasAction,toggleAction,openDetail:setDetail,go};

  if(!supabaseConfigured){
    return <main className="gate">
      <section className="gateCard">
        <h2>設定が必要です</h2>
        <p>環境変数 NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY を設定してください。</p>
      </section>
    </main>;
  }

  if(!userId){
    return <main className="gate gatePop">
      <Confetti/>
      <section className="gateInner">
        <h1 className="gateLogo">SAIKAI<span>AWAITS</span></h1>
        <p className="gateTagline"><span>ここで会おう。</span><span>ここから探そう。</span></p>
        <form className="gateCode" onSubmit={e=>{e.preventDefault();enter();}}>
          <label htmlFor="invite">招待コード</label>
          <input id="invite" value={invite} onChange={e=>setInvite(e.target.value)} placeholder="saikai-xxxx" autoComplete="off" autoFocus/>
          <button disabled={busy||!invite.trim()}>{busy?"確認中…":"入る"}</button>
          {message&&<div className="gateMessage">{message}</div>}
        </form>
      </section>
    </main>;
  }

  if(profile && !profile.name){
    return <main className="appStage"><section className="app">
      <div className="onboarding"><header><Logo/></header><section>
        <div className="pageKicker">WELCOME TO SAIKAI</div>
        <h1>あなたのことを、少しだけ。</h1>
        <p>西海で「誰とつながれるか」が分かるプロフィールをつくります。</p>
        <ProfileForm saveProfile={saveProfile} submitLabel="SAIKAI AWAITS をはじめる"/>
      </section></div>
    </section></main>;
  }

  return <main className="appStage">
    <section className="app">
      {adminOpen ? <Admin onBack={()=>setAdminOpen(false)} onChanged={loadEntries}/>
      : detail ? <DetailView key={detail.item?.id||detail.item?.name} detail={detail} onBack={()=>setDetail(null)} ctx={ctx}/>
      : <>
        {tab==="home"&&<Home ctx={ctx} profile={profile} others={others}/>}
        {tab==="people"&&<People ctx={ctx} others={others}/>}
        {tab==="community"&&<Community ctx={ctx}/>}
        {tab==="me"&&<Me ctx={ctx} logout={logout} openAdmin={()=>setAdminOpen(true)} profile={profile} saveProfile={saveProfile} message={message}/>}
      </>}
      <nav className="bottomNav" aria-label="メインメニュー">
        {navItems.map(([id,label,icon])=><button key={id} className={!adminOpen&&tab===id?"active":""} aria-current={!adminOpen&&!detail&&tab===id?"page":undefined} onClick={()=>go(id)}>
          <span className="navIcon" aria-hidden="true">{icon}</span><span>{label}</span>
        </button>)}
      </nav>
    </section>
  </main>;
}

function Logo(){
  return <div className="logoWrap">
    <div className="logoMark" aria-hidden="true">
      <i className="hill h1"></i><i className="hill h2"></i><i className="sun"></i><i className="wave w1"></i><i className="wave w2"></i>
    </div>
    <div>
      <div className="logoText">SAIKAI AWAITS</div>
      <div className="logoTag">つながる、見つかる、好きになる。西海のくらしのネットワーク</div>
    </div>
  </div>;
}

// Pop confetti backdrop (new design, docs/mockups/redesign-v1.html).
function Confetti(){
  return <svg className="confetti" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect x="28" y="60" width="40" height="11" rx="5.5" fill="#ff4f9a" transform="rotate(-24 48 65)"/>
    <circle cx="350" cy="90" r="12" fill="#ffcf2e"/>
    <rect x="300" y="170" width="32" height="10" rx="5" fill="#1fb57a" transform="rotate(30 316 175)"/>
    <circle cx="80" cy="190" r="7" fill="#0d2b4e"/>
    <path d="M70 690 l12 -24 l12 24 z" fill="#ffcf2e"/>
    <circle cx="340" cy="700" r="16" fill="none" stroke="#ff4f9a" strokeWidth="6"/>
    <rect x="36" y="590" width="36" height="10" rx="5" fill="#0d2b4e" transform="rotate(14 54 595)"/>
    <rect x="322" y="580" width="10" height="36" rx="5" fill="#1fb57a" transform="rotate(20 327 598)"/>
    <path d="M330 330 l10 -20 l10 20 z" fill="#ff4f9a"/>
    <rect x="20" y="420" width="10" height="30" rx="5" fill="#ffcf2e" transform="rotate(-18 25 435)"/>
  </svg>;
}

function PageHero({image,kicker,title,lead}){
  return <header className="pageHero" style={{backgroundImage:`linear-gradient(180deg,rgba(255,255,255,.88) 0%,rgba(255,255,255,0) 32%,rgba(6,40,66,.05) 55%,rgba(6,40,66,.72) 100%),url("${image}")`}}>
    <Logo/>
    <div className="pageHeroText">
      <div className="pageKicker">{kicker}</div>
      <h1>{title}</h1>
      {lead&&<p>{lead}</p>}
    </div>
  </header>;
}

function PageShell({hero,children}){
  return <div className="page"><PageHero {...hero}/><section>{children}</section></div>;
}

function Chips({options,value,onChange,label}){
  return <div className="chipRow" role="tablist" aria-label={label}>
    {options.map(([id,text,count])=><button key={id} role="tab" aria-selected={value===id} className={value===id?"active":""} onClick={()=>onChange(id)}>
      {text}{count!=null&&<i>{count}</i>}
    </button>)}
  </div>;
}

function SectionHead({title,onMore}){
  return <div className="sectionHead"><div><h2>{title}</h2><span></span></div>{onMore&&<button onClick={onMore}>すべて見る 〉</button>}</div>;
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function Home({ctx,profile,others}){
  const {communities,actionCounts,hasAction,toggleAction,openDetail,go}=ctx;
  const myTags=[...(profile?.tags||[]),...(profile?.skills||[])].map(normTag);
  const shared=p=>p.rawTags.filter(t=>myTags.includes(normTag(t))).length;
  const person=[...others].sort((a,b)=>shared(b)-shared(a))[0];
  const community=communities.find(c=>!hasAction(c.id,"joined"))||communities[0];

  async function joinFromCard(e){
    e.stopPropagation();
    if(!hasAction(community.id,"joined")) await toggleAction(community.id,"joined");
    openDetail({kind:"community",item:community,justJoined:true});
  }

  return <div className="home">
    <header className="masthead" style={{backgroundImage:`linear-gradient(180deg,rgba(234,249,255,.85) 0%,rgba(240,252,255,.25) 35%,rgba(255,255,255,.1) 62%,#fff 100%),url("${TOP_IMAGES.home}")`}}>
      <div className="mastheadTop"><Logo/><div className="headActions">
        <button className="headAvatar" onClick={()=>go("me")} aria-label="マイページ"><Avatar person={{name:profile?.name}} size={42}/></button>
      </div></div>
      <div className="greeting">
        <div><h1>こんにちは、{profile?.name||"メンバー"}さん <span>☀</span></h1><p>今日も、すてきな西海の一日を</p></div>
      </div>
    </header>

    <section className="content">
      <SectionHead title="あなたへのおすすめ" onMore={()=>go("community")}/>

      <div className="recommendGrid" style={{gridTemplateColumns:`repeat(${[person,community].filter(Boolean).length||1},1fr)`}}>
        {person&&<article className="recommendCard clickable" onClick={()=>openDetail({kind:"person",item:person})}>
          <div className="personTop"><Avatar person={person} size={56}/><span className="addPerson" aria-hidden="true">♙+</span></div>
          <div className="greenKicker">♣ 気の合いそうな人</div>
          <h3>{person.name}<small>さん</small>{person.minor&&<MinorBadge/>}</h3>
          <div className="tags">{person.tags.slice(0,3).map(t=><span key={t}>{t}</span>)}</div>
          <p>{person.bio}</p>
        </article>}

        {community&&<article className="recommendCard clickable" onClick={()=>openDetail({kind:"community",item:community})}>
          <img className="cardImage" src="https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=700&q=80" alt=""/>
          <div className="greenKicker">▣ おすすめのコミュニティ</div>
          <h3>{cleanTitle(community.title)}</h3>
          <div className="miniMeta">♟ メンバー {actionCounts[community.id]?.joined||0}人</div>
          <p>{community.summary}</p>
          <button className="softBlue" onClick={joinFromCard}>{hasAction(community.id,"joined")?"参加中 ✓":"参加する"}</button>
        </article>}
      </div>
    </section>
  </div>;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

function People({ctx,others}){
  const {openDetail}=ctx;
  const [q,setQ]=useState("");
  const [category,setCategory]=useState("all");
  const matched=others.filter(x=>[x.name,x.area,x.role,x.bio,...x.rawTags].join(" ").toLowerCase().includes(q.toLowerCase()));
  const groups=[...PEOPLE_CATEGORIES,"その他"].map(c=>[c,matched.filter(p=>personCategories(p).includes(c))]);
  const visible=category==="all"?groups.filter(([,list])=>list.length):groups.filter(([c])=>c===category);

  return <PageShell hero={{image:TOP_IMAGES.people,kicker:"PEOPLE",title:"つながる",lead:"西海の人を、好きなことや得意なことから見つける。"}}>
    <input className="searchInput" value={q} onChange={e=>setQ(e.target.value)} placeholder="人・得意なこと・興味で検索" aria-label="メンバーを検索"/>
    <Chips label="カテゴリー" value={category} onChange={setCategory} options={[["all","すべて"],...groups.map(([c,list])=>[c,c,list.length])]}/>
    {!others.length?<p className="emptyNote">まだ他のメンバーがいません。招待した人が参加すると、ここに表示されます。</p>:
    visible.every(([,list])=>!list.length)?<p className="emptyNote">条件に合うメンバーが見つかりませんでした。</p>:
    visible.map(([c,list])=><section className="peopleGroup" key={c}>
      {category==="all"&&<h2>{c}<small>{list.length}人</small></h2>}
      <div className="listCards">{list.map(p=><PersonRow key={p.id} person={p} openDetail={openDetail}/>)}</div>
    </section>)}
  </PageShell>;
}

function PersonRow({person:p,openDetail}){
  return <article className="personRow clickable" onClick={()=>openDetail({kind:"person",item:p})}>
    <Avatar person={p}/>
    <div><h3>{p.name}{p.minor&&<MinorBadge/>}</h3><small>{p.area} · {p.role}</small><p>{p.bio}</p><div className="tags">{p.tags.map(t=><span key={t}>{t}</span>)}</div></div>
  </article>;
}

// ---------------------------------------------------------------------------
// Community
// ---------------------------------------------------------------------------

function Community({ctx}){
  const {communities,actionCounts,openDetail}=ctx;

  return <PageShell hero={{image:TOP_IMAGES.community,kicker:"COMMUNITY",title:"コミュニティ",lead:"好きなことから、つながる。"}}>
    {!communities.length?<p className="emptyNote">まだ登録がありません。</p>:
    <div className="communityCards">{communities.map((x,i)=><article className="clickable" key={x.id} onClick={()=>openDetail({kind:"community",item:x})}>
      <div className={"commCover c"+((i%3)+1)} style={x.image_url?{backgroundImage:`url("${x.image_url}")`}:undefined}></div>
      <div>
        <h3>{cleanTitle(x.title)}</h3>
        <p>{x.summary}</p>
        <small>♟ メンバー {actionCounts[x.id]?.joined||0}人 · {x.area}</small>
      </div>
    </article>)}</div>}
  </PageShell>;
}

// ---------------------------------------------------------------------------
// My page
// ---------------------------------------------------------------------------

function Me({ctx,logout,openAdmin,profile,saveProfile,message}){
  const {actions,communities,openDetail}=ctx;
  const [editing,setEditing]=useState(false);
  const joined=actions.filter(a=>a.action==="joined").map(a=>({...a,item:communities.find(e=>e.id===a.entry_id)})).filter(x=>x.item);
  const person={name:profile?.name};

  return <PageShell hero={{image:TOP_IMAGES.me,kicker:"MY PAGE",title:"マイページ",lead:"あなたの西海でのつながりと活動"}}>
    {editing
      ? <div className="entryForm profileEdit">
          <div className="formTitle"><b>プロフィールを編集</b><button type="button" onClick={()=>setEditing(false)} aria-label="閉じる">×</button></div>
          <ProfileForm initial={profile} saveProfile={saveProfile} submitLabel="保存する" onSaved={()=>setEditing(false)}/>
        </div>
      : <div className="profileCard">
          <Avatar person={person} size={76}/>
          <h3>{profile?.name||"メンバー"}{profile?.is_minor&&<MinorBadge/>}</h3>
          <p>{profile?.area||"西海市"}{profile?.organization?" · "+profile.organization:""}</p>
          {profile?.bio&&<p className="profileBio">{profile.bio}</p>}
          <div className="tags profileTags">{uniqueTags([...(profile?.tags||[]),...(profile?.skills||[])]).slice(0,8).map(t=><span key={t}>{t}</span>)}</div>
          <button className="secondaryCta" onClick={()=>setEditing(true)}>プロフィールを編集</button>
        </div>}

    {profile?.role==="admin"&&<section className="quickActions"><button className="adminEntry" onClick={openAdmin}>運営メニュー</button></section>}
    {message&&<div className="inlineMessage">{message}</div>}

    <section className="myActivity"><h2>参加中のコミュニティ</h2>{joined.length?joined.map(x=><div className="myActionRow clickable" key={x.entry_id} onClick={()=>openDetail({kind:x.item.kind,item:x.item})}><span>{formatDay(x.created_at)} 参加</span><b>{cleanTitle(x.item.title)}</b></div>):<p>まだ参加していません。「コミュニティ」から気になる集まりに参加してみましょう。</p>}</section>

    <button className="logout" onClick={logout}>ログアウト</button>
  </PageShell>;
}

function ProfileForm({initial,saveProfile,submitLabel,onSaved}){
  const [form,setForm]=useState({
    name:initial?.name||"",area:initial?.area||"",organization:initial?.organization||"",bio:initial?.bio||"",
    tags:(initial?.tags||[]).join(", "),skills:(initial?.skills||[]).join(", ")
  });
  const [saving,setSaving]=useState(false);
  async function submit(e){
    e.preventDefault(); setSaving(true);
    const ok=await saveProfile({...form,tags:splitList(form.tags),skills:splitList(form.skills)});
    setSaving(false);
    if(ok) onSaved?.();
  }
  return <form className="profileForm" onSubmit={submit}>
    <label>名前<input required maxLength={80} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label>西海との関係<select required value={form.area} onChange={e=>setForm({...form,area:e.target.value})}><option value="">選択してください</option><option>西彼町</option><option>西海町</option><option>大島町</option><option>崎戸町</option><option>大瀬戸町</option><option>市外・西海に関わる</option></select></label>
    <label>所属<input maxLength={120} value={form.organization} onChange={e=>setForm({...form,organization:e.target.value})}/></label>
    <label>自己紹介<textarea rows="4" maxLength={500} value={form.bio} onChange={e=>setForm({...form,bio:e.target.value})}/></label>
    <label>興味（カンマ区切り）<input value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} placeholder="釣り, AI, 音楽"/></label>
    <label>できること（カンマ区切り）<input value={form.skills} onChange={e=>setForm({...form,skills:e.target.value})} placeholder="動画編集, 営業, デザイン"/></label>
    <p className="formHint">「AI」「釣り」「音楽」「芸術」「地域のお店」を入れると、「つながる」のカテゴリーに表示されます。</p>
    <button className="primaryCta fullCta" disabled={saving}>{saving?"保存中…":submitLabel}</button>
  </form>;
}

// ---------------------------------------------------------------------------
// Detail screens
// ---------------------------------------------------------------------------

const COMMUNITY_IMAGE="https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=1100&q=88";

function DetailView({detail,onBack,ctx}){
  const {kind,item}=detail;
  const {actionCounts,hasAction,toggleAction}=ctx;
  const [justJoined,setJustJoined]=useState(Boolean(detail.justJoined));
  const title=cleanTitle(item?.title||item?.name||"");

  if(kind==="person"){
    return <div className="detailPage">
      <DetailHeader onBack={onBack}/>
      <section className="personDetailHero">
        <Avatar person={item} size={110}/>
        <h1>{item.name}{item.minor&&<MinorBadge/>}</h1>
        <p>{item.area} · {item.role}</p>
        <div className="tags detailTags">{(item.tags||[]).map(t=><span key={t}>{t}</span>)}</div>
      </section>
      <section className="detailBody">
        <DetailBlock title="この人について"><p>{item.bio||"まだ自己紹介がありません。"}</p></DetailBlock>
        <DetailBlock title="興味・できること"><div className="detailChips">{(item.tags||[]).map(t=><span key={t}>{t}</span>)}</div></DetailBlock>
      </section>
    </div>;
  }

  const on=action=>hasAction(item?.id,action);

  async function toggleJoin(){
    if(on("joined")){
      if(!window.confirm("このコミュニティの参加をやめますか？")) return;
      await toggleAction(item.id,"joined");
      setJustJoined(false);
      return;
    }
    if(await toggleAction(item.id,"joined")) setJustJoined(true);
  }

  return <div className="detailPage">
    <DetailHeader onBack={onBack}/>
    <div className="detailHeroImage" style={{backgroundImage:`linear-gradient(180deg,rgba(5,29,48,.05),rgba(5,29,48,.58)),url("${item?.image_url||COMMUNITY_IMAGE}")`}}>
      <span className="detailLabel">COMMUNITY</span>
      <h1>{title}</h1>
      <p>{item?.summary}</p>
    </div>
    <section className="detailBody">
      <div className="factGrid">
        <Fact label="メンバー" value={`${actionCounts[item?.id]?.joined||0}人`}/>
        <Fact label="エリア" value={item?.area||"西海市"}/>
        <Fact label="あなた" value={on("joined")?"参加中":"未参加"}/>
      </div>
      <DetailBlock title="コミュニティについて"><p>{item?.body||item?.summary}</p></DetailBlock>
      <button className={"primaryCta fullCta"+(on("joined")?" joinedCta":"")} onClick={toggleJoin}>{on("joined")?"参加中 ✓":"このコミュニティに参加"}</button>
      {justJoined&&on("joined")&&<div className="joinMessage" role="status"><b>🎉 {JOIN_MESSAGE}</b></div>}
    </section>
  </div>;
}

function DetailHeader({onBack}){
  return <header className="detailHeader"><button onClick={onBack} aria-label="戻る">‹</button><Logo/><span></span></header>;
}

function DetailBlock({title,children}){
  return <section className="detailBlock"><h2>{title}</h2>{children}</section>;
}

function Fact({label,value}){
  return <div className="fact"><small>{label}</small><b>{value}</b></div>;
}
