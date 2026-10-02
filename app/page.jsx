"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import Admin from "./Admin";

const navItems=[
  ["home","ホーム","⌂"],
  ["people","つながる","♙"],
  ["community","コミュニティ","♧"],
  ["discover","みつける","⌕"],
  ["me","マイページ","○"]
];

const TOP_IMAGES={
  home:"/images/top-home.jpg",
  people:"/images/top-people.jpg",
  community:"/images/top-community.jpg",
  discover:"/images/top-discover.jpg",
  news:"/images/top-news.jpg",
  me:"/images/top-me.jpg"
};

const PEOPLE_CATEGORIES=["AI","釣り","音楽","芸術","地域のお店"];
const KIND_LABELS={event:"イベント",news:"ニュース",work:"仕事・募集",community:"コミュニティ",challenge:"チャレンジ"};
const ACTION_LABELS={going:"参加予定",interested:"興味あり",joined:"参加中",saved:"保存",work_interest:"仕事に興味",challenge_interest:"チャレンジに興味"};
const STATUS_LABELS={pending:"確認待ち",published:"公開中",rejected:"見送り",archived:"終了"};
const JOIN_MESSAGE="コミュニティに参加しました！さっそくイベントに出かけてみましょう";

const ENTRY_COLUMNS="id,kind,status,title,summary,body,area,tags,details,image_url,source_name,source_url,submitted_by,community_id,published_at,created_at";

function cleanTitle(v=""){return v.replace(/^【デモ】/,"");}
function normTag(t=""){return t.normalize("NFKC").trim().toLowerCase();}
function splitList(v=""){return v.split(/[,、]/).map(x=>x.trim()).filter(Boolean).slice(0,8);}
function uniqueTags(list){const seen=new Set();return list.filter(t=>{const k=normTag(t);if(!k||seen.has(k))return false;seen.add(k);return true;});}

function todayStr(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// Upcoming events first (soonest date first), undated events last, past events hidden.
function upcomingEvents(events){
  const today=todayStr();
  return events
    .filter(e=>!e.details?.date||e.details.date>=today)
    .sort((a,b)=>(a.details?.date||"9999").localeCompare(b.details?.date||"9999"));
}

function formatDate(v=""){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if(!m) return v;
  const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
  return `${d.getMonth()+1}月${d.getDate()}日 (${"日月火水木金土"[d.getDay()]})`;
}

function formatDay(v){
  if(!v) return "";
  const d=new Date(v);
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
}

function attendance(item,actionCounts){
  const going=actionCounts?.[item?.id]?.going||0;
  const capacity=item?.details?.capacity;
  return capacity?`${going} / ${capacity}人`:`${going}人`;
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
    avatar:x.avatar_url||""
  };
}

function personCategories(person){
  const tags=person.rawTags.map(normTag);
  const hit=PEOPLE_CATEGORIES.filter(c=>tags.includes(normTag(c)));
  return hit.length?hit:["その他"];
}

function Avatar({person,size=54}){
  if(person?.avatar) return <img className="avatar" src={person.avatar} alt="" style={{width:size,height:size}}/>;
  return <span className="avatar avatarInitial" aria-hidden="true" style={{width:size,height:size,fontSize:size*.4}}>{(person?.name||"?").slice(0,1)}</span>;
}

function LikeButton({person,interest,className="primaryCta"}){
  const on=interest.sent.includes(person.id);
  return <button className={className+(on?" interestOn":"")} aria-pressed={on} onClick={e=>{e.stopPropagation();interest.toggle(person.id);}}>{on?"いいね！済み ✓":"いいね！"}</button>;
}

