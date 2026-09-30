"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const people = [
  {name:"山田 花子",area:"西海市",role:"地域クリエイター",bio:"西海の自然とテクノロジーで、地方から楽しいことをつくりたいです！",tags:["AI","釣り","動画編集"],photo:"https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=320&q=80"},
  {name:"田中 健太",area:"西海町",role:"漁業",bio:"海のことならなんでも。地域の仲間と新しい挑戦を。",tags:["釣り","海","地域活動"],photo:"https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=320&q=80"},
  {name:"佐藤 美咲",area:"大島町",role:"教育",bio:"子ども向けの学びの場づくりに関心があります。",tags:["教育","AI"],photo:"https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=320&q=80"}
];

const navItems=[
  ["home","ホーム","⌂"],
  ["people","つながる","♙"],
  ["community","コミュニティ","♧"],
  ["discover","みつける","⌕"],
  ["me","マイページ","○"]
];

function cleanTitle(v=""){return v.replace(/^【デモ】/,"");}

export default function Page(){
  const [token,setToken]=useState("");
  const [invite,setInvite]=useState("");
  const [entries,setEntries]=useState([]);
  const [profile,setProfile]=useState(null);
  const [directory,setDirectory]=useState([]);
  const [submissions,setSubmissions]=useState([]);
  const [actions,setActions]=useState([]);
  const [message,setMessage]=useState("");
  const [tab,setTab]=useState("home");
  const [detail,setDetail]=useState(null);
  const [busy,setBusy]=useState(true);

  useEffect(()=>{(async()=>{
    const saved=localStorage.getItem("saikai_awaits_session")||"";
    if(!saved){setBusy(false);return;}
    const {data}=await supabase.rpc("invite_session_valid",{p_session:saved});
    if(data){setToken(saved);await Promise.all([loadEntries(saved),loadProfile(saved),loadDirectory(saved),loadSubmissions(saved),loadActions(saved)]);}
    else localStorage.removeItem("saikai_awaits_session");
    setBusy(false);
  })();},[]);

  async function loadEntries(t){
    const {data,error}=await supabase.rpc("get_member_entries",{p_session:t});
    if(error){setMessage("コンテンツを読み込めませんでした。");return;}
    setEntries(data||[]);
  }

  async function loadProfile(t){
    const {data}=await supabase.rpc("get_member_profile",{p_session:t});
    setProfile(data||null);
  }

  async function loadDirectory(t){
    const {data}=await supabase.rpc("get_member_directory",{p_session:t});
    setDirectory(data||[]);
  }

  async function loadSubmissions(t){
    const {data}=await supabase.rpc("get_my_submissions",{p_session:t});
    setSubmissions(data||[]);
  }

  async function loadActions(t){
    const {data}=await supabase.rpc("get_member_actions",{p_session:t});
    setActions(data||[]);
  }

  async function saveProfile(payload){
    const {data,error}=await supabase.rpc("update_member_profile",{
      p_session:token,
      p_name:payload.name,
      p_area:payload.area,
      p_organization:payload.organization||"",
      p_bio:payload.bio||"",
      p_tags:payload.tags||[],
      p_skills:payload.skills||[]
    });
    if(error){setMessage("プロフィールを保存できませんでした。");return false;}
    setProfile(data); await loadDirectory(token); setMessage(""); return true;
  }

  async function submitEvent(payload){
    const {data,error}=await supabase.rpc("submit_member_entry",{
      p_session:token,
      p_kind:"event",
      p_title:payload.title,
      p_summary:payload.summary,
      p_area:payload.area||"",
      p_details:{
        date:payload.date||"",
        time:payload.time||"",
        venue:payload.venue||"",
        price:payload.price||""
      },
      p_tags:payload.tags||[]
    });
    if(error){setMessage("イベントを登録できませんでした。");return false;}
    await loadSubmissions(token);
    setMessage("イベントを登録しました。運営確認後に公開されます。");
    return Boolean(data?.ok);
  }

  async function toggleAction(entryId,action){
    if(!entryId) return;
    const enabled=!actions.some(a=>a.entry_id===entryId&&a.action===action);
    const {error}=await supabase.rpc("toggle_member_action",{
      p_session:token,p_entry:entryId,p_action:action,p_enabled:enabled
    });
    if(!error) await loadActions(token);
  }

  async function enter(){
    if(!invite.trim()) return;
    setBusy(true); setMessage("");
    const {data,error}=await supabase.rpc("enter_with_invite",{p_token:invite.trim().toLowerCase()});
    if(error||!data?.session_token){setMessage("招待コードが違うか、すでに使用されています。");setBusy(false);return;}
    localStorage.setItem("saikai_awaits_session",data.session_token);
    setToken(data.session_token);
    await Promise.all([loadEntries(data.session_token),loadProfile(data.session_token),loadDirectory(data.session_token),loadSubmissions(data.session_token),loadActions(data.session_token)]);
    setBusy(false);
  }

  function logout(){
    localStorage.removeItem("saikai_awaits_session");
    setToken(""); setEntries([]); setProfile(null); setDirectory([]); setSubmissions([]); setActions([]); setInvite(""); setTab("home"); setDetail(null); setMessage("");
  }

  const byKind=useMemo(()=>({
    event:entries.filter(x=>x.kind==="event"),
    news:entries.filter(x=>x.kind==="news"),
    work:entries.filter(x=>x.kind==="work"),
    community:entries.filter(x=>x.kind==="community"),
    challenge:entries.filter(x=>x.kind==="challenge")
  }),[entries]);

  if(!token){
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
        <input value={invite} onChange={e=>setInvite(e.target.value)} onKeyDown={e=>e.key==="Enter"&&enter()} placeholder="awaits001" autoFocus/>
        <button onClick={enter} disabled={busy||!invite.trim()}>{busy?"確認中…":"SAIKAI AWAITS に入る"}</button>
        {message&&<div className="gateMessage">{message}</div>}
      </section>
    </main>;
  }

  if(profile && !profile.name){
    return <main className="appStage"><section className="app"><ProfileOnboarding saveProfile={saveProfile}/></section></main>;
  }

  return <main className="appStage">
    <section className="app">
      {detail ? <DetailView detail={detail} onBack={()=>setDetail(null)} byKind={byKind} actions={actions} toggleAction={toggleAction}/> : <>
      {tab==="home"&&<Home byKind={byKind} setTab={setTab} openDetail={setDetail}/>}
      {tab==="people"&&<People openDetail={setDetail} directory={directory}/>}
      {tab==="community"&&<Community items={byKind.community} openDetail={setDetail}/>}
      {tab==="discover"&&<Discover byKind={byKind} openDetail={setDetail}/>}
      {tab==="me"&&<Me logout={logout} profile={profile} actions={actions} entries={entries} submissions={submissions} submitEvent={submitEvent} message={message}/>}
      </>}
      {!detail && <nav className="bottomNav">
        {navItems.map(([id,label,icon])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>
          <span className="navIcon">{icon}</span><span>{label}</span>
        </button>)}
      </nav>}
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

function Home({byKind,setTab,openDetail}){
  const event=byKind.event[0];
  const community=byKind.community[0]||{title:"西海フィッシングCLUB",summary:"西海の海で釣りを楽しむコミュニティです。初心者も大歓迎！",details:{members:148}};
  const work=byKind.work[0]||{title:"動画編集できる人募集",summary:"西海の魅力を伝えるショート動画の編集をお願いします！",details:{reward:"30,000円"}};
  const news=byKind.news.length?byKind.news:[
    {id:"n1",title:"大瀬戸の海が今週も最高です！",summary:"透明度の高い青い海に、たくさんの観光客が訪れていました。",area:"まちの話題"},
    {id:"n2",title:"西海みかんの収穫が始まりました",summary:"今年も甘くておいしいみかんが実っています！",area:"地域の暮らし"}
  ];

  return <div className="home">
    <header className="masthead">
      <div className="mastheadTop"><Logo/><div className="headActions"><span className="bell">♧<b></b></span><span className="roundPhoto"></span></div></div>
      <div className="greeting">
        <div><h1>こんにちは、宮里さん <span>☀</span></h1><p>今日も、すてきな西海の一日を</p></div>
        <div className="weather"><div className="weatherSun">☀</div><div><b>西海市</b><strong>24°C</strong><small>晴れのちくもり</small></div></div>
      </div>
    </header>

    <section className="content">
      <div className="sectionHead"><div><h2>今日の西海</h2><span></span></div><button onClick={()=>setTab("discover")}>すべて見る 〉</button></div>

      <article className="eventHero clickable" onClick={()=>openDetail({kind:"event",item:event||{title:"大島BBQ交流会",summary:"海を見ながら、食べて、話して、西海の仲間とつながろう！",area:"大島",details:{date:"6月15日 (日)",time:"11:00 - 15:00",venue:"海の家あおぞら",price:"2,000円"}}})}>
        <div className="eventShade"></div>
        <div className="eventContent">
          <span className="orangeBadge">注目のイベント</span>
          <h3>{cleanTitle(event?.title||"大島BBQ交流会")}</h3>
          <p>{event?.summary||"海を見ながら、食べて、話して、西海の仲間とつながろう！"}</p>
          <div className="eventMeta"><span>▣　{event?.details?.date||"6月15日 (日)"} 11:00 - 15:00</span><span>●　{event?.area||"大島"} 海の家あおぞら</span><span>♟　12 / 20人　参加予定</span></div>
        </div>
        <button className="joinBtn" onClick={e=>e.stopPropagation()}>参加する　→</button>
        <div className="dots"><b></b><i></i><i></i><i></i></div>
      </article>

      <div className="sectionHead recommendationsHead"><div><h2>あなたへのおすすめ</h2><span></span></div><button onClick={()=>setTab("discover")}>すべて見る 〉</button></div>

      <div className="recommendGrid">
        <article className="recommendCard clickable" onClick={()=>openDetail({kind:"person",item:people[0]})}>
          <div className="personTop"><img src={people[0].photo} alt=""/><span className="addPerson">♙+</span></div>
          <div className="greenKicker">♣ 気の合いそうな人</div>
          <h3>山田 花子<small>さん</small></h3>
          <div className="tags">{people[0].tags.map(t=><span key={t}>{t}</span>)}</div>
          <p>{people[0].bio}</p>
        </article>

        <article className="recommendCard clickable" onClick={()=>openDetail({kind:"community",item:community})}>
          <img className="cardImage" src="https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=700&q=80" alt=""/>
          <div className="greenKicker">▣ おすすめのコミュニティ</div>
          <h3>{cleanTitle(community.title)}</h3>
          <div className="miniMeta">♟ メンバー {community.details?.members||148}人</div>
          <p>{community.summary}</p>
          <button className="softBlue" onClick={e=>e.stopPropagation()}>参加する</button>
        </article>

        <article className="recommendCard">
          <img className="cardImage" src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=700&q=80" alt=""/>
          <div className="orangeKicker">▣ おすすめの仕事・募集</div>
          <h3>{cleanTitle(work.title)}</h3>
          <div className="miniMeta">▥ 西海市観光協会</div>
          <div className="price">¥ {work.details?.reward||"30,000円"}</div>
          <p>{work.summary}</p>
          <button className="softOrange" onClick={e=>e.stopPropagation()}>詳細を見る</button>
        </article>
      </div>

      <div className="sectionHead newsHead"><div><h2>西海でいま起きていること</h2><span></span></div><button onClick={()=>setTab("discover")}>すべて見る 〉</button></div>
      <div className="newsList">
        {news.slice(0,2).map((n,i)=><article className="newsRow clickable" key={n.id||n.title} onClick={()=>openDetail({kind:"news",item:n})}>
          <img src={i===0?"https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=480&q=80":"https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?auto=format&fit=crop&w=480&q=80"} alt=""/>
          <div className="newsBody"><div className={i===0?"blueLabel":"orangeLabel"}>{i===0?"まちの話題":"地域の暮らし"}</div><h3>{cleanTitle(n.title)}</h3><p>{n.summary}</p></div>
          <div className="newsAside"><small>{i===0?"2時間前":"5時間前"}</small><span>♥ {i===0?28:42}　○ {i===0?5:3}</span></div>
        </article>)}
      </div>
    </section>
  </div>;
}

function People({openDetail,directory}){
  const [q,setQ]=useState("");
  const live=(directory||[]).map((x,i)=>({
    id:x.id,
    name:x.name,
    area:x.area,
    role:x.organization||"SAIKAI AWAITS メンバー",
    bio:x.bio||"",
    tags:[...(x.tags||[]),...(x.skills||[])].slice(0,6),
    photo:x.avatar_url||people[i%people.length]?.photo
  }));
  const base=live.length?live:people;
  const list=base.filter(x=>JSON.stringify(x).toLowerCase().includes(q.toLowerCase()));
  return <PageShell kicker="PEOPLE" title="つながる" lead="西海の人を、得意なことや興味から見つける。">
    <input className="searchInput" value={q} onChange={e=>setQ(e.target.value)} placeholder="人・得意なこと・興味で検索"/>
    <div className="listCards">{list.map(p=><article className="personRow clickable" key={p.name} onClick={()=>openDetail({kind:"person",item:p})}><img src={p.photo} alt=""/><div><h3>{p.name}</h3><small>{p.area} · {p.role}</small><p>{p.bio}</p><div className="tags">{p.tags.map(t=><span key={t}>{t}</span>)}</div></div><button onClick={e=>e.stopPropagation()}>つながる</button></article>)}</div>
  </PageShell>;
}

function Community({items,openDetail}){
  const data=items.length?items:[
    {title:"西海フィッシングCLUB",summary:"西海の海で釣りを楽しむコミュニティ。",details:{members:148},area:"西海市"},
    {title:"AI CLUB SAIKAI",summary:"AIを仕事や暮らしで使ってみたい人の集まり。",details:{members:23},area:"西海市"},
    {title:"子育てCLUB",summary:"子育て中の人同士で、地域情報を共有。",details:{members:31},area:"西海市"}
  ];
  return <PageShell kicker="COMMUNITY" title="コミュニティ" lead="好きなことから、つながる。">
    <div className="communityCards">{data.map((x,i)=><article className="clickable" key={x.id||x.title} onClick={()=>openDetail({kind:"community",item:x})}><div className={"commCover c"+(i+1)}></div><div><h3>{cleanTitle(x.title)}</h3><p>{x.summary}</p><small>♟ メンバー {x.details?.members||20}人 · {x.area}</small></div></article>)}</div>
  </PageShell>;
}

function Discover({byKind,openDetail}){
  const groups=[["イベント",byKind.event],["GOOD NEWS",byKind.news],["仕事・募集",byKind.work],["チャレンジ",byKind.challenge]];
  return <PageShell kicker="DISCOVER" title="みつける" lead="イベント、仕事、いい話、誰かのチャレンジ。">
    {groups.map(([label,items])=><section className="discoverGroup" key={label}><h2>{label}</h2>{items.map(x=><article className="clickable" key={x.id} onClick={()=>openDetail({kind:x.kind||({イベント:"event","GOOD NEWS":"news","仕事・募集":"work","チャレンジ":"challenge"}[label]),item:x})}><b>{cleanTitle(x.title)}</b><p>{x.summary}</p><small>{x.area}</small></article>)}</section>)}
  </PageShell>;
}

function Me({logout,profile,actions,entries,submissions,submitEvent,message}){
  const actionItems=actions.map(a=>({action:a.action,item:entries.find(e=>e.id===a.entry_id)})).filter(x=>x.item);
  const [showEventForm,setShowEventForm]=useState(false);
  return <PageShell kicker="MY PAGE" title="マイページ" lead="あなたの西海でのつながりと活動">
    <div className="profileCard"><div className="profileCircle">{(profile?.name||"M").slice(0,1)}</div><h3>{profile?.name||"メンバー"}</h3><p>{profile?.area||"西海市"}{profile?.organization?" · "+profile.organization:""}</p><div className="tags profileTags">{[...(profile?.tags||[]),...(profile?.skills||[])].slice(0,6).map(t=><span key={t}>{t}</span>)}</div></div>
    <section className="quickActions"><button onClick={()=>setShowEventForm(!showEventForm)}>＋ イベントを登録</button></section>
    {showEventForm&&<EventSubmissionForm submitEvent={submitEvent} onDone={()=>setShowEventForm(false)}/>}
    {message&&<div className="inlineMessage">{message}</div>}
    <section className="myActivity"><h2>自分の登録</h2>{submissions?.length?submissions.map(x=><div className="mySubmissionRow" key={x.id}><div><b>{cleanTitle(x.title)}</b><small>{x.area||"西海市"}</small></div><span>{x.status==="draft"?"確認待ち":x.status}</span></div>):<p>まだ登録はありません。</p>}</section>
    <section className="myActivity"><h2>参加・保存・興味あり</h2>{actionItems.length?actionItems.map(x=><div className="myActionRow" key={x.action+x.item.id}><span>{({going:"参加予定",interested:"興味あり",joined:"参加中",saved:"保存",work_interest:"仕事に興味",challenge_interest:"チャレンジに興味"})[x.action]||x.action}</span><b>{cleanTitle(x.item.title)}</b></div>):<p>まだありません。気になるイベントや活動を保存してみてください。</p>}</section>
    <button className="logout" onClick={logout}>ログアウト</button>
  </PageShell>;
}




function EventSubmissionForm({submitEvent,onDone}){
  const [form,setForm]=useState({title:"",summary:"",area:"",date:"",time:"",venue:"",price:"",tags:""});
  const [saving,setSaving]=useState(false);
  async function submit(e){
    e.preventDefault(); setSaving(true);
    const ok=await submitEvent({...form,tags:form.tags.split(",").map(x=>x.trim()).filter(Boolean)});
    setSaving(false);
    if(ok) onDone();
  }
  return <form className="entryForm" onSubmit={submit}>
    <div className="formTitle"><b>イベント登録</b><button type="button" onClick={onDone}>×</button></div>
    <label>イベント名<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
    <label>概要<textarea required rows="3" value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})}/></label>
    <div className="formTwo"><label>エリア<input value={form.area} onChange={e=>setForm({...form,area:e.target.value})} placeholder="大島町"/></label><label>日付<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label></div>
    <div className="formTwo"><label>時間<input value={form.time} onChange={e=>setForm({...form,time:e.target.value})} placeholder="11:00 - 15:00"/></label><label>場所<input value={form.venue} onChange={e=>setForm({...form,venue:e.target.value})}/></label></div>
    <label>参加費<input value={form.price} onChange={e=>setForm({...form,price:e.target.value})} placeholder="無料 / 2,000円"/></label>
    <label>タグ（カンマ区切り）<input value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} placeholder="交流, 子育て, 釣り"/></label>
    <button className="primaryCta fullCta" disabled={saving}>{saving?"登録中…":"確認依頼を送る"}</button>
  </form>;
}

