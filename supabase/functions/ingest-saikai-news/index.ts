import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const NEGATIVE=["事故","死亡","火災","災害","避難","詐欺","犯罪","逮捕","中止","休止","廃止","通行止","断水","停電","お詫び","注意","警戒","感染","訃報","不審","被害","意見募集","パブリックコメント"];
const POSITIVE=["開催","募集","オープン","開設","開始","受賞","表彰","協定","完成","紹介","体験","講座","フェア","祭","イベント","交流","観光","子ども","スポーツ","文化","地域","応援","新た","新しい","スタート","プロジェクト","チャレンジ","マッチング"];
const NAV_NOISE=["個人情報","ホームページ","市役所","お問い合わせ","ページの先頭","サイトマップ","よくある質問","組織から探す","アクセス","電話番号","開庁時間","プライバシー","著作権"];
const WORK_WORDS=["職員","医師","事業者","求人","採用","アルバイト","スタッフ","業務委託"];

function stripHtml(s:string){
  return s.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&#039;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g," ").trim();
}
function normalizeHref(base:string,href:string){
  try{const u=new URL(href,base);if(u.hostname!=="www.city.saikai.nagasaki.jp")return null;u.hash="";return u.toString();}catch{return null;}
}
function extractLinks(html:string,base:string){
  const out:{title:string,url:string}[]=[];const seen=new Set<string>();const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
  while((m=re.exec(html))){
    const title=stripHtml(m[2]);const url=normalizeHref(base,m[1]);if(!url||!title||title.length<6||title.length>140)continue;
    if(seen.has(url)||NAV_NOISE.some(k=>title.includes(k)))continue;
    const path=new URL(url).pathname;
    if(path==="/"||path.endsWith("/index.html")&&/^(お知らせ|イベント|募集|新着情報)$/.test(title))continue;
    seen.add(url);out.push({title,url});
  }
  return out.slice(0,80);
}
function ruleClassify(title:string,sourceUrl:string){
  if(NEGATIVE.some(k=>title.includes(k))||NAV_NOISE.some(k=>title.includes(k)))return {accept:false,kind:"news",score:.05};
  const positive=POSITIVE.filter(k=>title.includes(k)).length;
  if(positive===0)return {accept:false,kind:"news",score:.3};
  if(WORK_WORDS.some(k=>title.includes(k)))return {accept:true,kind:"work",score:.82};
  if(sourceUrl.includes("/event/"))return {accept:true,kind:"event",score:Math.min(.94,.78+positive*.05)};
  return {accept:true,kind:"news",score:Math.min(.94,.68+positive*.07)};
}
async function aiClassify(title:string,excerpt:string,sourceUrl:string){
  const key=Deno.env.get("OPENAI_API_KEY");if(!key)return null;
  try{
    const model=Deno.env.get("OPENAI_MODEL")||"gpt-5-mini";
    const prompt=`Classify public local information for a positive-only civic app in Saikai City, Japan.
Return ONLY JSON: {"accept":boolean,"kind":"news"|"event"|"work","score":0-1,"summary":"<=100 Japanese chars","warnings":[]}.
Reject accidents, disasters, crime, outrage, political disputes, controversy, closures, cancellations, warnings, alerts and generic navigation pages.
Prefer community events, awards, openings, culture, tourism, education, constructive projects and opportunities.
Title: ${title}
Excerpt: ${excerpt}
Source: ${sourceUrl}`;
    const res=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,input:prompt})});
    if(!res.ok)return null;const j=await res.json();const text=j.output_text||j.output?.flatMap((o:any)=>o.content||[]).map((c:any)=>c.text||"").join("")||"";const match=text.match(/\{[\s\S]*\}/);return match?JSON.parse(match[0]):null;
  }catch{return null;}
}

Deno.serve(async(req:Request)=>{
  const supplied=req.headers.get("x-ingest-key")||"";const {data:ok}=await supabase.rpc("check_ingest_secret",{p_secret:supplied});if(!ok)return new Response("forbidden",{status:403});
  const {data:sources,error}=await supabase.from("sources").select("id,name,url,connector,status").eq("status","approved").eq("connector","web");if(error)return Response.json({error:error.message},{status:500});
  let discovered=0,inserted=0,queued=0,skipped=0;
  for(const source of sources||[]){
    try{
      const indexRes=await fetch(source.url,{headers:{"user-agent":"SAIKAI-AWAITS/1.1 (+community information collector)"}});if(!indexRes.ok)continue;
      const links=extractLinks(await indexRes.text(),source.url);discovered+=links.length;
      for(const link of links){
        const {data:existing}=await supabase.from("source_items").select("id").eq("source_id",source.id).eq("external_key",link.url).maybeSingle();if(existing){skipped++;continue;}
        let excerpt="";try{const ar=await fetch(link.url,{headers:{"user-agent":"SAIKAI-AWAITS/1.1"}});if(ar.ok)excerpt=stripHtml(await ar.text()).slice(0,1400);}catch{}
        const rule=ruleClassify(link.title,source.url);const ai=await aiClassify(link.title,excerpt,source.url);const c=ai||rule;
        const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(link.title+"|"+link.url));const contentHash=Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
        const {data:item,error:itemError}=await supabase.from("source_items").insert({source_id:source.id,external_key:link.url,content_hash:contentHash,original_url:link.url,original_title:link.title,raw_excerpt:excerpt.slice(0,1000)}).select("id").single();if(itemError)continue;inserted++;
        if(c.accept){
          const warnings:string[]=Array.isArray(ai?.warnings)?ai.warnings:[];if(!ai)warnings.push("rule_fallback_no_ai_key");
          const summary=(ai?.summary||excerpt.slice(0,120)||link.title).trim();
          const candidate={kind:c.kind||"news",title:link.title,summary,body:excerpt.slice(0,3000),area:"西海市",tags:["西海市","公式情報"],source_name:source.name,source_url:link.url,classifier:ai?"ai":"rules",score:Number(c.score||0)};
          const {error:reviewError}=await supabase.from("reviews").insert({source_item_id:item.id,status:"pending",candidate,warnings});if(!reviewError)queued++;
        }
      }
      await supabase.from("sources").update({last_run_at:new Date().toISOString()}).eq("id",source.id);
    }catch{}
  }
  return Response.json({ok:true,discovered,inserted,queued,skipped});
});