export default function Page(){
  const [userId,setUserId]=useState("");
  const [invite,setInvite]=useState("");
  const [entries,setEntries]=useState([]);
  const [profile,setProfile]=useState(null);
  const [directory,setDirectory]=useState([]);
  const [submissions,setSubmissions]=useState([]);
  const [actions,setActions]=useState([]);
  const [actionCounts,setActionCounts]=useState({});
  const [sentInterests,setSentInterests]=useState([]);
  const [receivedInterests,setReceivedInterests]=useState([]);
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
    await Promise.all([loadEntries(),loadDirectory(),loadSubmissions(uid),loadActions(uid),loadActionCounts(),loadInterests(uid)]);
  }

  async function loadEntries(){
    const {data,error}=await supabase.from("entries").select(ENTRY_COLUMNS).eq("status","published").order("published_at",{ascending:false});
    if(error){setMessage("コンテンツを読み込めませんでした。");return;}
    setEntries(data||[]);
  }

  async function loadProfile(uid){
    const {data}=await supabase.from("members").select("*").eq("id",uid).maybeSingle();
    setProfile(data||null);
    return data;
  }

  async function loadDirectory(){
    const {data}=await supabase.from("members").select("id,name,area,organization,bio,tags,skills,avatar_url").eq("visible",true).neq("name","").order("updated_at",{ascending:false});
    setDirectory(data||[]);
  }

  async function loadSubmissions(uid){
    const {data}=await supabase.from("entries").select(ENTRY_COLUMNS).eq("submitted_by",uid).order("created_at",{ascending:false});
    setSubmissions(data||[]);
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

  async function loadInterests(uid){
    const [{data:sent},{data:received}]=await Promise.all([
      supabase.from("member_interests").select("to_member").eq("from_member",uid),
      supabase.rpc("get_received_interests")
    ]);
    setSentInterests((sent||[]).map(x=>x.to_member));
    setReceivedInterests(received||[]);
  }

  async function toggleInterest(memberId){
    if(!memberId||memberId===userId) return;
    const {error}=sentInterests.includes(memberId)
      ? await supabase.from("member_interests").delete().match({from_member:userId,to_member:memberId})
      : await supabase.from("member_interests").insert({from_member:userId,to_member:memberId});
    if(!error) await loadInterests(userId);
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

  async function submitEvent(payload){
    const {error}=await supabase.from("entries").insert({
      kind:"event",
      status:"pending",
      origin:"member",
      submitted_by:userId,
      source_name:"会員投稿",
      title:payload.title.trim(),
      summary:payload.summary.trim(),
      area:payload.area||"",
      details:{
        date:payload.date||"",
        time:payload.time||"",
        venue:payload.venue||"",
        price:payload.price||""
      },
      tags:(payload.tags||[]).slice(0,8)
    });
    if(error){setMessage("イベントを登録できませんでした。");return false;}
    await loadSubmissions(userId);
    setMessage("イベントを登録しました。運営確認後に公開されます。");
    return true;
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
    setUserId(""); setEntries([]); setProfile(null); setDirectory([]); setSubmissions([]); setActions([]); setActionCounts({}); setSentInterests([]); setReceivedInterests([]); setInvite(""); setTab("home"); setDetail(null); setAdminOpen(false); setMessage("");
  }

  function go(nextTab,nextAnchor=""){
    setAnchor(nextAnchor);
    setDetail(null); setAdminOpen(false); setTab(nextTab);
  }

  const others=useMemo(()=>directory.filter(x=>x.id!==userId).map(toPerson),[directory,userId]);
  const receivedIds=useMemo(()=>receivedInterests.map(x=>x.id),[receivedInterests]);
  const interest={sent:sentInterests,received:receivedIds,toggle:toggleInterest};

  const byKind=useMemo(()=>({
    event:entries.filter(x=>x.kind==="event"),
    news:entries.filter(x=>x.kind==="news"),
    work:entries.filter(x=>x.kind==="work"),
    community:entries.filter(x=>x.kind==="community"),
    challenge:entries.filter(x=>x.kind==="challenge")
  }),[entries]);

  const ctx={byKind,entries,actions,actionCounts,hasAction,toggleAction,interest,openDetail:setDetail,go};

  if(!supabaseConfigured){
    return <main className="gate">
      <section className="gateCard">
        <h2>設定が必要です</h2>
        <p>環境変数 NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY を設定してください。</p>
      </section>
    </main>;
  }

  if(!userId){
    return <main className="gate">
      <section className="gateLeft">
        <Logo/>
        <span className="gateBadge">INVITATION ONLY</span>
        <h1>西海にいるなら、<br/>ここに入っておく。</h1>
        <p>人・仕事・イベント・コミュニティ・地域のいい話。<br/>西海の「知りたい」と「つながりたい」をひとつの場所に。</p>
      </section>
      <section className="gateCard">
        <h2>招待コードを入力</h2>
        <p>メールアドレスは不要です。</p>
        <input value={invite} onChange={e=>setInvite(e.target.value)} onKeyDown={e=>e.key==="Enter"&&enter()} placeholder="招待コード" aria-label="招待コード" autoFocus/>
        <button onClick={enter} disabled={busy||!invite.trim()}>{busy?"確認中…":"SAIKAI AWAITS に入る"}</button>
        {message&&<div className="gateMessage">{message}</div>}
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

  const activeNav=tab==="news"?"discover":tab;

  return <main className="appStage">
    <section className="app">
      {adminOpen ? <Admin onBack={()=>setAdminOpen(false)} onChanged={()=>Promise.all([loadEntries(),loadSubmissions(userId)])}/>
      : detail ? <DetailView key={detail.item?.id||detail.item?.name} detail={detail} onBack={()=>setDetail(null)} ctx={ctx}/>
      : <>
        {tab==="home"&&<Home ctx={ctx} profile={profile} others={others} receivedCount={receivedInterests.length}/>}
        {tab==="people"&&<People ctx={ctx} others={others}/>}
        {tab==="community"&&<Community ctx={ctx}/>}
        {tab==="discover"&&<Discover ctx={ctx}/>}
        {tab==="news"&&<NewsPage ctx={ctx}/>}
        {tab==="me"&&<Me ctx={ctx} logout={logout} openAdmin={()=>setAdminOpen(true)} receivedInterests={receivedInterests} profile={profile} saveProfile={saveProfile} submissions={submissions} submitEvent={submitEvent} message={message}/>}
      </>}
      <nav className="bottomNav" aria-label="メインメニュー">
        {navItems.map(([id,label,icon])=><button key={id} className={!adminOpen&&activeNav===id?"active":""} aria-current={!adminOpen&&!detail&&activeNav===id?"page":undefined} onClick={()=>go(id)}>
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

function Home({ctx,profile,others,receivedCount}){
  const {byKind,actionCounts,hasAction,toggleAction,openDetail,go}=ctx;
  const myTags=[...(profile?.tags||[]),...(profile?.skills||[])].map(normTag);
  const shared=p=>p.rawTags.filter(t=>myTags.includes(normTag(t))).length;
  const person=[...others].sort((a,b)=>shared(b)-shared(a))[0];
  const featured=upcomingEvents(byKind.event).slice(0,4);
  const [slide,setSlide]=useState(0);
  const event=featured[slide]||featured[0];
  const community=byKind.community.find(c=>!hasAction(c.id,"joined"))||byKind.community[0];
  const work=byKind.work[0];
  const news=[...byKind.news,...byKind.work].sort((a,b)=>(b.published_at||"").localeCompare(a.published_at||"")).slice(0,3);

  async function joinFromCard(e){
    e.stopPropagation();
    if(!hasAction(community.id,"joined")) await toggleAction(community.id,"joined");
    openDetail({kind:"community",item:community,justJoined:true});
  }

  return <div className="home">
    <header className="masthead" style={{backgroundImage:`linear-gradient(180deg,rgba(234,249,255,.85) 0%,rgba(240,252,255,.25) 35%,rgba(255,255,255,.1) 62%,#fff 100%),url("${TOP_IMAGES.home}")`}}>
      <div className="mastheadTop"><Logo/><div className="headActions">
        <button className="bell" onClick={()=>go("me","likes")} aria-label={receivedCount?`あなたへのいいね！ ${receivedCount}件`:"お知らせ"}>♧{receivedCount>0&&<b></b>}</button>
        <button className="headAvatar" onClick={()=>go("me")} aria-label="マイページ"><Avatar person={{name:profile?.name}} size={42}/></button>
      </div></div>
      <div className="greeting">
        <div><h1>こんにちは、{profile?.name||"メンバー"}さん <span>☀</span></h1><p>今日も、すてきな西海の一日を</p></div>
        <div className="weather"><div className="weatherSun">☀</div><div><b>西海市</b><strong>24°C</strong><small>晴れのちくもり</small></div></div>
      </div>
    </header>

    <section className="content">
      <SectionHead title="AWAITSニュース" onMore={()=>go("news")}/>

      {event?<article className="eventHero clickable" onClick={()=>openDetail({kind:"event",item:event})}>
        <div className="eventShade"></div>
        <div className="eventContent">
          <span className="orangeBadge">注目のイベント</span>
          <h3>{cleanTitle(event.title)}</h3>
          <p>{event.summary}</p>
          <div className="eventMeta"><span>▣　{formatDate(event.details?.date)||"日程調整中"} {event.details?.time||""}</span><span>●　{event.area} {event.details?.venue||""}</span><span>♟　{attendance(event,actionCounts)}　参加予定</span></div>
        </div>
        <button className="joinBtn" onClick={e=>{e.stopPropagation();openDetail({kind:"event",item:event});}}>{hasAction(event.id,"going")?"参加予定 ✓":"参加する　→"}</button>
        {featured.length>1&&<div className="dots">{featured.map((x,i)=><button key={x.id} className={i===slide?"on":""} aria-label={`${i+1}件目のイベント`} onClick={e=>{e.stopPropagation();setSlide(i);}}></button>)}</div>}
      </article>:<p className="emptyNote">これからのイベントはまだありません。</p>}

      <TodayPlan ctx={ctx}/>

      <SectionHead title="あなたへのおすすめ" onMore={()=>go("discover")}/>

      <div className="recommendGrid" style={{gridTemplateColumns:`repeat(${[person,community,work].filter(Boolean).length||1},1fr)`}}>
        {person&&<article className="recommendCard clickable" onClick={()=>openDetail({kind:"person",item:person})}>
          <div className="personTop"><Avatar person={person} size={56}/><span className="addPerson" aria-hidden="true">♙+</span></div>
          <div className="greenKicker">♣ 気の合いそうな人</div>
          <h3>{person.name}<small>さん</small></h3>
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

        {work&&<article className="recommendCard clickable" onClick={()=>openDetail({kind:"work",item:work})}>
          <img className="cardImage" src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=700&q=80" alt=""/>
          <div className="orangeKicker">▣ おすすめの仕事・募集</div>
          <h3>{cleanTitle(work.title)}</h3>
          <div className="miniMeta">▥ {work.details?.organization||"西海市"}</div>
          {work.details?.reward&&<div className="price">¥ {work.details.reward}</div>}
          <p>{work.summary}</p>
          <button className="softOrange" onClick={e=>{e.stopPropagation();openDetail({kind:"work",item:work});}}>詳細を見る</button>
        </article>}
      </div>

      <SectionHead title="西海でいま起きていること" onMore={()=>go("news")}/>
      <div className="newsList">
        {news.map((n,i)=><article className="newsRow clickable" key={n.id} onClick={()=>openDetail({kind:n.kind,item:n})}>
          <img src={n.image_url||(i%2===0?"https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=480&q=80":"https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?auto=format&fit=crop&w=480&q=80")} alt="" loading="lazy"/>
          <div className="newsBody"><div className={n.kind==="work"?"orangeLabel":"blueLabel"}>{KIND_LABELS[n.kind]}</div><h3>{cleanTitle(n.title)}</h3><p>{n.summary}</p></div>
          <div className="newsAside"><small>{i===0?"2時間前":"5時間前"}</small><span>♥ {i===0?28:42}　○ {i===0?5:3}</span></div>
        </article>)}
      </div>
    </section>
  </div>;
}

// Today's schedule: events of joined communities / events I'm going to, plus work I've applied to.
function TodayPlan({ctx}){
  const {byKind,entries,actions,openDetail,go}=ctx;
  const today=todayStr();
  const joinedIds=new Set(actions.filter(a=>a.action==="joined").map(a=>a.entry_id));
  const goingIds=new Set(actions.filter(a=>a.action==="going").map(a=>a.entry_id));
  const mine=upcomingEvents(byKind.event.filter(e=>goingIds.has(e.id)||joinedIds.has(e.community_id)));
  const todays=mine.filter(e=>e.details?.date===today);
  const next=mine.filter(e=>e.details?.date!==today).slice(0,3);
  const applied=byKind.work.filter(w=>actions.some(a=>a.entry_id===w.id&&a.action==="work_interest"));
  const hostName=e=>{const h=entries.find(x=>x.id===e.community_id);return h?cleanTitle(h.title):"";};

  const row=(e,isToday)=><article key={e.id} className={"planRow clickable"+(isToday?" planToday":"")} onClick={()=>openDetail({kind:"event",item:e})}>
    <div className="planWhen">{isToday?<b>今日</b>:<b>{formatDate(e.details?.date)||"日程調整中"}</b>}<small>{e.details?.time||""}</small></div>
    <div className="planBody">
      <h3>{cleanTitle(e.title)}</h3>
      <small>{[hostName(e),e.details?.venue||e.area].filter(Boolean).join(" · ")}</small>
    </div>
    {goingIds.has(e.id)&&<span className="planBadge">参加予定</span>}
  </article>;

  return <section className="todayPlan">
    <SectionHead title="今日の活動予定"/>
    {todays.length?todays.map(e=>row(e,true)):<p className="planEmpty">今日の予定はありません。</p>}
    {next.length>0&&<><h4 className="planSub">次の予定</h4>{next.map(e=>row(e,false))}</>}
    {applied.length>0&&<><h4 className="planSub">応募している仕事</h4>{applied.map(w=><article key={w.id} className="planRow clickable" onClick={()=>openDetail({kind:"work",item:w})}>
      <div className="planWhen"><b>応募中</b></div>
      <div className="planBody"><h3>{cleanTitle(w.title)}</h3><small>{[w.details?.organization,w.details?.reward&&`報酬 ${w.details.reward}`].filter(Boolean).join(" · ")}</small></div>
    </article>)}</>}
    {!todays.length&&!next.length&&!applied.length&&<button className="secondaryCta fullCta" onClick={()=>go("community")}>コミュニティに参加して予定をつくる</button>}
  </section>;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

function People({ctx,others}){
  const {interest,openDetail}=ctx;
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
      <div className="listCards">{list.map(p=><PersonRow key={p.id} person={p} interest={interest} openDetail={openDetail}/>)}</div>
    </section>)}
  </PageShell>;
}

function PersonRow({person:p,interest,openDetail}){
  return <article className="personRow clickable" onClick={()=>openDetail({kind:"person",item:p})}>
    <Avatar person={p}/>
    <div><h3>{p.name}{interest.received.includes(p.id)&&<em className="interestBadge">あなたにいいね！</em>}</h3><small>{p.area} · {p.role}</small><p>{p.bio}</p><div className="tags">{p.tags.map(t=><span key={t}>{t}</span>)}</div></div>
    <LikeButton person={p} interest={interest} className="rowInterest"/>
  </article>;
}

// ---------------------------------------------------------------------------
// Community (communities + challenges)
// ---------------------------------------------------------------------------

function Community({ctx}){
  const {byKind,actionCounts,openDetail}=ctx;
  const [filter,setFilter]=useState("all");
  const items=filter==="community"?byKind.community:filter==="challenge"?byKind.challenge:[...byKind.community,...byKind.challenge];
  const eventCount=id=>upcomingEvents(byKind.event.filter(e=>e.community_id===id)).length;

  return <PageShell hero={{image:TOP_IMAGES.community,kicker:"COMMUNITY",title:"コミュニティ",lead:"好きなことから、つながる。誰かのチャレンジを応援する。"}}>
    <Chips label="種類" value={filter} onChange={setFilter} options={[["all","すべて"],["community","コミュニティ",byKind.community.length],["challenge","チャレンジ",byKind.challenge.length]]}/>
    {!items.length?<p className="emptyNote">まだ登録がありません。</p>:
    <div className="communityCards">{items.map((x,i)=><article className="clickable" key={x.id} onClick={()=>openDetail({kind:x.kind,item:x})}>
      <div className={"commCover c"+((i%3)+1)} style={x.image_url?{backgroundImage:`url("${x.image_url}")`}:undefined}></div>
      <div>
        <span className={x.kind==="challenge"?"kindTag challengeTag":"kindTag"}>{KIND_LABELS[x.kind]}</span>
        <h3>{cleanTitle(x.title)}</h3>
        <p>{x.summary}</p>
        <small>{x.kind==="community"?`♟ メンバー ${actionCounts[x.id]?.joined||0}人`:`♡ 興味あり ${actionCounts[x.id]?.challenge_interest||0}人`} · {x.area}{eventCount(x.id)?` · イベント${eventCount(x.id)}件`:""}</small>
      </div>
    </article>)}</div>}
  </PageShell>;
}

// ---------------------------------------------------------------------------
// Discover (AWAITS news + events) and the AWAITS news page
// ---------------------------------------------------------------------------

function awaitsNews(byKind){
  return [...byKind.news,...byKind.work].sort((a,b)=>(b.published_at||"").localeCompare(a.published_at||""));
}

function Discover({ctx}){
  const {byKind,openDetail,go,actionCounts}=ctx;
  const news=awaitsNews(byKind).slice(0,3);
  const events=upcomingEvents(byKind.event);
  return <PageShell hero={{image:TOP_IMAGES.discover,kicker:"DISCOVER",title:"みつける",lead:"西海のニュースと、これからのイベント。"}}>
    <SectionHead title="AWAITSニュース" onMore={()=>go("news")}/>
    {news.length?<div className="newsCards">{news.map(x=><NewsCard key={x.id} item={x} openDetail={openDetail}/>)}</div>:<p className="emptyNote">ニュースはまだありません。</p>}
    <SectionHead title="イベント情報"/>
    {events.length?<div className="eventCards">{events.map(x=><EventCard key={x.id} item={x} actionCounts={actionCounts} onOpen={()=>openDetail({kind:"event",item:x})}/>)}</div>:<p className="emptyNote">これからのイベントはまだありません。</p>}
  </PageShell>;
}

function NewsPage({ctx}){
  const {byKind,openDetail}=ctx;
  const [filter,setFilter]=useState("all");
  const all=awaitsNews(byKind);
  const items=filter==="all"?all:all.filter(x=>x.kind===filter);
  return <PageShell hero={{image:TOP_IMAGES.news,kicker:"AWAITS NEWS",title:"AWAITSニュース",lead:"西海のいい話と、仕事・募集のお知らせ。"}}>
    <Chips label="種類" value={filter} onChange={setFilter} options={[["all","すべて",all.length],["news","ニュース",byKind.news.length],["work","仕事・募集",byKind.work.length]]}/>
    {items.length?<div className="newsCards">{items.map(x=><NewsCard key={x.id} item={x} openDetail={openDetail}/>)}</div>:<p className="emptyNote">まだありません。</p>}
  </PageShell>;
}

function NewsCard({item,openDetail}){
  return <article className={"newsCard clickable"+(item.image_url?" withImage":"")} onClick={()=>openDetail({kind:item.kind,item})}>
    {item.image_url&&<img className="newsThumb" src={item.image_url} alt="" loading="lazy"/>}
    <div className="newsCardMeta"><span className={item.kind==="work"?"kindTag workTag":"kindTag"}>{item.source_url?.includes("instagram.com")?"Varygood":KIND_LABELS[item.kind]}</span><small>{formatDay(item.published_at)}</small></div>
    <h3>{cleanTitle(item.title)}</h3>
    {item.summary&&<p>{item.summary}</p>}
    {item.kind==="work"&&item.details?.reward&&<b className="newsReward">報酬 {item.details.reward}</b>}
  </article>;
}

function EventCard({item,actionCounts,onOpen,children}){
  const d=item.details||{};
  return <article className={"eventCard"+(onOpen?" clickable":"")} onClick={onOpen}>
    <div className="eventDate"><b>{formatDate(d.date)||"日程調整中"}</b>{d.time&&<small>{d.time}</small>}</div>
    <h3>{cleanTitle(item.title)}</h3>
    {item.summary&&<p>{item.summary}</p>}
    <dl className="eventFacts">
      <div><dt>場所</dt><dd>{d.venue||item.area||"西海市"}</dd></div>
      <div><dt>参加費</dt><dd>{d.price||"未定"}</dd></div>
      <div><dt>参加予定</dt><dd>{attendance(item,actionCounts)}</dd></div>
    </dl>
    {children}
  </article>;
}

// ---------------------------------------------------------------------------
// My page
// ---------------------------------------------------------------------------

function Me({ctx,logout,openAdmin,receivedInterests,profile,saveProfile,submissions,submitEvent,message}){
  const {actions,entries,interest,openDetail}=ctx;
  const [showEventForm,setShowEventForm]=useState(false);
  const [editing,setEditing]=useState(false);
  const withItem=actions.map(a=>({...a,item:entries.find(e=>e.id===a.entry_id)})).filter(x=>x.item);
  const joined=withItem.filter(x=>x.action==="joined");
  const otherActions=withItem.filter(x=>x.action!=="joined");
  const person={name:profile?.name};

  return <PageShell hero={{image:TOP_IMAGES.me,kicker:"MY PAGE",title:"マイページ",lead:"あなたの西海でのつながりと活動"}}>
    {editing
      ? <div className="entryForm profileEdit">
          <div className="formTitle"><b>プロフィールを編集</b><button type="button" onClick={()=>setEditing(false)} aria-label="閉じる">×</button></div>
          <ProfileForm initial={profile} saveProfile={saveProfile} submitLabel="保存する" onSaved={()=>setEditing(false)}/>
        </div>
      : <div className="profileCard">
          <Avatar person={person} size={76}/>
          <h3>{profile?.name||"メンバー"}</h3>
          <p>{profile?.area||"西海市"}{profile?.organization?" · "+profile.organization:""}</p>
          {profile?.bio&&<p className="profileBio">{profile.bio}</p>}
          <div className="tags profileTags">{uniqueTags([...(profile?.tags||[]),...(profile?.skills||[])]).slice(0,8).map(t=><span key={t}>{t}</span>)}</div>
          <button className="secondaryCta" onClick={()=>setEditing(true)}>プロフィールを編集</button>
        </div>}

    {profile?.role==="admin"&&<section className="quickActions"><button className="adminEntry" onClick={openAdmin}>運営メニュー</button></section>}
    <section className="quickActions"><button onClick={()=>setShowEventForm(!showEventForm)}>＋ イベントを登録</button></section>
    {showEventForm&&<EventSubmissionForm submitEvent={submitEvent} onDone={()=>setShowEventForm(false)}/>}
    {message&&<div className="inlineMessage">{message}</div>}

    <section className="myActivity" id="likes"><h2>あなたに「いいね！」したメンバー</h2>{receivedInterests.length?receivedInterests.map(x=>{const p=toPerson(x);return <div className="myInterestRow clickable" key={p.id} onClick={()=>openDetail({kind:"person",item:p})}><Avatar person={p} size={38}/><div><b>{p.name}</b><small>{p.area} · {p.role}</small></div>{interest.sent.includes(p.id)?<span className="mutualBadge">お互いにいいね！</span>:<LikeButton person={p} interest={interest} className="rowInterest"/>}</div>;}):<p>まだいません。プロフィールを充実させると見つけてもらいやすくなります。</p>}</section>

    <section className="myActivity"><h2>参加中のコミュニティ</h2>{joined.length?joined.map(x=><div className="myActionRow clickable" key={x.entry_id} onClick={()=>openDetail({kind:x.item.kind,item:x.item})}><span>{formatDay(x.created_at)} 参加</span><b>{cleanTitle(x.item.title)}</b></div>):<p>まだ参加していません。「コミュニティ」から気になる集まりに参加してみましょう。</p>}</section>

    <section className="myActivity"><h2>自分の登録</h2>{submissions?.length?submissions.map(x=><div className="mySubmissionRow" key={x.id}><div><b>{cleanTitle(x.title)}</b><small>{x.area||"西海市"}</small></div><span>{STATUS_LABELS[x.status]||x.status}</span></div>):<p>まだ登録はありません。</p>}</section>

    <section className="myActivity"><h2>参加・保存・興味あり</h2>{otherActions.length?otherActions.map(x=><div className="myActionRow clickable" key={x.action+x.entry_id} onClick={()=>openDetail({kind:x.item.kind,item:x.item})}><span>{ACTION_LABELS[x.action]||x.action}</span><b>{cleanTitle(x.item.title)}</b></div>):<p>まだありません。気になるイベントや活動を保存してみてください。</p>}</section>

    <button className="logout" onClick={logout}>ログアウト</button>
  </PageShell>;
}

function EventSubmissionForm({submitEvent,onDone}){
  const [form,setForm]=useState({title:"",summary:"",area:"",date:"",time:"",venue:"",price:"",tags:""});
  const [saving,setSaving]=useState(false);
  async function submit(e){
    e.preventDefault(); setSaving(true);
    const ok=await submitEvent({...form,tags:splitList(form.tags)});
    setSaving(false);
    if(ok) onDone();
  }
  return <form className="entryForm" onSubmit={submit}>
    <div className="formTitle"><b>イベント登録</b><button type="button" onClick={onDone} aria-label="閉じる">×</button></div>
    <label>イベント名<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
    <label>概要<textarea required rows="3" value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})}/></label>
    <div className="formTwo"><label>エリア<input value={form.area} onChange={e=>setForm({...form,area:e.target.value})} placeholder="大島町"/></label><label>日付<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label></div>
    <div className="formTwo"><label>時間<input value={form.time} onChange={e=>setForm({...form,time:e.target.value})} placeholder="11:00 - 15:00"/></label><label>場所<input value={form.venue} onChange={e=>setForm({...form,venue:e.target.value})}/></label></div>
    <label>参加費<input value={form.price} onChange={e=>setForm({...form,price:e.target.value})} placeholder="無料 / 2,000円"/></label>
    <label>タグ（カンマ区切り）<input value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} placeholder="交流, 子育て, 釣り"/></label>
    <button className="primaryCta fullCta" disabled={saving}>{saving?"登録中…":"確認依頼を送る"}</button>
  </form>;
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

const DETAIL_IMAGES={
  event:"https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?auto=format&fit=crop&w=1100&q=88",
  community:"https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=1100&q=88",
  work:"https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1100&q=88",
  news:"https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1100&q=88",
  challenge:"https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1100&q=88"
};

function DetailView({detail,onBack,ctx}){
  const {kind,item}=detail;
  const {byKind,entries,actionCounts,hasAction,toggleAction,interest,openDetail}=ctx;
  const [justJoined,setJustJoined]=useState(Boolean(detail.justJoined));
  const title=cleanTitle(item?.title||item?.name||"");

  if(kind==="person"){
    return <div className="detailPage">
      <DetailHeader onBack={onBack}/>
      <section className="personDetailHero">
        <Avatar person={item} size={110}/>
        <h1>{item.name}</h1>
        <p>{item.area} · {item.role}</p>
        <div className="tags detailTags">{(item.tags||[]).map(t=><span key={t}>{t}</span>)}</div>
        {interest.received.includes(item.id)&&<p className="interestNote">{interest.sent.includes(item.id)?"お互いにいいね！しています":"この人はあなたに「いいね！」しています"}</p>}
        {item.id&&<LikeButton person={item} interest={interest}/>}
      </section>
      <section className="detailBody">
        <DetailBlock title="この人について"><p>{item.bio||"まだ自己紹介がありません。"}</p></DetailBlock>
        <DetailBlock title="興味・できること"><div className="detailChips">{(item.tags||[]).map(t=><span key={t}>{t}</span>)}</div></DetailBlock>
      </section>
    </div>;
  }

  const hostedEvents=upcomingEvents(byKind.event.filter(e=>e.community_id===item?.id));
  const host=item?.community_id?entries.find(e=>e.id===item.community_id):null;
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

  const eventList=<div className="eventCards">{hostedEvents.map(ev=><EventCard key={ev.id} item={ev} actionCounts={actionCounts}>
    {ev.body&&<p className="eventBody">{ev.body}</p>}
    <div className="dualCta">
      <button className="secondaryCta" onClick={()=>openDetail({kind:"event",item:ev})}>詳しく見る</button>
      <button className={"primaryCta"+(hasAction(ev.id,"going")?" interestOn":"")} onClick={()=>toggleAction(ev.id,"going")}>{hasAction(ev.id,"going")?"参加予定 ✓":"参加する"}</button>
    </div>
  </EventCard>)}</div>;

  const label={event:"EVENT",community:"COMMUNITY",work:"WORK",news:"GOOD NEWS",challenge:"CHALLENGE"}[kind]||"DETAIL";
  return <div className="detailPage">
    <DetailHeader onBack={onBack}/>
    <div className="detailHeroImage" style={{backgroundImage:`linear-gradient(180deg,rgba(5,29,48,.05),rgba(5,29,48,.58)),url("${item?.image_url||DETAIL_IMAGES[kind]}")`}}>
      <span className="detailLabel">{label}</span>
      <h1>{title}</h1>
      <p>{item?.summary}</p>
    </div>
    <section className="detailBody">
      {kind==="event" && <>
        <div className="factGrid">
          <Fact label="日時" value={item?.details?.date ? `${formatDate(item.details.date)} ${item.details.time||""}` : "未定"}/>
          <Fact label="場所" value={item?.details?.venue||item?.area||"西海市"}/>
          <Fact label="参加費" value={item?.details?.price||"未定"}/>
          <Fact label="参加予定" value={attendance(item,actionCounts)}/>
        </div>
        <DetailBlock title="イベントについて"><p>{item?.body||item?.summary||"西海の仲間と気軽につながれるイベントです。"}</p></DetailBlock>
        <DetailBlock title="主催">
          {host
            ? <button className="organizerRow organizerLink" onClick={()=>openDetail({kind:host.kind,item:host})}><div className="organizerAvatar">{cleanTitle(host.title).slice(0,1)}</div><div><b>{cleanTitle(host.title)}</b><small>{KIND_LABELS[host.kind]}のページを見る 〉</small></div></button>
            : <div className="organizerRow"><div className="organizerAvatar">S</div><div><b>SAIKAI AWAITS</b><small>西海市</small></div></div>}
        </DetailBlock>
        <div className="dualCta"><button className="secondaryCta" onClick={()=>toggleAction(item?.id,"interested")}>{on("interested")?"興味あり ✓":"興味あり"}</button><button className="primaryCta" onClick={()=>toggleAction(item?.id,"going")}>{on("going")?"参加予定 ✓":"参加する"}</button></div>
      </>}

      {kind==="community" && <>
        <div className="factGrid">
          <Fact label="メンバー" value={`${actionCounts[item?.id]?.joined||0}人`}/>
          <Fact label="エリア" value={item?.area||"西海市"}/>
          <Fact label="これからのイベント" value={`${hostedEvents.length}件`}/>
          <Fact label="あなた" value={on("joined")?"参加中":"未参加"}/>
        </div>
        <DetailBlock title="コミュニティについて"><p>{item?.body||item?.summary}</p></DetailBlock>
        <button className={"primaryCta fullCta"+(on("joined")?" joinedCta":"")} onClick={toggleJoin}>{on("joined")?"参加中 ✓":"このコミュニティに参加"}</button>
        {justJoined&&on("joined")&&<div className="joinMessage" role="status"><b>🎉 {JOIN_MESSAGE}</b></div>}
        {on("joined")
          ? <DetailBlock title="このコミュニティのイベント">{hostedEvents.length?eventList:<p>予定されているイベントはまだありません。</p>}</DetailBlock>
          : <DetailBlock title="このコミュニティのイベント"><p>{hostedEvents.length?`これから${hostedEvents.length}件のイベントが予定されています。参加すると詳細が見られます。`:"予定されているイベントはまだありません。"}</p></DetailBlock>}
      </>}

      {kind==="work" && <>
        {item?.details?.reward&&<div className="salaryBox"><small>報酬</small><strong>{item.details.reward}</strong></div>}
        <div className="factGrid">
          <Fact label="場所" value={item?.area||"西海市"}/>
          <Fact label="形態" value={item?.details?.type||"未定"}/>
          {item?.details?.organization&&<Fact label="依頼元" value={item.details.organization}/>}
        </div>
        <DetailBlock title="募集内容"><p>{item?.body||item?.summary}</p></DetailBlock>
        {item?.tags?.length>0&&<DetailBlock title="こんな人を探しています"><div className="detailChips">{item.tags.map(t=><span key={t}>{t}</span>)}</div></DetailBlock>}
        {item?.source_url&&<a className="secondaryCta fullCta linkCta" href={item.source_url} target="_blank" rel="noopener noreferrer">募集ページを見る</a>}
        <div className="dualCta"><button className="secondaryCta" onClick={()=>toggleAction(item?.id,"saved")}>{on("saved")?"保存済み ✓":"保存"}</button><button className="primaryCta" onClick={()=>toggleAction(item?.id,"work_interest")}>{on("work_interest")?"興味あり ✓":"担当者につながる"}</button></div>
      </>}

      {kind==="news" && <>
        {item?.image_url&&<img className="newsDetailImage" src={item.image_url} alt=""/>}
        <DetailBlock title={item?.source_name||"西海のGOOD NEWS"}><p className="preLine">{item?.body||item?.summary}</p></DetailBlock>
        <DetailBlock title="関連する場所"><div className="detailChips"><span>{item?.area||"西海市"}</span>{(item?.tags||[]).map(t=><span key={t}>{t}</span>)}</div></DetailBlock>
        {item?.source_url&&<a className="secondaryCta fullCta linkCta" href={item.source_url} target="_blank" rel="noopener noreferrer">{item.source_url.includes("instagram.com")?"Instagramで見る":"元の記事を見る"}</a>}
        <button className="primaryCta fullCta" onClick={()=>toggleAction(item?.id,"saved")}>{on("saved")?"保存済み ✓":"保存"}</button>
      </>}

      {kind==="challenge" && <>
        <DetailBlock title="やりたいこと"><p>{item?.body||item?.summary}</p></DetailBlock>
        {item?.tags?.length>0&&<DetailBlock title="キーワード"><div className="detailChips">{item.tags.map(t=><span key={t}>{t}</span>)}</div></DetailBlock>}
        <button className="primaryCta fullCta" onClick={()=>toggleAction(item?.id,"challenge_interest")}>{on("challenge_interest")?"興味あり ✓":"興味あり"}</button>
        <DetailBlock title="このチャレンジのイベント">{hostedEvents.length?eventList:<p>予定されているイベントはまだありません。</p>}</DetailBlock>
      </>}
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