function ProfileOnboarding({saveProfile}){
  const [form,setForm]=useState({name:"",area:"",organization:"",bio:"",tags:"",skills:""});
  const [saving,setSaving]=useState(false);
  async function submit(e){
    e.preventDefault(); setSaving(true);
    await saveProfile({
      name:form.name,area:form.area,organization:form.organization,bio:form.bio,
      tags:form.tags.split(",").map(x=>x.trim()).filter(Boolean),
      skills:form.skills.split(",").map(x=>x.trim()).filter(Boolean)
    });
    setSaving(false);
  }
  return <div className="onboarding"><header><Logo/></header><section><div className="pageKicker">WELCOME TO SAIKAI</div><h1>あなたのことを、少しだけ。</h1><p>西海で「誰とつながれるか」が分かるプロフィールをつくります。</p><form onSubmit={submit}>
    <label>名前<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label>西海との関係<select required value={form.area} onChange={e=>setForm({...form,area:e.target.value})}><option value="">選択してください</option><option>西彼町</option><option>西海町</option><option>大島町</option><option>崎戸町</option><option>大瀬戸町</option><option>市外・西海に関わる</option></select></label>
    <label>所属<input value={form.organization} onChange={e=>setForm({...form,organization:e.target.value})}/></label>
    <label>自己紹介<textarea rows="4" value={form.bio} onChange={e=>setForm({...form,bio:e.target.value})}/></label>
    <label>興味（カンマ区切り）<input value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} placeholder="釣り, AI, 子育て"/></label>
    <label>できること（カンマ区切り）<input value={form.skills} onChange={e=>setForm({...form,skills:e.target.value})} placeholder="動画編集, 営業, デザイン"/></label>
    <button disabled={saving}>{saving?"保存中…":"SAIKAI AWAITS をはじめる"}</button>
  </form></section></div>;
}

