-- Development seed data. Do NOT apply to production.

insert into public.invites (code, role, max_uses, note) values
  ('dev-admin', 'admin', 3, '開発用 管理者'),
  ('dev-member', 'member', 50, '開発用 一般会員')
on conflict do nothing;

insert into public.entries (kind, status, origin, title, summary, body, area, tags, details) values
  ('event', 'published', 'admin', '大島BBQ交流会',
   '海を見ながら、食べて、話して、西海の仲間とつながろう！',
   '初めての方も大歓迎。食材はこちらで用意します。飲み物だけお持ちください。',
   '大島町', array['交流','BBQ','海'],
   '{"date":"2026-10-18","time":"11:00 - 15:00","venue":"海の家あおぞら","price":"2,000円","capacity":20}'),
  ('event', 'published', 'admin', '西海みかん収穫体験',
   '旬のみかんを自分の手で収穫。親子での参加もおすすめです。',
   '', '西海町', array['子育て','農業','体験'],
   '{"date":"2026-11-08","time":"10:00 - 12:00","venue":"西海町みかん園","price":"1,000円","capacity":30}'),
  ('community', 'published', 'admin', '西海フィッシングCLUB',
   '西海の海で釣りを楽しむコミュニティです。初心者も大歓迎！', '', '西海市', array['釣り','海'], '{}'),
  ('community', 'published', 'admin', 'AI CLUB SAIKAI',
   'AIを仕事や暮らしで使ってみたい人の集まり。', '', '西海市', array['AI','学び'], '{}'),
  ('work', 'published', 'admin', '動画編集できる人募集',
   '西海の魅力を伝えるショート動画の編集をお願いします！', '', '西海市', array['動画編集','SNS'],
   '{"reward":"30,000円","type":"単発・副業","organization":"西海市観光協会"}'),
  ('news', 'published', 'admin', '西海みかんの収穫が始まりました',
   '今年も甘くておいしいみかんが実っています！', '', '西海町', array['農業'], '{}'),
  ('challenge', 'published', 'admin', '空き家をコワーキングにしたい',
   '大瀬戸の空き家を、みんなが使える仕事場にするプロジェクト。', '', '大瀬戸町', array['空き家','まちづくり'], '{}');

-- Dummy events hosted by each community / challenge (2 each)
insert into public.entries (kind, status, origin, title, summary, body, area, tags, details, community_id)
select 'event', 'published', 'admin', v.title, v.summary, v.body, v.area, v.tags, v.details::jsonb, c.id
from (values
  ('西海フィッシングCLUB', '初心者歓迎！大島港 朝のアジ釣り会',
   '竿の貸し出しあり。釣り方をメンバーが丁寧に教えます。',
   '集合後に簡単なレクチャーをしてから釣り開始。釣った魚はその場でさばき方も教えます。',
   '大島町', array['釣り','初心者歓迎'],
   '{"date":"2026-10-25","time":"6:00 - 9:00","venue":"大島港 東岸壁","price":"500円（エサ代）","capacity":15}'),
  ('西海フィッシングCLUB', '秋の夜釣り＆BBQナイト',
   '夕方から夜釣り、釣れた魚でそのままBBQ。',
   'ライトの準備はクラブで用意します。防寒着をお持ちください。',
   '西海町', array['釣り','BBQ'],
   '{"date":"2026-11-14","time":"16:00 - 21:00","venue":"西海町 横瀬漁港","price":"1,500円","capacity":20}'),
  ('AI CLUB SAIKAI', 'はじめての生成AI もくもく会',
   'ノートPCを持ってきて、AIを触ってみる会。質問し放題。',
   'ChatGPT や Claude などを使って、仕事や暮らしの困りごとを一緒に解決します。',
   '大瀬戸町', array['AI','学び'],
   '{"date":"2026-10-30","time":"19:00 - 21:00","venue":"大瀬戸 コミュニティスペース","price":"無料","capacity":12}'),
  ('AI CLUB SAIKAI', 'AIで作る！地域のチラシ制作ワークショップ',
   '画像生成AIを使って、地元のお店のチラシを作ってみよう。',
   '完成したチラシは実際にお店で使ってもらう予定です。',
   '西彼町', array['AI','デザイン'],
   '{"date":"2026-11-21","time":"13:00 - 16:00","venue":"西彼町 公民館","price":"1,000円","capacity":16}'),
  ('空き家をコワーキングにしたい', '空き家見学ツアー＆アイデア会議',
   '候補の空き家を実際に見て、使い方をみんなで考えます。',
   '見学のあとは近くのカフェでアイデア出し。参加は途中からでもOK。',
   '大瀬戸町', array['空き家','まちづくり'],
   '{"date":"2026-11-07","time":"10:00 - 12:30","venue":"大瀬戸町 雪浦地区","price":"無料","capacity":10}'),
  ('空き家をコワーキングにしたい', 'DIYデー：壁塗りと片付け',
   '汚れてもいい服で集合！みんなで手を動かして場所をつくろう。',
   '道具はこちらで用意します。お昼ごはん付き。',
   '大瀬戸町', array['DIY','まちづくり'],
   '{"date":"2026-12-05","time":"9:30 - 15:00","venue":"大瀬戸町 雪浦地区","price":"無料","capacity":12}')
) as v(community, title, summary, body, area, tags, details)
join public.entries c on c.title = v.community and c.kind in ('community','challenge');

