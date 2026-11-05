"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import Admin from "./Admin";

const navItems=[
  ["home","ホーム","⌂"],
  ["people","つながる","♙"],
  ["community","クラブ","♧"],
  ["me","マイページ","○"]
];

const TOP_IMAGES={
  home:"/images/top-home.jpg",
  people:"/images/top-people.jpg",
  community:"/images/top-community.jpg",
  me:"/images/top-me.jpg"
};

const PEOPLE_CATEGORIES=["AI","釣り","音楽","芸術","地域のお店"];
const CLUB_COLUMNS="id,name,activity,description,district,venue,frequency,contacts,is_paid,minors_ok,image_url,updated_at,created_at";

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
  const [clubs,setClubs]=useState([]);
  const [clubMembers,setClubMembers]=useState([]);
  const [profile,setProfile]=useState(null);
  const [directory,setDirectory]=useState([]);
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
    await Promise.all([loadClubs(),loadDirectory()]);
  }

  async function loadClubs(){
    const [c,m]=await Promise.all([
      supabase.from("clubs").select(CLUB_COLUMNS).order("updated_at",{ascending:false}),
      supabase.from("club_members").select("club_id,member_id,is_admin,created_at").order("created_at",{ascending:true})
    ]);
    if(c.error||m.error){setMessage("クラブを読み込めませんでした。");return;}
    setClubs(c.data||[]); setClubMembers(m.data||[]);
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
    setUserId(""); setClubs([]); setClubMembers([]); setProfile(null); setDirectory([]); setInvite(""); setTab("home"); setDetail(null); setAdminOpen(false); setMessage("");
  }

  function go(nextTab,nextAnchor=""){
    setAnchor(nextAnchor);
    setDetail(null); setAdminOpen(false); setTab(nextTab);
  }

  const others=useMemo(()=>directory.filter(x=>x.id!==userId).map(toPerson),[directory,userId]);

  const peopleById=useMemo(()=>Object.fromEntries(directory.map(x=>[x.id,toPerson(x)])),[directory]);
  // Members shown for a club: only profiles the viewer can see (visible, with a name).
  const membersOf=clubId=>clubMembers.filter(m=>m.club_id===clubId&&peopleById[m.member_id]).map(m=>({...m,person:peopleById[m.member_id]}));
  const isMemberOf=clubId=>clubMembers.some(m=>m.club_id===clubId&&m.member_id===userId);

  const ctx={clubs,clubMembers,membersOf,isMemberOf,userId,openDetail:setDetail,go};

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
        <ProfileForm saveProfile={saveProfile} minor={!!profile?.is_minor} submitLabel="SAIKAI AWAITS をはじめる"/>
      </section></div>
    </section></main>;
  }

  return <main className="appStage">
    <section className="app">
      {adminOpen ? <Admin onBack={()=>setAdminOpen(false)} onChanged={loadClubs}/>
      : detail ? <DetailView key={detail.item?.id} detail={detail} onBack={()=>setDetail(null)} ctx={ctx}/>
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
  const {clubs,membersOf,isMemberOf,openDetail,go}=ctx;
  const myTags=[...(profile?.tags||[]),...(profile?.skills||[])].map(normTag);
  const shared=p=>p.rawTags.filter(t=>myTags.includes(normTag(t))).length;
  const person=[...others].sort((a,b)=>shared(b)-shared(a))[0];
  const club=clubs.find(c=>!isMemberOf(c.id))||clubs[0];

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

      <div className="recommendGrid" style={{gridTemplateColumns:`repeat(${[person,club].filter(Boolean).length||1},1fr)`}}>
        {person&&<article className="recommendCard clickable" onClick={()=>openDetail({kind:"person",item:person})}>
          <div className="personTop"><Avatar person={person} size={56}/><span className="addPerson" aria-hidden="true">♙+</span></div>
          <div className="greenKicker">♣ 気の合いそうな人</div>
          <h3>{person.name}<small>さん</small>{person.minor&&<MinorBadge/>}</h3>
          <div className="tags">{person.tags.slice(0,3).map(t=><span key={t}>{t}</span>)}</div>
          <p>{person.bio}</p>
        </article>}

        {club&&<article className="recommendCard clickable" onClick={()=>openDetail({kind:"club",item:club})}>
          <ClubCover club={club} className="cardCover"/>
          <div className="greenKicker">▣ おすすめのクラブ</div>
          <h3>{club.name}</h3>
          <div className="miniMeta">♟ メンバー {membersOf(club.id).length}人</div>
          <p>{club.activity}</p>
          <button className="softBlue">{isMemberOf(club.id)?"参加中 ✓":"見てみる"}</button>
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
  const {clubs,membersOf,openDetail}=ctx;

  return <PageShell hero={{image:TOP_IMAGES.community,kicker:"CLUB",title:"クラブ",lead:"好きなことから、つながる。"}}>
    {!clubs.length?<p className="emptyNote">まだ登録がありません。</p>:
    <div className="communityCards">{clubs.map(x=><article className="clickable" key={x.id} onClick={()=>openDetail({kind:"club",item:x})}>
      <ClubCover club={x} className="commCover"/>
      <div>
        <h3>{x.name}</h3>
        <p>{x.activity}</p>
        <small>♟ メンバー {membersOf(x.id).length}人 · {x.district||"地区未設定"}</small>
      </div>
    </article>)}</div>}
  </PageShell>;
}

// ---------------------------------------------------------------------------
// My page
// ---------------------------------------------------------------------------

function Me({ctx,logout,openAdmin,profile,saveProfile,message}){
  const {clubs,clubMembers,userId,openDetail}=ctx;
  const [editing,setEditing]=useState(false);
  const joined=clubMembers.filter(m=>m.member_id===userId).map(m=>({...m,item:clubs.find(c=>c.id===m.club_id)})).filter(x=>x.item);
  const person={name:profile?.name};

  return <PageShell hero={{image:TOP_IMAGES.me,kicker:"MY PAGE",title:"マイページ",lead:"あなたの西海でのつながりと活動"}}>
    {editing
      ? <div className="entryForm profileEdit">
          <div className="formTitle"><b>プロフィールを編集</b><button type="button" onClick={()=>setEditing(false)} aria-label="閉じる">×</button></div>
          <ProfileForm initial={profile} minor={!!profile?.is_minor} saveProfile={saveProfile} submitLabel="保存する" onSaved={()=>setEditing(false)}/>
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

    <section className="myActivity"><h2>参加中のクラブ</h2>{joined.length?joined.map(x=><div className="myActionRow clickable" key={x.club_id} onClick={()=>openDetail({kind:"club",item:x.item})}><span>{formatDay(x.created_at)} 参加</span><b>{x.item.name}</b></div>):<p>まだ参加していません。「クラブ」から気になる集まりを探してみましょう。</p>}</section>

    <button className="logout" onClick={logout}>ログアウト</button>
  </PageShell>;
}

function ProfileForm({initial,minor,saveProfile,submitLabel,onSaved}){
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
    <label>{minor?"ニックネーム":"名前"}<input required maxLength={80} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>{minor&&<span className="formHint">本名ではなく、ニックネームを入れてください。</span>}</label>
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

// Pop cover pattern for clubs without a photo; the pattern is picked from the club id so it stays the same.
const COVER_PATTERNS=[
  {bg:"linear-gradient(160deg,#5ec8f2 0%,#1c8fd0 58%,#0d5f9e 100%)",a:"#ffcf2e",b:"#ffffff",c:"#ff4f9a",d:"#0d2b4e"},
  {bg:"linear-gradient(160deg,#ff9ec8 0%,#ff4f9a 100%)",a:"#ffcf2e",b:"#ffffff",c:"#0d2b4e",d:"#1fb57a"},
  {bg:"linear-gradient(160deg,#ffe27a 0%,#ffcf2e 100%)",a:"#ff4f9a",b:"#ffffff",c:"#1fb57a",d:"#0d2b4e"},
  {bg:"linear-gradient(160deg,#7fe0b4 0%,#1fb57a 100%)",a:"#ffcf2e",b:"#ffffff",c:"#ff4f9a",d:"#0d2b4e"}
];
const AVATAR_COLORS=["#ffcf2e","#ff9ec8","#9fe3c6","#a9d8ff","#ffd99a","#d6c4ff"];

function hashOf(v=""){let h=0;for(const ch of v)h=(h*31+ch.charCodeAt(0))>>>0;return h;}

function ClubCover({club,className}){
  if(club?.image_url) return <div className={className+" clubCover"} role="img" aria-label={`${club.name}のトップイメージ`} style={{backgroundImage:`url("${club.image_url}")`}}></div>;
  const p=COVER_PATTERNS[hashOf(club?.id)%COVER_PATTERNS.length];
  return <div className={className+" clubCover"} aria-hidden="true" style={{background:p.bg}}>
    <svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice">
      <circle cx="232" cy="44" r="22" fill={p.a}/>
      <path d="M0 102 q25 -14 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 v48 h-300z" fill={p.b} opacity=".9"/>
      <path d="M0 120 q25 -12 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 v30 h-300z" fill={p.c} opacity=".85"/>
      <path d="M70 92 l18 -34 l18 34 z" fill={p.d}/>
      <rect x="140" y="30" width="26" height="8" rx="4" fill={p.d} transform="rotate(-20 153 34)"/>
    </svg>
  </div>;
}

// Only web links and phone numbers become clickable; anything else is shown as text.
function contactHref(url=""){
  const u=url.trim();
  if(/^https?:\/\//i.test(u)) return u;
  if(/^tel:[0-9+\-() ]+$/i.test(u)) return u;
  return "";
}

function DetailView({detail,onBack,ctx}){
  const {kind,item}=detail;

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

  return <ClubPage club={item} onBack={onBack} ctx={ctx}/>;
}

function ClubPage({club,onBack,ctx}){
  const {membersOf,isMemberOf,openDetail}=ctx;
  const [notice,setNotice]=useState("");
  const members=membersOf(club.id);
  const joined=isMemberOf(club.id);
  const contacts=(Array.isArray(club.contacts)?club.contacts:[]).filter(c=>c&&(c.label||c.url||c.note));
  const about=[["活動内容",club.activity],["活動場所",club.venue],["頻度",club.frequency]].filter(([,v])=>v);

  return <div className="popPage">
    <Confetti/>
    <header className="popTopBar"><button onClick={onBack} aria-label="戻る">‹</button></header>
    <div className="popStack">
      <ClubCover club={club} className="popCover"/>
      <h1 className="popName">{club.name}</h1>
      <div className="popStats">
        <div><small>メンバー</small><b>{members.length}人</b></div>
        <div><small>エリア</small><b>{club.district||"未設定"}</b></div>
        <div className="you"><small>あなた</small><b>{joined?"参加中":"未参加"}</b></div>
      </div>
      {about.length>0&&<section className="popCard">
        <h2>コミュニティについて</h2>
        <dl className="popRows">{about.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      </section>}
      {club.description&&<section className="popCard"><h2>説明</h2><p>{club.description}</p></section>}
      <section className="popCard">
        <h2>参加条件</h2>
        <div className="popChips">
          <span className={club.is_paid?"hot":"ok"}>{club.is_paid?"有料":"無料"}</span>
          <span className={club.minors_ok?"ok":""}>{club.minors_ok?"未成年OK":"大人のみ"}</span>
        </div>
      </section>
      {!joined&&<button className="popBtn" onClick={()=>setNotice("「参加したい」は、もうすぐ使えるようになります。")}>参加したい</button>}
      {notice&&<p className="popNotice" role="status">{notice}</p>}

      <h2 className="popSecHead">連絡・参加の方法</h2>
      {contacts.length?contacts.map((c,i)=>{
        const href=contactHref(c.url);
        const body=<>{c.label||c.url}{c.note&&<small>{c.note}</small>}</>;
        return href
          ? <a key={i} className="popLink" href={href} target="_blank" rel="noopener noreferrer">{body}</a>
          : <div key={i} className="popLink static">{body}</div>;
      }):<div className="popLink static">準備中<small>連絡方法はまだ登録されていません</small></div>}

      <h2 className="popSecHead">参加メンバー（{members.length}人）</h2>
      {members.length
        ? <div className="popMembers" aria-label="参加メンバー（横にスワイプ）" tabIndex={0}>
            {members.map(m=><button key={m.member_id} className="popMember" onClick={()=>openDetail({kind:"person",item:m.person})}>
              {m.person.avatar
                ? <img src={m.person.avatar} alt=""/>
                : <i style={{background:AVATAR_COLORS[hashOf(m.member_id)%AVATAR_COLORS.length]}} aria-hidden="true">{(m.person.name||"?").slice(0,1)}</i>}
              <span>{m.person.name}</span>
              {m.person.minor&&<MinorBadge/>}
            </button>)}
          </div>
        : <p className="popEmpty">まだメンバーはいません。</p>}
      <p className="popUpdated">最終更新 {formatDay(club.updated_at)}</p>
    </div>
  </div>;
}

function DetailHeader({onBack}){
  return <header className="detailHeader"><button onClick={onBack} aria-label="戻る">‹</button><Logo/><span></span></header>;
}

function DetailBlock({title,children}){
  return <section className="detailBlock"><h2>{title}</h2>{children}</section>;
}