function DetailView({detail,onBack,byKind,actions,toggleAction}){
  const {kind,item}=detail;
  const title=cleanTitle(item?.title||item?.name||"");
  const images={
    event:"https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?auto=format&fit=crop&w=1100&q=88",
    community:"https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=1100&q=88",
    work:"https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1100&q=88",
    news:"https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1100&q=88",
    challenge:"https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1100&q=88"
  };

  if(kind==="person"){
    return <div className="detailPage">
      <DetailHeader onBack={onBack}/>
      <section className="personDetailHero">
        <img src={item.photo} alt=""/>
        <h1>{item.name}</h1>
        <p>{item.area} · {item.role}</p>
        <div className="tags detailTags">{(item.tags||[]).map(t=><span key={t}>{t}</span>)}</div>
        <button className="primaryCta">つながる</button>
      </section>
      <section className="detailBody">
        <DetailBlock title="この人について"><p>{item.bio}</p></DetailBlock>
        <DetailBlock title="興味・できること"><div className="detailChips">{(item.tags||[]).map(t=><span key={t}>{t}</span>)}</div></DetailBlock>
        <DetailBlock title="参加しているコミュニティ">
          <RelatedRows items={(byKind.community||[]).slice(0,2)} empty="西海フィッシングCLUB / AI CLUB SAIKAI"/>
        </DetailBlock>
        <DetailBlock title="最近の関わり">
          <RelatedRows items={(byKind.event||[]).slice(0,2)} empty="地域イベントやプロジェクトへの参加履歴がここに表示されます。"/>
        </DetailBlock>
      </section>
    </div>;
  }

  const label={event:"EVENT",community:"COMMUNITY",work:"WORK",news:"GOOD NEWS",challenge:"CHALLENGE"}[kind]||"DETAIL";
  return <div className="detailPage">
    <DetailHeader onBack={onBack}/>
    <div className="detailHeroImage" style={{backgroundImage:`linear-gradient(180deg,rgba(5,29,48,.05),rgba(5,29,48,.58)),url("${images[kind]}")`}}>
      <span className="detailLabel">{label}</span>
      <h1>{title}</h1>
      <p>{item?.summary}</p>
    </div>
    <section className="detailBody">
      {kind==="event" && <>
        <div className="factGrid">
          <Fact label="日時" value={item?.details?.date ? `${item.details.date} ${item.details.time||""}` : "6月15日（日）11:00 - 15:00"}/>
          <Fact label="場所" value={item?.details?.venue||item?.area||"西海市"}/>
          <Fact label="参加費" value={item?.details?.price||"2,000円"}/>
          <Fact label="参加予定" value="12 / 20人"/>
        </div>
        <DetailBlock title="イベントについて"><p>{item?.body||item?.summary||"西海の仲間と気軽につながれるイベントです。"}</p></DetailBlock>
        <DetailBlock title="主催"><div className="organizerRow"><div className="organizerAvatar">S</div><div><b>SAIKAI AWAITS</b><small>西海市</small></div></div></DetailBlock>
        <div className="dualCta"><button className="secondaryCta" onClick={()=>toggleAction(item?.id,"interested")}>{actions.some(a=>a.entry_id===item?.id&&a.action==="interested")?"興味あり ✓":"興味あり"}</button><button className="primaryCta" onClick={()=>toggleAction(item?.id,"going")}>{actions.some(a=>a.entry_id===item?.id&&a.action==="going")?"参加予定 ✓":"参加する"}</button></div>
      </>}

      {kind==="community" && <>
        <div className="factGrid two">
          <Fact label="メンバー" value={`${item?.details?.members||148}人`}/>
          <Fact label="エリア" value={item?.area||"西海市"}/>
        </div>
        <DetailBlock title="コミュニティについて"><p>{item?.summary}</p></DetailBlock>
        <DetailBlock title="最近のイベント"><RelatedRows items={(byKind.event||[]).slice(0,2)} empty="交流会や活動予定がここに表示されます。"/></DetailBlock>
        <button className="primaryCta fullCta" onClick={()=>toggleAction(item?.id,"joined")}>{actions.some(a=>a.entry_id===item?.id&&a.action==="joined")?"参加中 ✓":"このコミュニティに参加"}</button>
      </>}

      {kind==="work" && <>
        <div className="salaryBox"><small>報酬</small><strong>{item?.details?.reward||"30,000円"}</strong></div>
        <div className="factGrid two">
          <Fact label="場所" value={item?.area||"西海市"}/>
          <Fact label="形態" value={item?.details?.type||"単発・副業"}/>
        </div>
        <DetailBlock title="募集内容"><p>{item?.body||item?.summary}</p></DetailBlock>
        <DetailBlock title="こんな人を探しています"><div className="detailChips">{(item?.tags||["動画編集","SNS","地域"]).map(t=><span key={t}>{t}</span>)}</div></DetailBlock>
        <div className="dualCta"><button className="secondaryCta" onClick={()=>toggleAction(item?.id,"saved")}>{actions.some(a=>a.entry_id===item?.id&&a.action==="saved")?"保存済み ✓":"保存"}</button><button className="primaryCta" onClick={()=>toggleAction(item?.id,"work_interest")}>{actions.some(a=>a.entry_id===item?.id&&a.action==="work_interest")?"興味あり ✓":"担当者につながる"}</button></div>
      </>}

      {kind==="news" && <>
        <DetailBlock title="西海のGOOD NEWS"><p>{item?.body||item?.summary}</p></DetailBlock>
        <DetailBlock title="関連する人・場所"><div className="detailChips"><span>{item?.area||"西海市"}</span><span>地域の話題</span></div></DetailBlock>
        <button className="secondaryCta fullCta">元の記事を見る</button>
      </>}

      {kind==="challenge" && <>
        <DetailBlock title="やりたいこと"><p>{item?.body||item?.summary}</p></DetailBlock>
        <DetailBlock title="こんな仲間を探しています"><div className="detailChips">{(item?.tags||["一緒に企画する人","地域の仲間"]).map(t=><span key={t}>{t}</span>)}</div></DetailBlock>
        <DetailBlock title="発起人"><div className="organizerRow"><div className="organizerAvatar">M</div><div><b>SAIKAI AWAITS メンバー</b><small>{item?.area||"西海市"}</small></div></div></DetailBlock>
        <button className="primaryCta fullCta" onClick={()=>toggleAction(item?.id,"challenge_interest")}>{actions.some(a=>a.entry_id===item?.id&&a.action==="challenge_interest")?"興味あり ✓":"興味あり"}</button>
      </>}
    </section>
  </div>;
}

function DetailHeader({onBack}){
  return <header className="detailHeader"><button onClick={onBack}>‹</button><Logo/><span></span></header>;
}

function DetailBlock({title,children}){
  return <section className="detailBlock"><h2>{title}</h2>{children}</section>;
}

function Fact({label,value}){
  return <div className="fact"><small>{label}</small><b>{value}</b></div>;
}

function RelatedRows({items,empty}){
  if(!items?.length) return <p>{empty}</p>;
  return <div className="relatedRows">{items.map(x=><div key={x.id||x.title}><b>{cleanTitle(x.title)}</b><small>{x.area}</small></div>)}</div>;
}

function PageShell({kicker,title,lead,children}){
  return <div className="page"><header className="simpleHeader"><Logo/></header><section><div className="pageKicker">{kicker}</div><h1>{title}</h1><p className="pageLead">{lead}</p>{children}</section></div>;
}
