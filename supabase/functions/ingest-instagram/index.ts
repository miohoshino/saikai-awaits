import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Imports recent posts of the connected Instagram professional account (Instagram API with Instagram Login)
// into public.entries as AWAITS news. Images are copied to the "entry-images" bucket because
// Instagram CDN URLs expire.
//
// Secrets: INGEST_SECRET (x-ingest-key header), INSTAGRAM_ACCESS_TOKEN (initial long-lived token).
// The token is refreshed automatically and the latest one is kept in public.integration_tokens.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_SECRET = Deno.env.get("INGEST_SECRET") || "";
const INITIAL_TOKEN = Deno.env.get("INSTAGRAM_ACCESS_TOKEN") || "";
const GRAPH = "https://graph.instagram.com";
const BUCKET = "entry-images";
const REFRESH_AFTER_DAYS = 7;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Media = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  children?: { data: { media_type: string; media_url?: string; thumbnail_url?: string }[] };
};

async function getToken(): Promise<string> {
  const { data } = await supabase.from("integration_tokens").select("*").eq("provider", "instagram").maybeSingle();
  let token = data?.access_token || INITIAL_TOKEN;
  if (!token) throw new Error("INSTAGRAM_ACCESS_TOKEN is not set");

  const age = data ? (Date.now() - new Date(data.refreshed_at).getTime()) / 86400000 : Infinity;
  if (age > REFRESH_AFTER_DAYS) {
    const res = await fetch(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
    if (res.ok) {
      const j = await res.json();
      token = j.access_token;
      await supabase.from("integration_tokens").upsert({
        provider: "instagram",
        access_token: token,
        expires_at: j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : null,
        refreshed_at: new Date().toISOString()
      });
    } else if (!data) {
      // Token not refreshable yet (e.g. issued <24h ago): store it so the next run tries again later.
      await supabase.from("integration_tokens").upsert({ provider: "instagram", access_token: token, refreshed_at: new Date(0).toISOString() });
    }
  }
  return token;
}

function imageUrlOf(m: Media) {
  if (m.media_type === "VIDEO") return m.thumbnail_url;
  if (m.media_type === "CAROUSEL_ALBUM") {
    const first = m.children?.data?.[0];
    return first ? (first.media_type === "VIDEO" ? first.thumbnail_url : first.media_url) : m.media_url;
  }
  return m.media_url;
}

function parseCaption(caption = "") {
  const hashtags = [...caption.matchAll(/#([^\s#＃]+)/g)].map((x) => x[1]);
  const text = caption.replace(/[#＃][^\s#＃]+/g, "").replace(/[ \t]+\n/g, "\n").trim();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let title = (lines[0] || "").replace(/^[【\[]|[】\]]$/g, "").slice(0, 80);
  if (title.length < 3) title = "Varygoodの新しい投稿";
  const summary = lines.slice(lines.length > 1 ? 1 : 0).join(" ").slice(0, 160);
  return { title, summary, body: text.slice(0, 5000), hashtags };
}

async function copyImage(mediaId: string, url?: string) {
  if (!url) return "";
  const res = await fetch(url);
  if (!res.ok) return "";
  const type = res.headers.get("content-type") || "image/jpeg";
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  const path = `instagram/${mediaId}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, await res.arrayBuffer(), { contentType: type, upsert: true });
  if (error) return "";
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

Deno.serve(async (req: Request) => {
  const supplied = req.headers.get("x-ingest-key") || "";
  if (!INGEST_SECRET || supplied !== INGEST_SECRET) return new Response("forbidden", { status: 403 });

  const { data: sources, error } = await supabase.from("sources").select("id,name,url,auto_publish")
    .eq("connector", "instagram").eq("status", "approved");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!sources?.length) return Response.json({ ok: true, message: "no instagram source" });

  let token: string;
  try { token = await getToken(); } catch (e) { return Response.json({ error: String(e) }, { status: 500 }); }

  const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}";
  const res = await fetch(`${GRAPH}/me/media?fields=${encodeURIComponent(fields)}&limit=25&access_token=${encodeURIComponent(token)}`);
  if (!res.ok) return Response.json({ error: "instagram_api", status: res.status, detail: await res.text() }, { status: 502 });
  const media: Media[] = (await res.json()).data || [];

  // One Instagram account is connected per token; attach its posts to the first Instagram source.
  const source = sources[0];
  let inserted = 0, skipped = 0, failed = 0;

  for (const m of media) {
    const { data: existing } = await supabase.from("source_items").select("id").eq("source_id", source.id).eq("external_key", m.id).maybeSingle();
    if (existing) { skipped++; continue; }

    const { title, summary, body, hashtags } = parseCaption(m.caption);
    const imageUrl = await copyImage(m.id, imageUrlOf(m));
    const { data: entry, error: entryError } = await supabase.from("entries").insert({
      kind: "news",
      status: source.auto_publish ? "published" : "pending",
      origin: "ingest",
      title,
      summary,
      body,
      area: "西海市",
      tags: ["Varygood", ...hashtags].slice(0, 8),
      image_url: imageUrl,
      source_name: source.name,
      source_url: m.permalink,
      published_at: source.auto_publish ? m.timestamp : null,
      details: { instagram_id: m.id, media_type: m.media_type, posted_at: m.timestamp }
    }).select("id").single();
    if (entryError) { failed++; continue; }

    await supabase.from("source_items").insert({
      source_id: source.id,
      external_key: m.id,
      original_url: m.permalink,
      original_title: title,
      raw_excerpt: (m.caption || "").slice(0, 1000),
      classification: { connector: "instagram", auto_publish: source.auto_publish },
      entry_id: entry.id
    });
    inserted++;
  }

  await supabase.from("sources").update({ last_run_at: new Date().toISOString() }).eq("id", source.id);
  return Response.json({ ok: true, fetched: media.length, inserted, skipped, failed });
});
