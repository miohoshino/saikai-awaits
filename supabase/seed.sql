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