-- Community with an event on the day the seed is applied (for the "今日の活動予定" section)
insert into public.entries (kind, status, origin, title, summary, body, area, tags, details) values
  ('community', 'published', 'admin', '西海ランニング部',
   '海沿いの道をゆるく走るランニングコミュニティ。歩いてもOK！',
   '毎週の夕方ランと、月1回の週末ロングランを開催しています。ペースは人それぞれ。走ったあとのおしゃべりが本番です。',
   '大瀬戸町', array['ランニング','健康'], '{}');

insert into public.entries (kind, status, origin, title, summary, body, area, tags, details, community_id)
select 'event', 'published', 'admin', v.title, v.summary, v.body, '大瀬戸町', v.tags,
       jsonb_build_object('date', to_char(current_date + v.offset_days, 'YYYY-MM-DD'), 'time', v.time,
                          'venue', v.venue, 'price', v.price, 'capacity', v.capacity),
       c.id
from (values
  ('夕焼けラン 5km', '大瀬戸の海沿いを夕焼けを見ながら走ります。',
   '集合後に軽くストレッチしてからスタート。ゆっくりペースで走ります。',
   array['ランニング'], 0, '18:00 - 19:00', '大瀬戸 雪浦海岸 駐車場', '無料', 20),
  ('週末ロングラン 10km＆朝ごはん会', '少し長めに走って、みんなで朝ごはん。',
   '10kmが不安な人は5kmで折り返しOK。朝ごはんは地元のパン屋さんのパンです。',
   array['ランニング','朝活'], 9, '7:00 - 9:30', '大瀬戸 総合運動公園', '500円（朝ごはん代）', 15)
) as v(title, summary, body, tags, offset_days, time, venue, price, capacity)
join public.entries c on c.title = '西海ランニング部' and c.kind = 'community';

-- Dummy Varygood (Instagram) posts shown in AWAITS news until real ingestion is enabled
insert into public.entries (kind, status, origin, title, summary, body, area, tags, image_url, source_name, source_url, published_at, details)
select 'news', 'published', 'ingest', v.title, v.summary, v.body || E'

（ダミーデータ：本取り込み前の表示確認用）', '西海市',
       array['Varygood'] || v.tags, v.image, 'Varygood（Instagram）', 'https://www.instagram.com/varygood_saikai/',
       (v.posted || 'T18:00:00+09:00')::timestamptz, jsonb_build_object('dummy', true, 'media_type', 'CAROUSEL_ALBUM')
from (values
  ('2026-06-03', '西海市内外の魅力が詰まった「SAIKAI MARKET」へ行ってきました！',
   'みかんドームで開催された「SAIKAI MARKET」。市内外から約30店舗が集結しました。',
   E'みかんドームで開催された「SAIKAI MARKET」に行ってきました。
市内外から約30店舗が集まり、思い思いの時間を過ごす人でにぎわっていました。',
   '/images/top-people.jpg', array['西海市','SAIKAIMARKET']),
  ('2026-05-19', '西海市の地底へ— 3,000万年前の海が、洞窟になった',
   '国の天然記念物「七ツ釜鍾乳洞」。3,000万年前の海の底が、いまは洞窟に。',
   E'西海市には、国の天然記念物に指定されている鍾乳洞があります。その名も七ツ釜鍾乳洞。',
   '/images/top-discover.jpg', array['西海市','七ツ釜鍾乳洞']),
  ('2026-03-30', '新西海橋のガラス床は本当に怖い？高さ32mから渦潮をのぞくスリル体験',
   '「ちょっと大げさなんじゃないの？」と思いながら、ガラス床に乗ってみました。',
   E'新西海橋の歩道にあるガラス床。高さ32mから、足元の渦潮をのぞくことができます。',
   '/images/top-news.jpg', array['西海市','新西海橋']),
  ('2026-03-26', '終わる前にぜひ行ってみて！1度は訪れたい池島炭鉱',
   '池島炭鉱の坑内体験ツアーは2027年3月末で終了予定。いまのうちに。',
   E'船で島に渡り、実際の坑道をトロッコで進む貴重な体験。気になっていた人は早めの計画を。',
   '/images/top-me.jpg', array['池島','炭鉱']),
  ('2026-03-25', '西海市の「もうひとつの顔」——かつて東洋一の橋と、日本有数の急潮の迫力',
   '「東洋一」「世界初」「国の重要文化財」。西海橋のすごいところを紹介します。',
   E'「東洋一」「世界初」「国の重要文化財」と、とんでもない肩書きを持つ、すごい場所なんです。',
   '/images/top-home.jpg', array['西海市','西海橋']),
  ('2026-02-02', '西海市で走る楽しさを発見！陸上教室 西海アスリート',
   '陸上の基本動作を中心に、いろいろな道具や動きを取り入れて、楽しみながら体を動かします。',
   E'陸上競技を基礎から楽しく学べる陸上教室「西海アスリート」。',
   '/images/top-community.jpg', array['西海市','陸上教室'])
) as v(posted, title, summary, body, image, tags);
