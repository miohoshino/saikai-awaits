"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import Admin from "./Admin";

const navItems=[
  ["home","ホーム","⌂"],
  ["people","つながる","♙"],
  ["community","クラブ","♧"],
  ["me","マイページ","○"]
];

const PEOPLE_CATEGORIES=["AI","釣り","音楽","芸術","地域のお店"];
const CLUB_IMAGE_BUCKET="club-images";
const CLUB_COLUMNS="id,name,activity,description,district,venue,frequency,contacts,is_paid,minors_ok,image_url,updated_at,created_at";

function normTag(t=""){return t.normalize("NFKC").trim().toLowerCase();}
const MAX_TAGS=20;
function uniqueTags(list){const seen=new Set();return list.filter(t=>{const k=normTag(t);if(!k||seen.has(k))return false;seen.add(k);return true;});}

function formatDay(v){
  if(!v) return "";
  const d=new Date(v);
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
}

function toPerson(x){
  const allTags=uniqueTags(x.tags||[]);
  return {
    id:x.id,
    name:x.name,
    area:x.area,
    bio:x.bio||"",
    tags:allTags.slice(0,6),
    rawTags:allTags,
    avatar:x.avatar_url||"",
    minor:!!x.is_minor,
    spotDistricts:x.spot_districts||[],
    spotPlaces:x.spot_places||[],
    contacts:Array.isArray(x.contacts)?x.contacts:[]
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
  const [tagList,setTagList]=useState([]);
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
    await Promise.all([loadClubs(),loadDirectory(),loadTags()]);
  }

  async function loadClubs(){
    const [c,m]=await Promise.all([
      supabase.from("clubs").select(CLUB_COLUMNS).order("updated_at",{ascending:false}),
      supabase.from("club_members").select("club_id,member_id,is_admin,created_at").order("created_at",{ascending:true})
    ]);
    if(c.error||m.error){setMessage("クラブを読み込めませんでした。");return null;}
    // Photos live in a members-only bucket; show them through short-lived signed links.
    const list=c.data||[];
    const paths=list.map(x=>x.image_url).filter(u=>u&&!/^https?:\/\//i.test(u));
    const signed={};
    if(paths.length){
      const {data}=await supabase.storage.from(CLUB_IMAGE_BUCKET).createSignedUrls(paths,60*60*6);
      for(const row of data||[]) if(row.signedUrl) signed[row.path]=row.signedUrl;
    }
    const withImages=list.map(x=>({...x,imageSrc:/^https?:\/\//i.test(x.image_url||"")?x.image_url:(signed[x.image_url]||"")}));
    setClubs(withImages); setClubMembers(m.data||[]);
    return withImages;
  }

  async function loadProfile(uid){
    const {data}=await supabase.from("members").select("*").eq("id",uid).maybeSingle();
    setProfile(data||null);
    return data;
  }

  async function loadTags(){
    const {data}=await supabase.from("tags").select("label,is_official");
    setTagList(data||[]);
  }

  async function loadDirectory(){
    const {data}=await supabase.from("members").select("id,name,area,bio,tags,avatar_url,is_minor,spot_districts,spot_places,contacts").eq("visible",true).neq("name","").order("updated_at",{ascending:false});
    setDirectory(data||[]);
  }

  async function saveProfile(payload){
    const {data,error}=await supabase.from("members").update({
      name:payload.name.trim(),
      area:payload.area,
      bio:payload.bio||"",
      tags:uniqueTags(payload.tags||[]).slice(0,MAX_TAGS),
      spot_districts:payload.spot_districts||[],
      spot_places:payload.spot_places||[],
      contacts:payload.contacts||[]
    }).eq("id",userId).select().single();
    if(error){setMessage(error.message?.includes("invalid_contacts")?"連絡先の入れ方を確かめてください。":error.message?.includes("invalid_places")?"場所は60文字までにしてください。":"プロフィールを保存できませんでした。");return false;}
    setProfile(data); await Promise.all([loadDirectory(),loadTags()]); setMessage(""); return true;
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

  const tagOptions=useMemo(()=>{
    const uses={};
    for(const m of directory) for(const t of m.tags||[]) uses[t]=(uses[t]||0)+1;
    return [...tagList].sort((a,b)=>Number(b.is_official)-Number(a.is_official)||(uses[b.label]||0)-(uses[a.label]||0)||a.label.localeCompare(b.label,"ja")).map(t=>t.label);
  },[tagList,directory]);

  const others=useMemo(()=>directory.filter(x=>x.id!==userId).map(toPerson),[directory,userId]);

  const peopleById=useMemo(()=>Object.fromEntries(directory.map(x=>[x.id,toPerson(x)])),[directory]);
  // Members shown for a club: only profiles the viewer can see (visible, with a name).
  const membersOf=clubId=>clubMembers.filter(m=>m.club_id===clubId&&peopleById[m.member_id]).map(m=>({...m,person:peopleById[m.member_id]})).sort((a,b)=>Number(b.is_admin)-Number(a.is_admin));
  const isMemberOf=clubId=>clubMembers.some(m=>m.club_id===clubId&&m.member_id===userId);

  const canEditClub=clubId=>profile?.role==="admin"||clubMembers.some(m=>m.club_id===clubId&&m.member_id===userId&&m.is_admin);

  async function joinClub(clubId){
    const {error}=await supabase.rpc("join_club",{p_club:clubId});
    if(error) return error.message?.includes("adults_only")?"このクラブは大人のみです。":"所属できませんでした。時間をおいてもう一度お試しください。";
    await loadClubs(); return "";
  }

  async function leaveClub(clubId){
    const {error}=await supabase.rpc("leave_club",{p_club:clubId});
    if(error) return "やめられませんでした。時間をおいてもう一度お試しください。";
    await loadClubs(); return "";
  }

  const ctx={others,clubs,clubMembers,membersOf,isMemberOf,canEditClub,joinClub,leaveClub,userId,profile,reloadClubs:loadClubs,openDetail:setDetail,go};

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
      <div className="popPage popScreen">
        <Confetti/>
        <div className="popStack">
          <h1 className="popName">あなたのことを、少しだけ。</h1>
          <ProfileForm saveProfile={saveProfile} minor={!!profile?.is_minor} tagOptions={tagOptions} submitLabel="SAIKAI AWAITS をはじめる"/>
          {message&&<p className="popWarn" role="alert">{message}</p>}
        </div>
      </div>
    </section></main>;
  }

  return <main className="appStage">
    <section className="app">
      {adminOpen ? <Admin onBack={()=>setAdminOpen(false)} onChanged={loadClubs}/>
      : detail ? <DetailView key={(detail.kind||"")+(detail.item?.id||"")} detail={detail} onBack={()=>setDetail(null)} ctx={ctx}/>
      : <>
        {tab==="home"&&<Home ctx={ctx} profile={profile} others={others}/>}
        {tab==="people"&&<People ctx={ctx} others={others}/>}
        {tab==="community"&&<Community ctx={ctx}/>}
        {tab==="me"&&<Me ctx={ctx} tagOptions={tagOptions} logout={logout} openAdmin={()=>setAdminOpen(true)} profile={profile} saveProfile={saveProfile} message={message}/>}
      </>}
      <nav className="bottomNav" aria-label="メインメニュー">
        {navItems.map(([id,label,icon])=><button key={id} className={!adminOpen&&tab===id?"active":""} aria-current={!adminOpen&&!detail&&tab===id?"page":undefined} onClick={()=>go(id)}>
          <span className="navIcon" aria-hidden="true">{icon}</span><span>{label}</span>
        </button>)}
      </nav>
    </section>
  </main>;
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

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function Home({ctx,profile,others}){
  const {clubs,clubMembers,membersOf,isMemberOf,openDetail,go,userId}=ctx;
  const myTags=(profile?.tags||[]).map(normTag);
  const shared=p=>p.rawTags.filter(t=>myTags.includes(normTag(t))).length;
  const person=[...others].sort((a,b)=>shared(b)-shared(a))[0];
  const myDistrict=profile?.area||"";

  const nearby=myDistrict?clubs.filter(c=>c.district===myDistrict):[];
  // Recommended: clubs I am not in, with more like-minded members first, then bigger clubs.
  const likeMinded=c=>membersOf(c.id).filter(m=>m.member_id!==userId&&shared(m.person)>0).length;
  const recommended=clubs.filter(c=>!isMemberOf(c.id))
    .map(c=>({c,score:likeMinded(c),size:membersOf(c.id).length}))
    .sort((a,b)=>b.score-a.score||b.size-a.size)
    .slice(0,6).map(x=>x.c);
  const mine=clubMembers.filter(m=>m.member_id===userId).map(m=>clubs.find(c=>c.id===m.club_id)).filter(Boolean);
  const newClub=()=>openDetail({kind:"clubForm",item:null});

  return <div className="popPage popScreen">
    <Confetti/>
    <div className="popStack">
      <header className="popHello">
        <span className="popLogoSmall">SAIKAI<b>AWAITS</b></span>
        <h1>こんにちは、{profile?.name||"メンバー"}さん</h1>
      </header>

      <div className="popSecRow"><h2 className="popSecHead">近くのクラブ{myDistrict&&<small>{myDistrict}</small>}</h2><button className="popLinkBtn" onClick={()=>openDetail({kind:"nearby",item:null})}>場所から探す 〉</button></div>
      {nearby.length
        ? <div className="popSwipe" tabIndex={0} aria-label="近くのクラブ（横にスワイプ）">{nearby.map(c=><ClubCard key={c.id} club={c} ctx={ctx} compact/>)}</div>
        : <div className="popCard popEmptyCard">
            <p>{myDistrict?"この地区のクラブは、まだありません。つくってみませんか？":"プロフィールで地区を選ぶと、近くのクラブが出ます。"}</p>
            {myDistrict&&<button className="popSmallBtn" onClick={newClub}>＋ クラブをつくる</button>}
          </div>}

      <h2 className="popSecHead">おすすめのクラブ</h2>
      {recommended.length
        ? <div className="popSwipe" tabIndex={0} aria-label="おすすめのクラブ（横にスワイプ）">{recommended.map(c=><ClubCard key={c.id} club={c} ctx={ctx} compact/>)}</div>
        : <p className="popEmpty">いまおすすめできるクラブはありません。</p>}
      <button className="popLinkBtn" onClick={()=>go("community")}>クラブをすべて見る 〉</button>

      {person&&<>
        <h2 className="popSecHead">気の合いそうな人</h2>
        <button className="popPerson" onClick={()=>openDetail({kind:"person",item:person})}>
          <Avatar person={person} size={56}/>
          <span>
            <b>{person.name}{person.minor&&<MinorBadge/>}</b>
            <small>{person.area}</small>
            <span className="popMiniChips">{person.tags.slice(0,3).map(t=><i key={t}>{t}</i>)}</span>
          </span>
        </button>
      </>}

      {mine.length>0&&<>
        <h2 className="popSecHead">所属中のクラブ</h2>
        <div className="popMiniChips popMine">{mine.map(c=><button key={c.id} onClick={()=>openDetail({kind:"club",item:c})}>{c.name}</button>)}</div>
      </>}
    </div>
  </div>;
}

function ClubCard({club,ctx,compact}){
  const {membersOf,isMemberOf,openDetail}=ctx;
  return <button className={"popClubCard"+(compact?" compact":"")} onClick={()=>openDetail({kind:"club",item:club})}>
    <ClubCover club={club} className="popClubCover"/>
    <span className="popClubBody">
      <b>{club.name}</b>
      <small>{club.district||"地区未設定"} · {membersOf(club.id).length}人{isMemberOf(club.id)?" · 所属中":""}</small>
      {!compact&&club.activity&&<span className="popClubText">{club.activity}</span>}
      <span className="popMiniChips">
        <i className={club.is_paid?"hot":"ok"}>{club.is_paid?"有料":"無料"}</i>
        {club.minors_ok&&<i className="ok">未成年OK</i>}
      </span>
    </span>
  </button>;
}

const CONTACT_TYPES=[["line","LINE"],["instagram","Instagram"],["x","X"],["facebook","Facebook"],["email","メール"],["url","その他のリンク"]];
const CONTACT_LABELS=Object.fromEntries(CONTACT_TYPES);
const CONTACT_PLACEHOLDERS={line:"LINE ID",instagram:"@ユーザー名",x:"@ユーザー名",facebook:"ユーザー名 または https://…",email:"name@example.com",url:"https://…"};
const MAX_PLACES=3;
const MAX_CONTACTS=5;

// Turns a contact into a safe link; LINE IDs stay plain text.
function personContactHref({type,value=""}){
  const v=value.trim();
  const id=v.replace(/^@/,"");
  const safeId=/^[A-Za-z0-9._-]{1,60}$/.test(id);
  if(type==="instagram") return /^https:\/\/(www\.)?instagram\.com\//i.test(v)?v:safeId?`https://www.instagram.com/${id}/`:"";
  if(type==="x") return /^https:\/\/(www\.)?(x|twitter)\.com\//i.test(v)?v:safeId?`https://x.com/${id}`:"";
  if(type==="facebook") return /^https:\/\/(www\.)?facebook\.com\//i.test(v)?v:safeId?`https://www.facebook.com/${id}`:"";
  if(type==="email") return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)?`mailto:${v}`:"";
  if(type==="url") return /^https?:\/\//i.test(v)?v:"";
  return "";
}

function PopAvatar({person,size=96}){
  if(person?.avatar) return <img className="popAvatar" src={person.avatar} alt="" style={{width:size,height:size}}/>;
  return <span className="popAvatar" aria-hidden="true" style={{width:size,height:size,fontSize:size*.42,background:AVATAR_COLORS[hashOf(person?.id||person?.name||"")%AVATAR_COLORS.length]}}>{(person?.name||"?").slice(0,1)}</span>;
}

// Personal page (new design). Used for other people and for "My page".
function PersonPage({person,ctx,onBack,top,bottom}){
  const {clubs,clubMembers,openDetail}=ctx;
  const myClubs=clubMembers.filter(m=>m.member_id===person.id).map(m=>clubs.find(c=>c.id===m.club_id)).filter(Boolean);
  const showPrivate=!person.minor; // SPEC 5: minors have no spots or contacts
  const contacts=showPrivate?person.contacts:[];
  const spots=showPrivate?[...person.spotDistricts,...person.spotPlaces]:[];

  return <div className="popPage popScreen">
    <Confetti/>
    {onBack&&<header className="popTopBar"><button onClick={onBack} aria-label="戻る">‹</button></header>}
    <div className="popStack">
      {top}
      <div className="popHero">
        <PopAvatar person={person}/>
        <h1 className="popName">{person.name}{person.minor&&<MinorBadge/>}</h1>
        <p className="popSub">{person.area||"地区未設定"}</p>
        {person.rawTags.length>0&&<div className="popTagChips">{person.rawTags.map(t=><span key={t}>{t}</span>)}</div>}
      </div>

      {contacts.map((c,i)=>{
        const href=personContactHref(c);
        const label=CONTACT_LABELS[c.type]||"連絡先";
        return href
          ? <a key={i} className="popLink" href={href} target="_blank" rel="noopener noreferrer">{label}<small>{c.value}</small></a>
          : <div key={i} className="popLink static">{label}<small>{c.type==="line"?`ID: ${c.value}`:c.value}</small></div>;
      })}

      {spots.length>0&&<section className="popCard"><h2>よくいる場所</h2><p>{spots.join(" ・ ")}</p></section>}

      <section className="popCard">
        <h2>所属クラブ</h2>
        {myClubs.length
          ? <div className="popMiniChips popMine">{myClubs.map(c=><button key={c.id} onClick={()=>openDetail({kind:"club",item:c})}>{c.name}</button>)}</div>
          : <p className="popMuted">まだ所属しているクラブはありません。</p>}
      </section>

      {person.bio&&<section className="popCard"><h2>ひとこと</h2><p>{person.bio}</p></section>}
      {bottom}
    </div>
  </div>;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

function PersonButton({person:p,openDetail,note}){
  return <button className="popPerson" onClick={()=>openDetail({kind:"person",item:p})}>
    <Avatar person={p} size={56}/>
    <span>
      <b>{p.name}{p.minor&&<MinorBadge/>}</b>
      <small>{p.area}</small>
      {note?<small className="popCommon">{note}</small>:<span className="popMiniChips">{p.tags.slice(0,4).map(t=><i key={t}>{t}</i>)}</span>}
    </span>
  </button>;
}

function People({ctx,others}){
  const {openDetail,profile,clubs,clubMembers,userId}=ctx;
  const [q,setQ]=useState("");
  const [category,setCategory]=useState("all");
  const [tagFilter,setTagFilter]=useState("");

  // SPEC 4-3 / 5: adults do not see minors in "similar people" or in the commonality counts.
  const pool=profile?.is_minor?others:others.filter(p=>!p.minor);
  const myTags=uniqueTags(profile?.tags||[]);
  const myTagKeys=new Set(myTags.map(normTag));
  const myClubIds=new Set(clubMembers.filter(m=>m.member_id===userId).map(m=>m.club_id));
  const hasTag=(p,t)=>p.rawTags.some(x=>normTag(x)===normTag(t));
  const common=myTags.map(t=>[t,pool.filter(p=>hasTag(p,t)).length]).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);
  const similar=pool.map(p=>{
    const tags=p.rawTags.filter(t=>myTagKeys.has(normTag(t)));
    const shared=clubMembers.filter(m=>m.member_id===p.id&&myClubIds.has(m.club_id)).map(m=>clubs.find(c=>c.id===m.club_id)?.name).filter(Boolean);
    return {p,score:tags.length+shared.length,common:[...tags,...shared]};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,10);

  const base=tagFilter?pool.filter(p=>hasTag(p,tagFilter)):others;
  const matched=base.filter(x=>[x.name,x.area,x.bio,...x.rawTags].join(" ").toLowerCase().includes(q.trim().toLowerCase()));
  const counts=Object.fromEntries([...PEOPLE_CATEGORIES,"その他"].map(c=>[c,matched.filter(p=>personCategories(p).includes(c)).length]));
  const shown=category==="all"?matched:matched.filter(p=>personCategories(p).includes(category));

  return <div className="popPage popScreen">
    <Confetti/>
    <div className="popStack">
      <h1 className="popName">つながる</h1>

      {common.length>0&&<section className="popCard">
        <h2>あなたとの共通点</h2>
        <div className="popChoice wrap" role="group" aria-label="共通点で絞り込む">
          {common.map(([t,n])=><button key={t} aria-pressed={tagFilter===t} className={tagFilter===t?"on":""} onClick={()=>setTagFilter(tagFilter===t?"":t)}>{t} {n}人</button>)}
        </div>
      </section>}

      {!tagFilter&&similar.length>0&&<>
        <h2 className="popSecHead">似た人</h2>
        <div className="popList">{similar.map(({p,common})=><PersonButton key={p.id} person={p} openDetail={openDetail} note={`共通：${common.join("・")}`}/>)}</div>
      </>}

      <h2 className="popSecHead">{tagFilter?`「${tagFilter}」の人`:"みんな"}</h2>
      {tagFilter&&<button className="popLinkBtn" onClick={()=>setTagFilter("")}>絞り込みをやめる 〉</button>}
      <input className="popSearch" value={q} onChange={e=>setQ(e.target.value)} placeholder="名前・地区・タグで探す" aria-label="メンバーを検索"/>
      <PopChoice label="カテゴリー" value={category} onChange={setCategory} options={[["all","すべて"],...[...PEOPLE_CATEGORIES,"その他"].filter(c=>counts[c]).map(c=>[c,`${c} ${counts[c]}`])]}/>
      {!others.length?<p className="popEmpty">まだ他のメンバーがいません。招待した人が参加すると、ここに表示されます。</p>:
       !shown.length?<p className="popEmpty">条件に合うメンバーが見つかりませんでした。</p>:
       <div className="popList">{shown.map(p=><PersonButton key={p.id} person={p} openDetail={openDetail}/>)}</div>}
    </div>
  </div>;
}

// "近い場所" (SPEC 4-3): clubs by district / venue, people by district / spots.
function Nearby({ctx,onBack}){
  const {clubs,others,profile,openDetail}=ctx;
  const [district,setDistrict]=useState(DISTRICTS.includes(profile?.area)?profile.area:DISTRICTS[0]);
  const [q,setQ]=useState("");
  const word=q.trim().toLowerCase();
  // SPEC 5 / client decision: adults do not see minors in "近い場所".
  const pool=profile?.is_minor?others:others.filter(p=>!p.minor);

  const clubHits=clubs.filter(c=>word?(c.venue||"").toLowerCase().includes(word):c.district===district);
  const peopleHits=pool.map(p=>{
    if(word){
      const places=p.spotPlaces.filter(x=>x.toLowerCase().includes(word));
      return places.length?{p,why:`よくいる：${places.join("・")}`}:null;
    }
    const lives=p.area===district;
    const often=p.spotDistricts.includes(district);
    if(!lives&&!often) return null;
    const places=p.spotPlaces.length?`（${p.spotPlaces.join("・")}）`:"";
    return {p,why:[lives&&"住んでいる",often&&`よくいる${places}`].filter(Boolean).join(" · ")};
  }).filter(Boolean);
  const label=word?`「${q.trim()}」`:district==="市外・西海に関わる"?"近隣市町":district;

  return <div className="popPage popScreen">
    <Confetti/>
    <header className="popTopBar"><button onClick={onBack} aria-label="戻る">‹</button></header>
    <div className="popStack">
      <h1 className="popName">近い場所</h1>
      <PopChoice label="地区" value={word?"":district} onChange={d=>{setDistrict(d);setQ("");}} options={DISTRICTS.map(d=>[d,d==="市外・西海に関わる"?"近隣市町":d])}/>
      <input className="popSearch" value={q} onChange={e=>setQ(e.target.value)} placeholder="キーワードで探す（例：大島港）" aria-label="キーワードで探す"/>

      <h2 className="popSecHead">{label}のクラブ<small>{clubHits.length}件</small></h2>
      {clubHits.length
        ? <div className="popList">{clubHits.map(c=><ClubCard key={c.id} club={c} ctx={ctx}/>)}</div>
        : <p className="popEmpty">見つかりませんでした。</p>}

      <h2 className="popSecHead">{label}の人<small>{peopleHits.length}人</small></h2>
      {peopleHits.length
        ? <div className="popList">{peopleHits.map(({p,why})=><PersonButton key={p.id} person={p} openDetail={openDetail} note={why}/>)}</div>
        : <p className="popEmpty">見つかりませんでした。</p>}
    </div>
  </div>;
}

// ---------------------------------------------------------------------------
// Community
// ---------------------------------------------------------------------------

function Community({ctx}){
  const {clubs,openDetail}=ctx;
  const [q,setQ]=useState("");
  const [district,setDistrict]=useState("all");
  const [fee,setFee]=useState("all");
  const [minorsOnly,setMinorsOnly]=useState(false);

  const words=q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matched=clubs.filter(c=>{
    if(district!=="all"&&c.district!==district) return false;
    if(fee==="free"&&c.is_paid) return false;
    if(fee==="paid"&&!c.is_paid) return false;
    if(minorsOnly&&!c.minors_ok) return false;
    const text=[c.name,c.activity,c.description,c.venue,c.frequency].join(" ").toLowerCase();
    return words.every(w=>text.includes(w));
  });
  const filtered=q||district!=="all"||fee!=="all"||minorsOnly;

  return <div className="popPage popScreen">
    <Confetti/>
    <div className="popStack">
      <h1 className="popName">クラブ</h1>
      <button className="popBtn" onClick={()=>openDetail({kind:"clubForm",item:null})}>＋ クラブをつくる</button>
      <input className="popSearch" value={q} onChange={e=>setQ(e.target.value)} placeholder="名前・活動内容・場所で探す" aria-label="クラブを検索"/>
      <div className="popFilters">
        <PopChoice label="地区" value={district} onChange={setDistrict} options={[["all","すべて"],...DISTRICTS.map(d=>[d,d==="市外・西海に関わる"?"市外":d])]}/>
        <PopChoice label="料金" value={fee} onChange={setFee} options={[["all","すべて"],["free","無料"],["paid","有料"]]}/>
        <div className="popChoice" role="group" aria-label="未成年">
          <button aria-pressed={minorsOnly} className={minorsOnly?"on":""} onClick={()=>setMinorsOnly(v=>!v)}>未成年OKだけ</button>
        </div>
      </div>
      {filtered&&<p className="popCount">{matched.length}件 <button onClick={()=>{setQ("");setDistrict("all");setFee("all");setMinorsOnly(false);}}>条件をクリア</button></p>}
      {!clubs.length?<p className="popEmpty">まだ登録がありません。</p>:
       !matched.length?<p className="popEmpty">条件に合うクラブは見つかりませんでした。</p>:
       <div className="popList">{matched.map(c=><ClubCard key={c.id} club={c} ctx={ctx}/>)}</div>}
    </div>
  </div>;
}

function PopChoice({label,value,onChange,options}){
  return <div className="popChoice" role="radiogroup" aria-label={label}>
    {options.map(([id,text])=><button key={id} role="radio" aria-checked={value===id} className={value===id?"on":""} onClick={()=>onChange(id)}>{text}</button>)}
  </div>;
}

// ---------------------------------------------------------------------------
// My page
// ---------------------------------------------------------------------------

function Me({ctx,tagOptions,logout,openAdmin,profile,saveProfile,message}){
  const [editing,setEditing]=useState(false);
  const person=toPerson(profile||{});

  if(editing) return <div className="popPage popScreen">
    <Confetti/>
    <header className="popTopBar"><button onClick={()=>setEditing(false)} aria-label="戻る">‹</button></header>
    <div className="popStack">
      <h1 className="popName">プロフィールを編集</h1>
      <ProfileForm initial={profile} minor={!!profile?.is_minor} tagOptions={tagOptions} saveProfile={saveProfile} submitLabel="保存する" onSaved={()=>setEditing(false)}/>
      {message&&<p className="popWarn" role="alert">{message}</p>}
    </div>
  </div>;

  return <PersonPage person={person} ctx={ctx} top={<>
    <div className="popMeBar">
      <button className="popSmallBtn" onClick={()=>setEditing(true)}>プロフィールを編集</button>
      {profile?.role==="admin"&&<button className="popSmallBtn ghost" onClick={openAdmin}>運営メニュー</button>}
    </div>
    {message&&<p className="popWarn" role="alert">{message}</p>}
  </>} bottom={<MeFooter logout={logout}/>}/>;
}

function MeFooter({logout}){
  return <button className="popLogout" onClick={logout}>ログアウト</button>;
}

function ProfileForm({initial,minor,tagOptions=[],saveProfile,submitLabel,onSaved}){
  const [form,setForm]=useState({
    name:initial?.name||"",area:initial?.area||"",bio:initial?.bio||"",
    tags:initial?.tags||[],
    spot_districts:initial?.spot_districts||[],
    spot_places:initial?.spot_places?.length?initial.spot_places:[""],
    contacts:(initial?.contacts||[]).map(c=>({type:c.type||"line",value:c.value||""}))
  });
  const [saving,setSaving]=useState(false);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const toggleDistrict=d=>set("spot_districts",form.spot_districts.includes(d)?form.spot_districts.filter(x=>x!==d):[...form.spot_districts,d]);
  const setPlace=(i,v)=>set("spot_places",form.spot_places.map((p,j)=>j===i?v:p));
  const setContact=(i,k,v)=>set("contacts",form.contacts.map((c,j)=>j===i?{...c,[k]:v}:c));

  async function submit(e){
    e.preventDefault(); setSaving(true);
    const ok=await saveProfile({
      ...form,
      spot_places:minor?[]:form.spot_places.map(p=>p.trim()).filter(Boolean).slice(0,MAX_PLACES),
      spot_districts:minor?[]:form.spot_districts,
      contacts:minor?[]:form.contacts.map(c=>({type:c.type,value:c.value.trim()})).filter(c=>c.value).slice(0,MAX_CONTACTS)
    });
    setSaving(false);
    if(ok) onSaved?.();
  }

  return <form className="popForm popStack" onSubmit={submit}>
    <section className="popCard">
      <label className="popField">{minor?"ニックネーム":"名前"}<input required maxLength={80} value={form.name} onChange={e=>set("name",e.target.value)}/>{minor&&<span className="popHint">本名ではなく、ニックネームを入れてください。</span>}</label>
      <label className="popField">住んでいる地区<select required value={form.area} onChange={e=>set("area",e.target.value)}><option value="">選んでください</option>{DISTRICTS.map(d=><option key={d}>{d}</option>)}</select></label>
      <label className="popField">ひとこと（自己紹介）<small>任意</small><textarea rows="3" maxLength={500} value={form.bio} onChange={e=>set("bio",e.target.value)}/></label>
    </section>

    <section className="popCard"><TagPicker value={form.tags} options={tagOptions} onChange={tags=>set("tags",tags)}/>
      <span className="popHint">「AI」「釣り」「音楽」「芸術」「地域のお店」を入れると、「つながる」のカテゴリーに表示されます。</span>
    </section>

    {!minor&&<section className="popCard">
      <h2>よくいる場所<small>任意</small></h2>
      <div className="popField">地区（いくつでも）
        <div className="popChoice wrap" role="group" aria-label="よくいる地区">
          {DISTRICTS.map(d=><button type="button" key={d} aria-pressed={form.spot_districts.includes(d)} className={form.spot_districts.includes(d)?"on":""} onClick={()=>toggleDistrict(d)}>{d}</button>)}
        </div>
      </div>
      <div className="popField">具体的な場所（3つまで）
        <p className="popWarn">ここに書いた場所は、ログインしている全員に見えます。</p>
        {form.spot_places.map((p,i)=><input key={i} maxLength={60} value={p} onChange={e=>setPlace(i,e.target.value)} placeholder="例：大島港の東の釣りポイント" aria-label={`具体的な場所${i+1}`}/>)}
        {form.spot_places.length<MAX_PLACES&&<button type="button" className="popSmallBtn ghost" onClick={()=>set("spot_places",[...form.spot_places,""])}>＋ 場所を追加</button>}
      </div>
    </section>}

    {!minor&&<section className="popCard">
      <h2>連絡先<small>任意・5件まで</small></h2>
      <span className="popHint">入れた連絡先は、ログインしている全員に見えます。</span>
      {form.contacts.map((c,i)=><div className="popContact" key={i}>
        <select aria-label={`連絡先${i+1}の種類`} value={c.type} onChange={e=>setContact(i,"type",e.target.value)}>{CONTACT_TYPES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
        <input aria-label={`連絡先${i+1}`} maxLength={200} value={c.value} onChange={e=>setContact(i,"value",e.target.value)} placeholder={CONTACT_PLACEHOLDERS[c.type]}/>
        <button type="button" className="popSmallBtn ghost" onClick={()=>set("contacts",form.contacts.filter((_,j)=>j!==i))}>この連絡先を消す</button>
      </div>)}
      {form.contacts.length<MAX_CONTACTS&&<button type="button" className="popSmallBtn" onClick={()=>set("contacts",[...form.contacts,{type:"line",value:""}])}>＋ 連絡先を追加</button>}
    </section>}

    <button className="popBtn" disabled={saving}>{saving?"保存中…":submitLabel}</button>
  </form>;
}

function TagPicker({value,options,onChange}){
  const [q,setQ]=useState("");
  const [draft,setDraft]=useState("");
  const selected=new Set(value);
  const full=value.length>=MAX_TAGS;
  const all=[...value.filter(t=>!options.includes(t)),...options];
  const shown=all.filter(t=>!q.trim()||t.toLowerCase().includes(q.trim().toLowerCase()));

  function toggle(t){
    if(selected.has(t)) onChange(value.filter(x=>x!==t));
    else if(!full) onChange([...value,t]);
  }
  function add(){
    const t=draft.trim().slice(0,40);
    if(!t) return;
    if(!selected.has(t)&&!full) onChange([...value,t]);
    setDraft(""); setQ("");
  }

  return <div className="tagPicker">
    <div className="tagPickerHead"><b>属性タグ</b><small>{value.length}／{MAX_TAGS}</small></div>
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="タグを探す" aria-label="タグを探す"/>
    <div className="tagChoices" role="group" aria-label="属性タグを選ぶ">
      {shown.map(t=><button type="button" key={t} aria-pressed={selected.has(t)} className={selected.has(t)?"on":""} disabled={!selected.has(t)&&full} onClick={()=>toggle(t)}>{t}</button>)}
      {!shown.length&&<span className="formHint">見つかりません。下から新しいタグとして追加できます。</span>}
    </div>
    <div className="tagAdd">
      <input value={draft} maxLength={40} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();add();}}} placeholder="＋ 新しいタグ（例：元野球部）" aria-label="新しいタグ"/>
      <button type="button" onClick={add} disabled={!draft.trim()||full}>追加</button>
    </div>
    <span className="formHint">追加したタグは、保存すると他の人も選べるようになります。</span>
  </div>;
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
  if(club?.imageSrc) return <div className={className+" clubCover"} role="img" aria-label={`${club.name}のトップイメージ`} style={{backgroundImage:`url("${club.imageSrc}")`}}></div>;
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

  if(kind==="person") return <PersonPage person={item} ctx={ctx} onBack={onBack}/>;
  if(kind==="nearby") return <Nearby ctx={ctx} onBack={onBack}/>;

  if(kind==="clubForm") return <ClubForm club={item} onBack={item?()=>ctx.openDetail({kind:"club",item}):onBack} ctx={ctx}/>;
  return <ClubPage club={ctx.clubs.find(c=>c.id===item.id)||item} onBack={onBack} ctx={ctx}/>;
}

function ClubPage({club,onBack,ctx}){
  const {clubMembers,membersOf,isMemberOf,canEditClub,joinClub,leaveClub,userId,profile,openDetail}=ctx;
  const [notice,setNotice]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const contactRef=useRef(null);
  const adultsOnlyForMe=!!profile?.is_minor&&!club.minors_ok;
  const lastAdmin=clubMembers.filter(m=>m.club_id===club.id&&m.is_admin).every(m=>m.member_id===userId)
    &&clubMembers.some(m=>m.club_id===club.id&&m.is_admin&&m.member_id===userId);

  function wantToJoin(){
    setNotice(true);
    contactRef.current?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function join(){
    if(!window.confirm("所属すると、このクラブのメンバー欄とあなたのプロフィールに表示されます（隠せません）。所属しますか？")) return;
    setBusy(true); setError(await joinClub(club.id)); setBusy(false);
  }

  async function leave(){
    const msg=lastAdmin
      ? "あなたがやめると、このクラブの管理者がいなくなります。運営が代わりに管理します。所属をやめますか？"
      : "このクラブの所属をやめますか？";
    if(!window.confirm(msg)) return;
    setBusy(true); setError(await leaveClub(club.id)); setBusy(false);
  }
  const members=membersOf(club.id);
  const joined=isMemberOf(club.id);
  const contacts=(Array.isArray(club.contacts)?club.contacts:[]).filter(c=>c&&(c.label||c.url||c.note));
  const about=[["活動内容",club.activity],["活動場所",club.venue],["頻度",club.frequency]].filter(([,v])=>v);

  return <div className="popPage">
    <Confetti/>
    <header className="popTopBar"><button onClick={onBack} aria-label="戻る">‹</button>
      {canEditClub(club.id)&&<button className="popEditBtn" onClick={()=>openDetail({kind:"clubForm",item:club})}>編集する</button>}
    </header>
    <div className="popStack">
      <ClubCover club={club} className="popCover"/>
      <h1 className="popName">{club.name}</h1>
      <div className="popStats">
        <div><small>メンバー</small><b>{members.length}人</b></div>
        <div><small>エリア</small><b>{club.district||"未設定"}</b></div>
        <div className="you"><small>あなた</small><b>{joined?"所属中":"未所属"}</b></div>
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
      {!joined&&<button className="popBtn" onClick={wantToJoin}>参加したい</button>}

      <h2 className="popSecHead popAnchor" ref={contactRef}>連絡・参加の方法</h2>
      {notice&&<p className="popCheer" role="status">まずは連絡してみましょう！</p>}
      {contacts.length?contacts.map((c,i)=>{
        const href=contactHref(c.url);
        const body=<>{c.label||c.url}{c.note&&<small>{c.note}</small>}</>;
        return href
          ? <a key={i} className="popLink" href={href} target="_blank" rel="noopener noreferrer">{body}</a>
          : <div key={i} className="popLink static">{body}</div>;
      }):<div className="popLink static">準備中<small>連絡方法はまだ登録されていません</small></div>}

      <div className="popJoinRow">
        {joined
          ? <button className="popSmallBtn ghost" disabled={busy} onClick={leave}>所属をやめる</button>
          : adultsOnlyForMe
            ? <span className="popHint">このクラブは大人のみです。</span>
            : <button className="popSmallBtn" disabled={busy} onClick={join}>このクラブに所属する</button>}
      </div>
      {error&&<p className="popWarn" role="alert">{error}</p>}
      <h2 className="popSecHead">参加メンバー（{members.length}人）</h2>
      {members.length
        ? <div className="popMembers" aria-label="参加メンバー（横にスワイプ）" tabIndex={0}>
            {members.map(m=><button key={m.member_id} className="popMember" onClick={()=>openDetail({kind:"person",item:m.person})}>
              {m.person.avatar
                ? <img src={m.person.avatar} alt=""/>
                : <i style={{background:AVATAR_COLORS[hashOf(m.member_id)%AVATAR_COLORS.length]}} aria-hidden="true">{(m.person.name||"?").slice(0,1)}</i>}
              <span>{m.person.name}</span>
              {m.is_admin&&<span className="adminBadge">管理者</span>}
              {m.person.minor&&<MinorBadge/>}
            </button>)}
          </div>
        : <p className="popEmpty">まだメンバーはいません。</p>}
      <p className="popUpdated">最終更新 {formatDay(club.updated_at)}</p>
    </div>
  </div>;
}

const DISTRICTS=["西彼町","西海町","大島町","崎戸町","大瀬戸町","市外・西海に関わる"];
const CLUB_ERRORS={
  invalid_name:"名前を入れてください（80文字まで）。",
  invalid_activity:"活動内容を入れてください（300文字まで）。",
  invalid_district:"地区を選んでください。",
  invalid_contacts:"連絡・参加の方法を1つ以上入れてください（10件まで）。",
  too_long:"文字数が多すぎる項目があります。",
  invalid_image:"写真をもう一度選び直してください。",
  has_minor_members:"未成年のメンバーがいるため、「未成年参加可」を「いいえ」にはできません。",
  forbidden:"このクラブを編集する権限がありません。"
};
const IMAGE_TYPES={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
const MAX_IMAGE_BYTES=5*1024*1024;

function ClubForm({club,onBack,ctx}){
  const {userId,profile,reloadClubs,openDetail}=ctx;
  const minor=!!profile?.is_minor;
  const editing=!!club;
  const [form,setForm]=useState({
    name:club?.name||"",activity:club?.activity||"",description:club?.description||"",
    district:club?.district||"",venue:club?.venue||"",frequency:club?.frequency||"",
    is_paid:club?Boolean(club.is_paid):null,
    minors_ok:minor?true:club?Boolean(club.minors_ok):null,
    image_url:club?.image_url||""
  });
  const [contacts,setContacts]=useState(()=>{
    const list=(Array.isArray(club?.contacts)?club.contacts:[]).map(c=>({label:c.label||"",url:c.url||"",note:c.note||""}));
    return list.length?list:[{label:"",url:"",note:""}];
  });
  const [preview,setPreview]=useState(club?.imageSrc||"");
  const [uploading,setUploading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const setContact=(i,k,v)=>setContacts(list=>list.map((c,j)=>j===i?{...c,[k]:v}:c));

  async function pickImage(e){
    const file=e.target.files?.[0];
    e.target.value="";
    if(!file) return;
    const ext=IMAGE_TYPES[file.type];
    if(!ext){setError("写真は JPEG・PNG・WebP のどれかにしてください。");return;}
    if(file.size>MAX_IMAGE_BYTES){setError("写真は5MBまでです。");return;}
    setUploading(true); setError("");
    const path=`${userId}/${crypto.randomUUID()}.${ext}`;
    const {error:upErr}=await supabase.storage.from(CLUB_IMAGE_BUCKET).upload(path,file,{contentType:file.type});
    setUploading(false);
    if(upErr){setError("写真をアップロードできませんでした。");return;}
    set("image_url",path);
    setPreview(URL.createObjectURL(file));
  }

  async function submit(e){
    e.preventDefault();
    if(form.is_paid===null){setError("有料かどうかを選んでください。");return;}
    if(form.minors_ok===null){setError("未成年が参加できるかを選んでください。");return;}
    setSaving(true); setError("");
    const payload={...form,contacts:contacts.filter(c=>c.label.trim()||c.url.trim()||c.note.trim())};
    const {data,error:rpcErr}=editing
      ? await supabase.rpc("update_club",{p_id:club.id,p:payload})
      : await supabase.rpc("create_club",{p:payload});
    if(rpcErr){
      setSaving(false);
      const code=Object.keys(CLUB_ERRORS).find(k=>rpcErr.message?.includes(k));
      setError(code?CLUB_ERRORS[code]:"保存できませんでした。時間をおいてもう一度お試しください。");
      return;
    }
    const fresh=await reloadClubs();
    setSaving(false);
    openDetail({kind:"club",item:fresh?.find(c=>c.id===data.id)||data});
  }

  const YesNo=({value,onChange,yes,no,disabled})=><div className="popToggle" role="radiogroup">
    <button type="button" role="radio" aria-checked={value===true} className={value===true?"on":""} disabled={disabled} onClick={()=>onChange(true)}>{yes}</button>
    <button type="button" role="radio" aria-checked={value===false} className={value===false?"on":""} disabled={disabled} onClick={()=>onChange(false)}>{no}</button>
  </div>;

  return <div className="popPage">
    <Confetti/>
    <header className="popTopBar"><button onClick={onBack} aria-label="戻る">‹</button></header>
    <form className="popStack popForm" onSubmit={submit}>
      <h1 className="popName">{editing?"クラブを編集":"クラブをつくる"}</h1>
      <p className="popNote">登録内容は運営が確認します。不適切な内容は削除される場合があります。</p>

      <section className="popCard">
        <h2>トップ写真<small>任意</small></h2>
        {preview
          ? <div className="popCover clubCover" style={{backgroundImage:`url("${preview}")`}} role="img" aria-label="選んだ写真"></div>
          : <ClubCover club={{id:club?.id||"new",name:form.name}} className="popCover"/>}
        <div className="popRowBtns">
          <label className="popSmallBtn">{uploading?"アップロード中…":preview?"写真を変える":"写真を選ぶ"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickImage} disabled={uploading} hidden/></label>
          {preview&&<button type="button" className="popSmallBtn ghost" onClick={()=>{set("image_url","");setPreview("");}}>写真を外す</button>}
        </div>
        <span className="popHint">JPEG・PNG・WebP、5MBまで。写真がないときは絵柄が出ます。</span>
      </section>

      <section className="popCard">
        <label className="popField">名前<input required maxLength={80} value={form.name} onChange={e=>set("name",e.target.value)} placeholder="西海フィッシングCLUB"/></label>
        <label className="popField">活動内容<textarea required rows="2" maxLength={300} value={form.activity} onChange={e=>set("activity",e.target.value)} placeholder="海釣り・さばき方教室"/></label>
        <label className="popField">地区<select required value={form.district} onChange={e=>set("district",e.target.value)}><option value="">選んでください</option>{DISTRICTS.map(d=><option key={d}>{d}</option>)}</select></label>
        <label className="popField">活動場所<small>任意</small><input maxLength={120} value={form.venue} onChange={e=>set("venue",e.target.value)} placeholder="大島港 東岸壁"/></label>
        <label className="popField">頻度<small>任意</small><input maxLength={80} value={form.frequency} onChange={e=>set("frequency",e.target.value)} placeholder="毎週土曜の朝"/></label>
        <label className="popField">説明<small>任意</small><textarea rows="4" maxLength={1000} value={form.description} onChange={e=>set("description",e.target.value)}/></label>
      </section>

      <section className="popCard">
        <h2>参加条件</h2>
        <div className="popField">有料かどうか<YesNo value={form.is_paid} onChange={v=>set("is_paid",v)} yes="有料" no="無料"/></div>
        <div className="popField">未成年の参加<YesNo value={form.minors_ok} onChange={v=>set("minors_ok",v)} yes="参加できる" no="大人のみ" disabled={minor}/>
          {minor&&<span className="popHint">未成年の人が管理するクラブは「参加できる」になります。</span>}</div>
      </section>

      <section className="popCard">
        <h2>連絡・参加の方法</h2>
        {minor
          ? <p className="popWarn">個人のLINEや電話番号は入れず、クラブ用のアカウントを入れてください。</p>
          : <span className="popHint">クラブ用のLINE・Instagram などを入れてください。リンクがなくても「直接来てOK」などの文だけでも大丈夫です。</span>}
        {contacts.map((c,i)=><div className="popContact" key={i}>
          <input aria-label={`連絡方法${i+1}の名前`} maxLength={60} value={c.label} onChange={e=>setContact(i,"label",e.target.value)} placeholder="名前（例：LINEオープンチャット）"/>
          <input aria-label={`連絡方法${i+1}のリンクまたは電話番号`} maxLength={300} value={c.url} onChange={e=>setContact(i,"url",e.target.value)} placeholder="https://… または tel:0959…"/>
          <input aria-label={`連絡方法${i+1}のひとこと`} maxLength={120} value={c.note} onChange={e=>setContact(i,"note",e.target.value)} placeholder="ひとこと（例：土曜6時 大島港）"/>
          {contacts.length>1&&<button type="button" className="popSmallBtn ghost" onClick={()=>setContacts(list=>list.filter((_,j)=>j!==i))}>この連絡方法を消す</button>}
        </div>)}
        {contacts.length<10&&<button type="button" className="popSmallBtn" onClick={()=>setContacts(list=>[...list,{label:"",url:"",note:""}])}>＋ 追加</button>}
      </section>

      {error&&<p className="popWarn" role="alert">{error}</p>}
      <button className="popBtn" disabled={saving||uploading}>{saving?"保存中…":editing?"保存する":"公開する"}</button>
    </form>
  </div>;
}

