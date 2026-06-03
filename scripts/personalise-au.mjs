#!/usr/bin/env node
// Personalise AU listing editorial that the bulk generator left templated.
// Rewrites — per listing, grounded in real suburb facts + the row's own
// attributes — the fields users notice as repetitive:
//   🏷️ Tagline, 💬 NAC Note, ✅ Pros, ⚠️ Cons, ✨ Features,
//   🌍 Market, ✦ Brand Intro, 📝 Desc  (all bilingual VI/EN)
// Leaves Process (genuinely identical FIRB flow) and Cine titles (smart-generic)
// alone, and never touches financials/taxonomy/images.
//
// Source of truth = a SUBURB_PROFILES map of verifiable local knowledge
// (transport, drawcards, tenant markets, precinct character). No invented
// developer names or hard prices; prices stay labelled NAC estimates. Where a
// render/brochure detail is well-evidenced it's added as an amenity line.
//
// Writes via the raw Notion API exactly like generate-au-listings.mjs, so the
// JSON fields store as clean JSON (correct end-to-end rendering).
//
// Env: NOTION_TOKEN (required), NOTION_DATABASE_ID, DRY_RUN=true (log only),
//      SAMPLE_SLUGS="a,b,c" (restrict to these slugs; empty = all AU Live).

import { Client } from '@notionhq/client';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB = process.env.NOTION_DATABASE_ID || '35848ec25e86803283acc7ad989649c9';
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');
const SAMPLE = (process.env.SAMPLE_SLUGS || '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);

if (!NOTION_TOKEN) { console.error('NOTION_TOKEN env var is required'); process.exit(1); }
const notion = new Client({ auth: NOTION_TOKEN });

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const typeWord = { Condo: ['apartment', 'căn hộ'], Townhouse: ['townhouse', 'nhà phố'], Land: ['home', 'nhà'], 'Mixed-Use': ['residence', 'căn hộ'] };

// ── Verifiable per-suburb knowledge ─────────────────────────────────────────
// Each profile supplies finished bilingual copy so the suburb voice is editable
// in one place. {brand}/{type}/{typeVi}/{yld} are interpolated at compose time.
const SUBURB_PROFILES = {
  'Macquarie Park': {
    taglineEn: 'Metro-connected living at Sydney’s tech & university hub',
    taglineVi: 'Sống kết nối Metro tại trung tâm công nghệ & đại học của Sydney',
    blurbEn: 'a residential address in Macquarie Park — Sydney’s live-where-you-work tech, health and university precinct, on the Metro line',
    blurbVi: 'một địa chỉ tại Macquarie Park — khu công nghệ, y tế và đại học “sống-nơi-làm-việc” của Sydney, ngay trên tuyến Metro',
    marketEn: 'Macquarie Park is one of Sydney’s rare precincts where homes, a university, a hospital, a super-regional mall and a global business park all sit on the Metro — a structurally deep, year-round tenant base and a clear education/skilled-migration draw.',
    marketVi: 'Macquarie Park là một trong số ít khu của Sydney nơi nhà ở, đại học, bệnh viện, trung tâm thương mại lớn và khu văn phòng toàn cầu cùng nằm trên tuyến Metro — nguồn khách thuê dồi dào quanh năm và lực hút giáo dục/định cư tay nghề rõ rệt.',
    note: (c) => ({
      en: `Macquarie Park is one of Sydney’s few true live-where-you-work precincts — Macquarie University, a university hospital, the Macquarie Centre super-mall and a global business park (Optus, Microsoft, pharma HQs) all sit on the Metro line. That gives ${c.brand} a deep, year-round pool of student and professional tenants and a clear education/skilled-migration angle for relocating families. NAC reads it as a capital-growth hold rather than a yield play: the ~${c.yld}% gross yield is modest, but freehold AUD title and two Metro stations underwrite both rentability and resale. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Macquarie Park là một trong số ít khu “sống-nơi-làm-việc” đúng nghĩa của Sydney — Đại học Macquarie, bệnh viện đại học, trung tâm thương mại Macquarie Centre và khu văn phòng toàn cầu (Optus, Microsoft, các hãng dược) đều nằm trên tuyến Metro. Điều này mang lại cho ${c.brand} nguồn khách thuê sinh viên và chuyên gia dồi dào quanh năm, cùng lộ trình giáo dục/định cư tay nghề rõ ràng cho các gia đình. NAC xem đây là khoản đầu tư tăng giá vốn hơn là dòng tiền: lợi suất gộp ~${c.yld}% khiêm tốn, nhưng sở hữu freehold bằng AUD và hai ga Metro bảo chứng cho khả năng cho thuê lẫn bán lại. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Walk to two Sydney Metro stations (Macquarie University & Macquarie Park)', vi: 'Đi bộ tới hai ga Sydney Metro (Macquarie University & Macquarie Park)' },
      { en: 'Beside Macquarie University, the hospital & a global business park — built-in tenant demand', vi: 'Kề Đại học Macquarie, bệnh viện & khu văn phòng toàn cầu — nguồn thuê sẵn có' },
      { en: 'Steps from Macquarie Centre, one of Sydney’s largest shopping & dining hubs', vi: 'Sát Macquarie Centre, một trong những TTTM & ẩm thực lớn nhất Sydney' },
    ],
    feats: [
      { icon: '🚇', en: 'Two Sydney Metro stations within walking distance', vi: 'Hai ga Sydney Metro trong tầm đi bộ' },
      { icon: '🎓', en: 'Macquarie University & university hospital next door', vi: 'Đại học Macquarie & bệnh viện đại học kề bên' },
    ],
    conRisk: { en: 'Plenty of new high-rise stock in Macquarie Park — be selective on aspect/floor for resale', vi: 'Nguồn cung căn hộ cao tầng mới dồi dào tại Macquarie Park — cần chọn hướng/tầng kỹ để bán lại' },
  },
  'Blackburn': {
    taglineEn: 'Leafy, station-side townhouse living in Melbourne’s east',
    taglineVi: 'Nhà phố xanh mát, cạnh ga tàu ở phía đông Melbourne',
    blurbEn: 'a low-rise townhouse address in Blackburn — a quiet, green, established suburb in Melbourne’s east, on the Lilydale/Belgrave train line',
    blurbVi: 'một dự án nhà phố thấp tầng tại Blackburn — vùng ngoại ô phía đông Melbourne yên tĩnh, xanh mát, lâu đời, trên tuyến tàu Lilydale/Belgrave',
    marketEn: 'Blackburn is established east-Melbourne family territory — leafy streets, Blackburn Lake Sanctuary, well-regarded schools and a train station, ~18 km from the CBD. Low-rise townhouses here appeal to owner-occupier families, which supports both rental stability and resale depth.',
    marketVi: 'Blackburn là vùng gia đình lâu đời phía đông Melbourne — đường phố rợp cây, khu bảo tồn Blackburn Lake, trường học tốt và có ga tàu, cách CBD ~18 km. Nhà phố thấp tầng tại đây hấp dẫn các gia đình ở thực, hỗ trợ cả ổn định cho thuê lẫn thanh khoản bán lại.',
    note: (c) => ({
      en: `Blackburn is established, leafy east-Melbourne family territory — tree-lined streets, the Blackburn Lake Sanctuary, sought-after schools and a station on the Lilydale/Belgrave line, ~18 km from the CBD. A low-rise freehold ${c.type} here is an owner-occupier product, which gives ${c.brand} steadier tenant demand and a deeper resale pool than CBD high-rise. NAC views it as a capital-growth and family-relocation hold: the ~${c.yld}% yield is modest, but freehold AUD land and the school catchment underpin durable value. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Blackburn là vùng gia đình lâu đời, xanh mát phía đông Melbourne — phố rợp cây, khu bảo tồn Blackburn Lake, trường học được ưa chuộng và một ga trên tuyến Lilydale/Belgrave, cách CBD ~18 km. Một căn ${c.typeVi} freehold thấp tầng ở đây là sản phẩm cho người ở thực, mang lại cho ${c.brand} nhu cầu thuê ổn định hơn và thanh khoản bán lại sâu hơn so với cao tầng CBD. NAC xem đây là khoản đầu tư tăng giá vốn & gia đình chuyển cư: lợi suất ~${c.yld}% khiêm tốn, nhưng đất freehold bằng AUD và tuyến trường học giữ giá trị bền vững. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Walk to Blackburn station (Lilydale/Belgrave line) into the CBD', vi: 'Đi bộ tới ga Blackburn (tuyến Lilydale/Belgrave) vào CBD' },
      { en: 'Leafy, established family suburb — Blackburn Lake Sanctuary & parks nearby', vi: 'Khu gia đình lâu đời, xanh mát — kề khu bảo tồn Blackburn Lake & công viên' },
      { en: 'Sought-after eastern-suburbs school catchment', vi: 'Nằm trong tuyến trường học được ưa chuộng ở phía đông' },
    ],
    feats: [
      { icon: '🌳', en: 'Quiet, tree-lined streets beside Blackburn Lake Sanctuary', vi: 'Phố yên tĩnh rợp cây kề khu bảo tồn Blackburn Lake' },
      { icon: '🚆', en: 'Blackburn station on the Lilydale/Belgrave line', vi: 'Ga Blackburn trên tuyến Lilydale/Belgrave' },
    ],
    conRisk: { en: 'Low-rise townhouse — fewer building amenities than a high-rise tower', vi: 'Nhà phố thấp tầng — ít tiện ích toà nhà hơn so với cao ốc' },
  },
  'Carlingford': {
    taglineEn: 'Light-rail family living in Sydney’s school belt',
    taglineVi: 'Sống gia đình cạnh light-rail trong vùng trường học của Sydney',
    blurbEn: 'a residential address in Carlingford — an established family suburb in Sydney’s north-west and the terminus of the Parramatta Light Rail',
    blurbVi: 'một địa chỉ tại Carlingford — khu gia đình lâu đời ở tây bắc Sydney, điểm cuối tuyến Parramatta Light Rail',
    marketEn: 'Carlingford is established family north-west Sydney — strong public and selective schools, Carlingford Court, and a Light Rail terminus running to the Parramatta CBD. It sits between the Macquarie Park and Parramatta job markets, which keeps family and student tenant demand steady.',
    marketVi: 'Carlingford là khu gia đình lâu đời ở tây bắc Sydney — trường công và trường chọn lọc tốt, TTTM Carlingford Court, và điểm cuối tuyến Light Rail nối CBD Parramatta. Nằm giữa hai thị trường việc làm Macquarie Park và Parramatta, giúp nhu cầu thuê từ gia đình và sinh viên ổn định.',
    note: (c) => ({
      en: `Carlingford is established north-west Sydney family territory — known for strong public and selective schools, Carlingford Court, and the Parramatta Light Rail terminus that links it to the Parramatta CBD. Sitting between the Macquarie Park and Parramatta employment hubs gives ${c.brand} a steady mix of family and student tenants. NAC reads it as a school-catchment and capital-growth hold: the ~${c.yld}% yield is modest, but freehold AUD title and the education pull support both rentability and resale. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Carlingford là vùng gia đình lâu đời ở tây bắc Sydney — nổi tiếng với trường công và trường chọn lọc tốt, TTTM Carlingford Court, và điểm cuối Parramatta Light Rail nối tới CBD Parramatta. Vị trí giữa hai trung tâm việc làm Macquarie Park và Parramatta mang lại cho ${c.brand} nguồn khách thuê gia đình và sinh viên ổn định. NAC xem đây là khoản đầu tư theo tuyến trường học & tăng giá vốn: lợi suất ~${c.yld}% khiêm tốn, nhưng sở hữu freehold bằng AUD và lực hút giáo dục hỗ trợ cả cho thuê lẫn bán lại. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Parramatta Light Rail terminus — direct to the Parramatta CBD', vi: 'Điểm cuối Parramatta Light Rail — thẳng tới CBD Parramatta' },
      { en: 'Strong public & selective school catchment — family tenant magnet', vi: 'Tuyến trường công & trường chọn lọc tốt — hút khách thuê gia đình' },
      { en: 'Between the Macquarie Park & Parramatta job markets', vi: 'Nằm giữa hai thị trường việc làm Macquarie Park & Parramatta' },
    ],
    feats: [
      { icon: '🚊', en: 'Parramatta Light Rail terminus at Carlingford', vi: 'Điểm cuối Parramatta Light Rail tại Carlingford' },
      { icon: '🎓', en: 'Sought-after schools & Carlingford Court nearby', vi: 'Trường học được ưa chuộng & Carlingford Court kề bên' },
    ],
    conRisk: { en: 'Suburban location — capital growth led by schools/transport, not a CBD address', vi: 'Vị trí ngoại ô — tăng giá vốn dựa vào trường học/giao thông, không phải địa chỉ CBD' },
  },
  'Southbank': {
    taglineEn: 'Riverfront high-rise in Melbourne’s arts precinct',
    taglineVi: 'Căn hộ cao tầng ven sông trong khu nghệ thuật của Melbourne',
    blurbEn: 'a high-rise address in Southbank — Melbourne’s riverfront arts-and-dining precinct, a tram ride from the CBD',
    blurbVi: 'một dự án cao tầng tại Southbank — khu nghệ thuật & ẩm thực ven sông của Melbourne, cách CBD một chuyến tram',
    marketEn: 'Southbank is Melbourne’s riverfront arts precinct — the Arts Centre, NGV, Hamer Hall and the Southbank Promenade dining strip, with the CBD a short walk across the Yarra. It is dense, walkable and tram-wrapped, drawing CBD professionals, students and corporate tenants.',
    marketVi: 'Southbank là khu nghệ thuật ven sông của Melbourne — Arts Centre, NGV, Hamer Hall và dải ẩm thực Southbank Promenade, CBD chỉ vài phút đi bộ qua sông Yarra. Khu phố sầm uất, dễ đi bộ, phủ kín tram, thu hút chuyên gia CBD, sinh viên và khách thuê doanh nghiệp.',
    note: (c) => ({
      en: `Southbank is Melbourne’s riverfront arts-and-dining precinct — the Arts Centre, NGV and Hamer Hall on one side, the Yarra and a short walk to the CBD on the other, all wrapped in trams. ${c.brand} sits in the Melbourne Square precinct, anchored by a full-line supermarket and a large public park. NAC reads a CBD-fringe tower like this as a rental-yield and liquidity play more than most AU stock: the ~${c.yld}% yield is solid for the market and the walkable location keeps it leasable, though high-rise supply means resale rewards a well-chosen aspect. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Southbank là khu nghệ thuật & ẩm thực ven sông của Melbourne — Arts Centre, NGV và Hamer Hall một bên, sông Yarra và CBD chỉ vài phút đi bộ phía kia, tất cả phủ kín tram. ${c.brand} nằm trong quần thể Melbourne Square, với siêu thị lớn và một công viên công cộng rộng. NAC xem một toà cao tầng ven CBD như thế này nghiêng về lợi suất cho thuê & thanh khoản hơn phần lớn sản phẩm Úc: lợi suất ~${c.yld}% là tốt cho thị trường và vị trí dễ đi bộ giúp luôn cho thuê được, dù nguồn cung cao tầng đòi hỏi chọn hướng tốt khi bán lại. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Walk across the Yarra to the Melbourne CBD; trams at the door', vi: 'Đi bộ qua sông Yarra vào CBD Melbourne; tram ngay cửa' },
      { en: 'In the arts precinct — Arts Centre, NGV, Hamer Hall, Southbank dining', vi: 'Trong khu nghệ thuật — Arts Centre, NGV, Hamer Hall, ẩm thực Southbank' },
      { en: 'Melbourne Square precinct — full-line supermarket & a large public park', vi: 'Quần thể Melbourne Square — siêu thị lớn & công viên công cộng rộng' },
    ],
    feats: [
      { icon: '🎭', en: 'Heart of Melbourne’s arts precinct, on the Yarra', vi: 'Trung tâm khu nghệ thuật Melbourne, ven sông Yarra' },
      { icon: '🚋', en: 'Tram-wrapped, walk to the CBD', vi: 'Phủ kín tram, đi bộ vào CBD' },
    ],
    conRisk: { en: 'Dense high-rise supply in Southbank — aspect & floor matter for resale', vi: 'Nguồn cung cao tầng dày đặc tại Southbank — hướng & tầng quyết định khi bán lại' },
  },
};

// Box Hill North & South share one profile (the precinct is one transport hub).
const _boxHill = {
  taglineEn: 'Transport-hub city living in Melbourne’s east',
  taglineVi: 'Sống đô thị cạnh đầu mối giao thông phía đông Melbourne',
  blurbEn: 'an address at Box Hill — a major eastern-Melbourne transport interchange and Chinese-Australian commercial hub, ~14 km from the CBD',
  blurbVi: 'một dự án tại Box Hill — đầu mối giao thông lớn phía đông Melbourne và trung tâm thương mại người Hoa, cách CBD ~14 km',
  marketEn: 'Box Hill is one of Melbourne’s busiest suburban hubs — a train-tram-bus interchange, the Box Hill Central malls, Box Hill Institute and Box Hill Hospital, anchored by a large Chinese-Australian community. That mix of education, health and retail keeps tenant demand deep year-round.',
  marketVi: 'Box Hill là một trong những trung tâm ngoại ô sầm uất nhất Melbourne — đầu mối tàu-tram-bus, TTTM Box Hill Central, Box Hill Institute và bệnh viện Box Hill, với cộng đồng người Hoa lớn. Sự kết hợp giáo dục, y tế và bán lẻ giữ nhu cầu thuê dồi dào quanh năm.',
  note: (c) => ({
    en: `Box Hill is one of Melbourne’s busiest suburban centres — a combined train, tram and bus interchange ~14 km east of the CBD, with the Box Hill Central malls, Box Hill Institute, Box Hill Hospital and a large Chinese-Australian community. That gives ${c.brand} broad, year-round tenant demand from students, healthcare workers and families. NAC reads it as a transport-and-education hold: the ~${c.yld}% yield is modest, but freehold AUD title and the interchange underpin both rentability and resale. Pricing here is a NAC estimate pending the developer price list.`,
    vi: `Box Hill là một trong những trung tâm ngoại ô sầm uất nhất Melbourne — đầu mối tàu, tram và bus cách CBD ~14 km về phía đông, cùng TTTM Box Hill Central, Box Hill Institute, bệnh viện Box Hill và cộng đồng người Hoa lớn. Điều này mang lại cho ${c.brand} nhu cầu thuê rộng và quanh năm từ sinh viên, nhân viên y tế và gia đình. NAC xem đây là khoản đầu tư theo giao thông & giáo dục: lợi suất ~${c.yld}% khiêm tốn, nhưng sở hữu freehold bằng AUD và đầu mối giao thông bảo chứng cho cho thuê lẫn bán lại. Giá là NAC ước tính, chờ bảng giá CĐT.`,
  }),
  pros: [
    { en: 'Train, tram & bus interchange — direct line into the CBD', vi: 'Đầu mối tàu, tram & bus — tuyến thẳng vào CBD' },
    { en: 'Box Hill Institute & Box Hill Hospital drive student/health tenant demand', vi: 'Box Hill Institute & bệnh viện Box Hill tạo nhu cầu thuê sinh viên/y tế' },
    { en: 'Box Hill Central malls & a major Chinese-Australian dining hub at the door', vi: 'TTTM Box Hill Central & trung tâm ẩm thực người Hoa ngay cửa' },
  ],
  feats: [
    { icon: '🚉', en: 'Train + tram + bus interchange ~14 km from the CBD', vi: 'Đầu mối tàu + tram + bus cách CBD ~14 km' },
    { icon: '🎓', en: 'Box Hill Institute & Box Hill Hospital nearby', vi: 'Box Hill Institute & bệnh viện Box Hill kề bên' },
  ],
  conRisk: { en: 'High-density growth area — plenty of new stock, so aspect/floor matter on resale', vi: 'Khu vực mật độ cao đang phát triển — nhiều nguồn cung mới, cần chọn hướng/tầng để bán lại' },
};

Object.assign(SUBURB_PROFILES, {
  'Pagewood': {
    taglineEn: 'Eastern-suburbs living by Westfield Eastgardens',
    taglineVi: 'Sống vùng đông Sydney cạnh Westfield Eastgardens',
    blurbEn: 'a residential address in Pagewood — an established south-east Sydney suburb beside Westfield Eastgardens, between the city, the airport and the eastern beaches',
    blurbVi: 'một địa chỉ tại Pagewood — vùng đông nam Sydney lâu đời kề Westfield Eastgardens, giữa thành phố, sân bay và các bãi biển phía đông',
    marketEn: 'Pagewood sits in south-east Sydney beside Westfield Eastgardens, a short hop to Maroubra’s beaches, the airport and Port Botany, ~10 km from the CBD. It’s an established, amenity-rich pocket that draws families and professionals.',
    marketVi: 'Pagewood nằm ở đông nam Sydney kề Westfield Eastgardens, gần bãi biển Maroubra, sân bay và Port Botany, cách CBD ~10 km. Đây là khu vực lâu đời, nhiều tiện ích, thu hút gia đình và chuyên gia.',
    note: (c) => ({
      en: `Pagewood is an established south-east Sydney pocket beside Westfield Eastgardens, minutes from Maroubra’s beaches, the airport and Port Botany and ~10 km from the CBD. That amenity mix gives ${c.brand} a steady family and professional tenant base. NAC reads it as a capital-growth and lifestyle hold: the ~${c.yld}% yield is modest, but freehold AUD title and the eastern-suburbs location support rentability and resale. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Pagewood là khu vực đông nam Sydney lâu đời kề Westfield Eastgardens, cách bãi biển Maroubra, sân bay và Port Botany vài phút và cách CBD ~10 km. Hệ tiện ích đó mang lại cho ${c.brand} nguồn khách thuê gia đình và chuyên gia ổn định. NAC xem đây là khoản đầu tư tăng giá vốn & phong cách sống: lợi suất ~${c.yld}% khiêm tốn, nhưng sở hữu freehold bằng AUD và vị trí vùng đông hỗ trợ cho thuê lẫn bán lại. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Beside Westfield Eastgardens — full-line retail at the door', vi: 'Kề Westfield Eastgardens — bán lẻ đầy đủ ngay cửa' },
      { en: 'Minutes to Maroubra’s eastern beaches & golf courses', vi: 'Vài phút tới bãi biển Maroubra & sân golf phía đông' },
      { en: 'Close to Sydney Airport & Port Botany employment', vi: 'Gần sân bay Sydney & việc làm Port Botany' },
    ],
    feats: [
      { icon: '🏖️', en: 'Eastern beaches & Westfield Eastgardens nearby', vi: 'Bãi biển phía đông & Westfield Eastgardens kề bên' },
      { icon: '✈️', en: 'Short drive to Sydney Airport', vi: 'Lái xe ngắn tới sân bay Sydney' },
    ],
    conRisk: { en: 'Bus-reliant for the CBD — no train station in the immediate pocket', vi: 'Phụ thuộc bus để vào CBD — không có ga tàu ngay khu vực' },
  },
  'Ashbury': {
    taglineEn: 'Quiet, leafy living in Sydney’s inner west',
    taglineVi: 'Sống yên tĩnh, xanh mát ở nội tây Sydney',
    blurbEn: 'a low-key residential address in Ashbury — a quiet, leafy, tightly-held inner-west Sydney pocket between Ashfield and Canterbury',
    blurbVi: 'một dự án nhà ở kín đáo tại Ashbury — khu nội tây Sydney yên tĩnh, xanh mát, ít giao dịch, giữa Ashfield và Canterbury',
    marketEn: 'Ashbury is a quiet, leafy inner-west pocket between Ashfield and Canterbury, ~8 km from the CBD — tightly held, family-oriented and close to the Cooks River parklands and two train lines.',
    marketVi: 'Ashbury là khu nội tây yên tĩnh, xanh mát giữa Ashfield và Canterbury, cách CBD ~8 km — ít giao dịch, hướng gia đình, gần công viên Cooks River và hai tuyến tàu.',
    note: (c) => ({
      en: `Ashbury is a quiet, leafy and tightly-held inner-west pocket between Ashfield and Canterbury, ~8 km from the CBD with the Cooks River parklands and two train lines close by. Low turnover and a family character give ${c.brand} stable tenant demand and resale depth. NAC reads it as a capital-growth hold: the ~${c.yld}% yield is modest, but freehold AUD title and the inner-west location underpin durable value. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Ashbury là khu nội tây yên tĩnh, xanh mát và ít giao dịch giữa Ashfield và Canterbury, cách CBD ~8 km, gần công viên Cooks River và hai tuyến tàu. Tính ổn định và đặc trưng gia đình mang lại cho ${c.brand} nhu cầu thuê ổn định và thanh khoản bán lại. NAC xem đây là khoản đầu tư tăng giá vốn: lợi suất ~${c.yld}% khiêm tốn, nhưng sở hữu freehold bằng AUD và vị trí nội tây giữ giá trị bền vững. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Quiet, leafy, tightly-held inner-west streets', vi: 'Phố nội tây yên tĩnh, xanh mát, ít giao dịch' },
      { en: 'Near the Cooks River parklands & cycleways', vi: 'Gần công viên & đường xe đạp Cooks River' },
      { en: 'Two train lines (Ashfield & Canterbury) into the CBD', vi: 'Hai tuyến tàu (Ashfield & Canterbury) vào CBD' },
    ],
    feats: [
      { icon: '🌳', en: 'Leafy inner-west streets by the Cooks River', vi: 'Phố nội tây xanh mát ven Cooks River' },
      { icon: '🚆', en: 'Ashfield & Canterbury stations close by', vi: 'Ga Ashfield & Canterbury kề bên' },
    ],
    conRisk: { en: 'Small, low-key suburb — growth led by inner-west scarcity, not big infrastructure', vi: 'Khu nhỏ, kín đáo — tăng giá nhờ sự khan hiếm nội tây, không phải hạ tầng lớn' },
  },
  'Zetland': {
    taglineEn: 'Inner-city renewal living at Green Square',
    taglineVi: 'Sống nội đô tái thiết tại Green Square',
    blurbEn: 'an apartment address in Zetland — the heart of Sydney’s Green Square urban-renewal precinct, ~4 km south of the CBD',
    blurbVi: 'một dự án căn hộ tại Zetland — trung tâm khu tái thiết đô thị Green Square của Sydney, cách CBD ~4 km về phía nam',
    marketEn: 'Zetland anchors the Green Square renewal — one of Australia’s largest urban-infill projects — with Green Square station, the East Village mall and the Gunyama Park aquatic centre, ~4 km from the CBD and on the airport line. It draws young professionals and CBD commuters.',
    marketVi: 'Zetland là trung tâm khu tái thiết Green Square — một trong những dự án nội đô lớn nhất nước Úc — với ga Green Square, TTTM East Village và trung tâm thể thao Gunyama Park, cách CBD ~4 km và trên tuyến sân bay. Khu này hút giới chuyên gia trẻ và người đi làm CBD.',
    note: (c) => ({
      en: `Zetland sits at the heart of Green Square — one of Australia’s largest urban-renewal precincts — with its own station on the airport line, the East Village mall and the Gunyama Park aquatic centre, ~4 km south of the CBD. That gives ${c.brand} a deep young-professional and CBD-commuter tenant pool. NAC reads it as a rental and liquidity play more than most AU stock: the ~${c.yld}% yield is workable and the location keeps it leasable, though heavy new supply means a well-chosen aspect matters on resale. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Zetland nằm ở trung tâm Green Square — một trong những khu tái thiết đô thị lớn nhất nước Úc — với ga riêng trên tuyến sân bay, TTTM East Village và trung tâm thể thao Gunyama Park, cách CBD ~4 km về phía nam. Điều này mang lại cho ${c.brand} nguồn khách thuê chuyên gia trẻ và người đi làm CBD dồi dào. NAC xem đây nghiêng về cho thuê & thanh khoản hơn phần lớn sản phẩm Úc: lợi suất ~${c.yld}% khả thi và vị trí giúp luôn cho thuê được, dù nguồn cung mới lớn đòi hỏi chọn hướng tốt khi bán lại. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Green Square station on the airport line — ~6 min to Central', vi: 'Ga Green Square trên tuyến sân bay — ~6 phút tới Central' },
      { en: 'East Village mall & Gunyama Park aquatic centre at hand', vi: 'TTTM East Village & trung tâm thể thao Gunyama Park kề bên' },
      { en: '~4 km to the CBD — strong young-professional rental demand', vi: 'Cách CBD ~4 km — nhu cầu thuê chuyên gia trẻ mạnh' },
    ],
    feats: [
      { icon: '🚆', en: 'Green Square station, ~4 km from the CBD', vi: 'Ga Green Square, cách CBD ~4 km' },
      { icon: '🏙️', en: 'Heart of the Green Square renewal precinct', vi: 'Trung tâm khu tái thiết Green Square' },
    ],
    conRisk: { en: 'Heavy new-apartment supply across Green Square — be selective for resale', vi: 'Nguồn cung căn hộ mới lớn khắp Green Square — cần chọn lọc để bán lại' },
  },
  'Waterloo': {
    taglineEn: 'City-edge living with a Metro on the way',
    taglineVi: 'Sống sát thành phố, sắp có Metro',
    blurbEn: 'an apartment address in Waterloo — an inner-city Sydney renewal pocket beside Green Square, ~3 km from the CBD with a Metro station coming',
    blurbVi: 'một dự án căn hộ tại Waterloo — khu tái thiết nội đô Sydney kề Green Square, cách CBD ~3 km, sắp có ga Metro',
    marketEn: 'Waterloo is an inner-city renewal pocket next to Green Square and Surry Hills, ~3 km from the CBD, with the Danks Street café/design strip and a future Waterloo Metro station. It’s a young-professional rental market on the city’s doorstep.',
    marketVi: 'Waterloo là khu tái thiết nội đô kề Green Square và Surry Hills, cách CBD ~3 km, với dải café/thiết kế Danks Street và ga Waterloo Metro tương lai. Đây là thị trường cho thuê chuyên gia trẻ ngay cửa ngõ thành phố.',
    note: (c) => ({
      en: `Waterloo is an inner-city renewal pocket beside Green Square and Surry Hills, ~3 km from the CBD, with the Danks Street café and design strip and a future Waterloo Metro station that will sharpen its connectivity. That gives ${c.brand} a deep young-professional tenant pool. NAC reads it as a rental and liquidity play: the ~${c.yld}% yield is workable and the city-edge location keeps it leasable, with the coming Metro a resale catalyst — though inner-city supply rewards a well-chosen aspect. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Waterloo là khu tái thiết nội đô kề Green Square và Surry Hills, cách CBD ~3 km, với dải café và thiết kế Danks Street cùng ga Waterloo Metro tương lai sẽ tăng kết nối. Điều này mang lại cho ${c.brand} nguồn khách thuê chuyên gia trẻ dồi dào. NAC xem đây nghiêng về cho thuê & thanh khoản: lợi suất ~${c.yld}% khả thi và vị trí sát thành phố giúp luôn cho thuê được, với Metro sắp tới là động lực bán lại — dù nguồn cung nội đô đòi hỏi chọn hướng tốt. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Future Waterloo Metro station — a major connectivity upgrade', vi: 'Ga Waterloo Metro tương lai — nâng cấp kết nối lớn' },
      { en: '~3 km to the CBD; beside Surry Hills & Green Square', vi: 'Cách CBD ~3 km; kề Surry Hills & Green Square' },
      { en: 'Danks Street café & design precinct at the door', vi: 'Khu café & thiết kế Danks Street ngay cửa' },
    ],
    feats: [
      { icon: '🚇', en: 'Future Waterloo Metro station', vi: 'Ga Waterloo Metro tương lai' },
      { icon: '🏙️', en: 'Inner-city, ~3 km from the CBD', vi: 'Nội đô, cách CBD ~3 km' },
    ],
    conRisk: { en: 'Inner-city high-rise supply — aspect & floor matter for resale', vi: 'Nguồn cung cao tầng nội đô — hướng & tầng quyết định khi bán lại' },
  },
  'Parramatta': {
    taglineEn: 'At the heart of Sydney’s second CBD',
    taglineVi: 'Ngay trung tâm CBD thứ hai của Sydney',
    blurbEn: 'an address in Parramatta — Sydney’s second CBD and Western Sydney’s commercial, transport and education centre',
    blurbVi: 'một dự án tại Parramatta — CBD thứ hai của Sydney và trung tâm thương mại, giao thông, giáo dục của Tây Sydney',
    marketEn: 'Parramatta is Sydney’s designated second CBD — heavy rail, light rail and the future Sydney Metro West all converge here, alongside Parramatta Square’s commercial towers, Western Sydney University, Westfield Parramatta and major government employment. Demand runs deep across professionals and students.',
    marketVi: 'Parramatta là CBD thứ hai của Sydney — tàu nặng, light rail và Sydney Metro West tương lai đều hội tụ tại đây, cùng các toà văn phòng Parramatta Square, Đại học Western Sydney, Westfield Parramatta và việc làm khối chính phủ lớn. Nhu cầu rất sâu từ chuyên gia và sinh viên.',
    note: (c) => ({
      en: `Parramatta is Sydney’s second CBD — heavy rail, light rail and the future Sydney Metro West converge here alongside Parramatta Square’s office towers, Western Sydney University, Westfield Parramatta and major government employment. That depth gives ${c.brand} a broad professional and student tenant base and a clear infrastructure-growth story. NAC reads it as both a yield and capital-growth hold: the ~${c.yld}% yield is solid for the corridor and Metro West is a structural catalyst. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Parramatta là CBD thứ hai của Sydney — tàu nặng, light rail và Sydney Metro West tương lai hội tụ tại đây cùng các toà văn phòng Parramatta Square, Đại học Western Sydney, Westfield Parramatta và việc làm khối chính phủ lớn. Chiều sâu đó mang lại cho ${c.brand} nguồn khách thuê chuyên gia và sinh viên rộng cùng câu chuyện tăng trưởng hạ tầng rõ ràng. NAC xem đây vừa là khoản đầu tư lợi suất vừa tăng giá vốn: lợi suất ~${c.yld}% tốt cho hành lang này và Metro West là động lực cấu trúc. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Heavy rail + light rail + future Sydney Metro West interchange', vi: 'Tàu nặng + light rail + đầu mối Sydney Metro West tương lai' },
      { en: 'Western Sydney University & Parramatta Square office towers', vi: 'Đại học Western Sydney & các toà văn phòng Parramatta Square' },
      { en: 'Westfield Parramatta & deep government/professional employment', vi: 'Westfield Parramatta & việc làm chính phủ/chuyên gia dồi dào' },
    ],
    feats: [
      { icon: '🚆', en: 'Rail, light rail & future Metro West all at Parramatta', vi: 'Tàu, light rail & Metro West tương lai đều tại Parramatta' },
      { icon: '🏙️', en: 'Sydney’s designated second CBD', vi: 'CBD thứ hai chính thức của Sydney' },
    ],
    conRisk: { en: 'Strong apartment pipeline in the Parramatta CBD — choose aspect/floor carefully', vi: 'Nguồn cung căn hộ mạnh tại CBD Parramatta — chọn hướng/tầng cẩn thận' },
  },
  'Erskineville': {
    taglineEn: 'Village living on the city’s inner-west edge',
    taglineVi: 'Sống kiểu làng phố sát rìa nội tây thành phố',
    blurbEn: 'an address in Erskineville — a tightly-held inner-west village beside Newtown, ~4 km from the CBD with its own train station',
    blurbVi: 'một dự án tại Erskineville — khu làng phố nội tây ít giao dịch kề Newtown, cách CBD ~4 km, có ga tàu riêng',
    marketEn: 'Erskineville is a tightly-held inner-west village next to Newtown, ~4 km from the CBD, with its own station and a café-and-pub high street. It draws young professionals and creatives and rarely sees vacancy.',
    marketVi: 'Erskineville là khu làng phố nội tây ít giao dịch kề Newtown, cách CBD ~4 km, có ga riêng và phố chính nhiều café-quán bia. Khu này hút chuyên gia trẻ và giới sáng tạo, hiếm khi trống phòng.',
    note: (c) => ({
      en: `Erskineville is a tightly-held inner-west village beside Newtown, ~4 km from the CBD, with its own train station and a characterful café-and-pub high street. Low vacancy and a young-professional/creative tenant base give ${c.brand} steady rentability. NAC reads it as a capital-growth and scarcity hold: the ~${c.yld}% yield is modest, but freehold AUD title and the inner-west location underpin durable value. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Erskineville là khu làng phố nội tây ít giao dịch kề Newtown, cách CBD ~4 km, có ga tàu riêng và phố chính nhiều café-quán bia đặc trưng. Tỷ lệ trống thấp và nguồn khách thuê chuyên gia trẻ/sáng tạo mang lại cho ${c.brand} khả năng cho thuê ổn định. NAC xem đây là khoản đầu tư tăng giá vốn & khan hiếm: lợi suất ~${c.yld}% khiêm tốn, nhưng sở hữu freehold bằng AUD và vị trí nội tây giữ giá trị bền vững. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Erskineville station — ~10 min to Central', vi: 'Ga Erskineville — ~10 phút tới Central' },
      { en: 'Beside Newtown’s café, pub & dining scene', vi: 'Kề khu café, pub & ẩm thực Newtown' },
      { en: 'Tightly-held inner-west village — low vacancy', vi: 'Khu làng phố nội tây ít giao dịch — trống phòng thấp' },
    ],
    feats: [
      { icon: '🚆', en: 'Erskineville station, ~4 km from the CBD', vi: 'Ga Erskineville, cách CBD ~4 km' },
      { icon: '🍽️', en: 'Newtown village high street next door', vi: 'Phố làng Newtown kề bên' },
    ],
    conRisk: { en: 'Boutique inner-west pocket — limited large-scale amenity vs a tower precinct', vi: 'Khu nội tây nhỏ — ít tiện ích quy mô lớn so với khu cao ốc' },
  },
  'Caringbah': {
    taglineEn: 'Shire living near Cronulla’s beaches',
    taglineVi: 'Sống vùng Shire gần bãi biển Cronulla',
    blurbEn: 'an address in Caringbah — an established Sutherland Shire suburb in southern Sydney, minutes from Cronulla’s beaches and on the Cronulla rail line',
    blurbVi: 'một dự án tại Caringbah — khu Sutherland Shire lâu đời ở nam Sydney, cách bãi biển Cronulla vài phút và trên tuyến tàu Cronulla',
    marketEn: 'Caringbah is established Sutherland Shire — a beachside-lifestyle market in southern Sydney, on the Cronulla rail line and minutes from Cronulla beach and Port Hacking, with Westfield Miranda close by. It draws Shire families and downsizers.',
    marketVi: 'Caringbah là khu Sutherland Shire lâu đời — thị trường phong cách sống ven biển ở nam Sydney, trên tuyến tàu Cronulla và cách bãi biển Cronulla, Port Hacking vài phút, gần Westfield Miranda. Khu này hút gia đình Shire và người về hưu.',
    note: (c) => ({
      en: `Caringbah is established Sutherland Shire — a beachside-lifestyle market in southern Sydney, on the Cronulla rail line and minutes from Cronulla beach, Port Hacking and Westfield Miranda. The Shire’s owner-occupier character gives ${c.brand} stable demand and resale depth. NAC reads it as a lifestyle and capital-growth hold: the ~${c.yld}% yield is modest, but freehold AUD title and the beachside location underpin durable value. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Caringbah là khu Sutherland Shire lâu đời — thị trường phong cách sống ven biển ở nam Sydney, trên tuyến tàu Cronulla và cách bãi biển Cronulla, Port Hacking, Westfield Miranda vài phút. Đặc trưng người ở thực của Shire mang lại cho ${c.brand} nhu cầu ổn định và thanh khoản bán lại. NAC xem đây là khoản đầu tư phong cách sống & tăng giá vốn: lợi suất ~${c.yld}% khiêm tốn, nhưng sở hữu freehold bằng AUD và vị trí ven biển giữ giá trị bền vững. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Minutes to Cronulla beach & Port Hacking', vi: 'Vài phút tới bãi biển Cronulla & Port Hacking' },
      { en: 'Caringbah station on the Cronulla line; Westfield Miranda close', vi: 'Ga Caringbah trên tuyến Cronulla; gần Westfield Miranda' },
      { en: 'Established Sutherland Shire family lifestyle', vi: 'Phong cách sống gia đình Sutherland Shire lâu đời' },
    ],
    feats: [
      { icon: '🏖️', en: 'Cronulla beaches & Port Hacking minutes away', vi: 'Bãi biển Cronulla & Port Hacking cách vài phút' },
      { icon: '🚆', en: 'Caringbah station on the Cronulla line', vi: 'Ga Caringbah trên tuyến Cronulla' },
    ],
    conRisk: { en: 'Southern-Sydney location — ~40 min by rail to the CBD', vi: 'Vị trí nam Sydney — ~40 phút tàu tới CBD' },
  },
  'Burwood': {
    taglineEn: 'Rail-hub city living in Sydney’s inner west',
    taglineVi: 'Sống đô thị cạnh đầu mối tàu ở nội tây Sydney',
    blurbEn: 'an address in Burwood — a major inner-west Sydney retail-and-rail hub ~10 km from the CBD with a strong Chinese-Australian community',
    blurbVi: 'một dự án tại Burwood — trung tâm bán lẻ và tàu lớn ở nội tây Sydney, cách CBD ~10 km, với cộng đồng người Hoa mạnh',
    marketEn: 'Burwood is a major inner-west centre ~10 km from the CBD — a station on the main western line, Westfield Burwood, sought-after schools and a thriving Chinese-Australian dining scene. That keeps tenant demand deep across families, students and professionals.',
    marketVi: 'Burwood là trung tâm nội tây lớn cách CBD ~10 km — ga trên tuyến tây chính, Westfield Burwood, trường học được ưa chuộng và khu ẩm thực người Hoa sầm uất. Điều đó giữ nhu cầu thuê sâu từ gia đình, sinh viên và chuyên gia.',
    note: (c) => ({
      en: `Burwood is a major inner-west centre ~10 km from the CBD — a station on the main western line, Westfield Burwood, sought-after schools and a thriving Chinese-Australian dining scene. That breadth gives ${c.brand} deep tenant demand across families, students and professionals. NAC reads it as a transport-and-retail hold: the ~${c.yld}% yield is modest, but freehold AUD title and the rail-hub location support rentability and resale. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Burwood là trung tâm nội tây lớn cách CBD ~10 km — ga trên tuyến tây chính, Westfield Burwood, trường học được ưa chuộng và khu ẩm thực người Hoa sầm uất. Bề rộng đó mang lại cho ${c.brand} nhu cầu thuê sâu từ gia đình, sinh viên và chuyên gia. NAC xem đây là khoản đầu tư theo giao thông & bán lẻ: lợi suất ~${c.yld}% khiêm tốn, nhưng sở hữu freehold bằng AUD và vị trí đầu mối tàu hỗ trợ cho thuê lẫn bán lại. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Burwood station on the main western line into the CBD', vi: 'Ga Burwood trên tuyến tây chính vào CBD' },
      { en: 'Westfield Burwood & a major dining hub at the door', vi: 'Westfield Burwood & trung tâm ẩm thực lớn ngay cửa' },
      { en: 'Sought-after Burwood/Strathfield school catchment', vi: 'Tuyến trường Burwood/Strathfield được ưa chuộng' },
    ],
    feats: [
      { icon: '🚆', en: 'Burwood rail interchange ~10 km from the CBD', vi: 'Đầu mối tàu Burwood cách CBD ~10 km' },
      { icon: '🛍️', en: 'Westfield Burwood & dining precinct', vi: 'Westfield Burwood & khu ẩm thực' },
    ],
    conRisk: { en: 'High-density centre — plenty of apartment stock, so aspect/floor matter', vi: 'Trung tâm mật độ cao — nhiều nguồn cung căn hộ, cần chọn hướng/tầng' },
  },
  'Blacktown': {
    taglineEn: 'Affordable family growth in Western Sydney',
    taglineVi: 'Tăng trưởng gia đình giá hợp lý ở Tây Sydney',
    blurbEn: 'an address in Blacktown — a major Western Sydney centre and growth corridor, a rail interchange ~35 km from the CBD',
    blurbVi: 'một dự án tại Blacktown — trung tâm lớn và hành lang tăng trưởng của Tây Sydney, đầu mối tàu cách CBD ~35 km',
    marketEn: 'Blacktown is a major Western Sydney centre on a key rail interchange, in one of the city’s fastest-growing corridors near the new Western Sydney Aerotropolis. It’s an affordability-and-yield market drawing families and first-home tenants.',
    marketVi: 'Blacktown là trung tâm lớn của Tây Sydney trên đầu mối tàu quan trọng, trong một trong những hành lang tăng trưởng nhanh nhất thành phố gần Aerotropolis Tây Sydney mới. Đây là thị trường giá hợp lý & lợi suất, hút gia đình và người thuê lần đầu.',
    note: (c) => ({
      en: `Blacktown is a major Western Sydney centre on a key rail interchange ~35 km from the CBD, in one of the city’s fastest-growing corridors near the new Western Sydney (Aerotropolis) airport. Affordability and population growth give ${c.brand} a deep family and value-tenant base and a relatively higher ~${c.yld}% yield for Sydney. NAC reads it as a yield-and-growth-corridor play: freehold AUD title plus infrastructure-led population growth underpin the case. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Blacktown là trung tâm lớn của Tây Sydney trên đầu mối tàu quan trọng cách CBD ~35 km, trong một trong những hành lang tăng trưởng nhanh nhất thành phố gần sân bay Tây Sydney (Aerotropolis) mới. Giá hợp lý và tăng dân số mang lại cho ${c.brand} nguồn khách thuê gia đình/giá trị dồi dào cùng lợi suất ~${c.yld}% tương đối cao cho Sydney. NAC xem đây là khoản đầu tư lợi suất & hành lang tăng trưởng: sở hữu freehold bằng AUD cùng tăng dân số nhờ hạ tầng củng cố luận điểm. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Major rail interchange into Parramatta & the CBD', vi: 'Đầu mối tàu lớn vào Parramatta & CBD' },
      { en: 'Fast-growing corridor near the new Western Sydney airport', vi: 'Hành lang tăng trưởng nhanh gần sân bay Tây Sydney mới' },
      { en: 'Affordability supports a relatively higher rental yield', vi: 'Giá hợp lý hỗ trợ lợi suất cho thuê tương đối cao hơn' },
    ],
    feats: [
      { icon: '🚆', en: 'Blacktown rail interchange', vi: 'Đầu mối tàu Blacktown' },
      { icon: '📈', en: 'Western Sydney growth-corridor location', vi: 'Vị trí hành lang tăng trưởng Tây Sydney' },
    ],
    conRisk: { en: 'Outer-ring location ~35 km from the CBD — growth-corridor, not blue-chip inner', vi: 'Vị trí vành ngoài cách CBD ~35 km — hành lang tăng trưởng, không phải nội đô blue-chip' },
  },
  'Auburn': {
    taglineEn: 'Value city-rail living near Olympic Park',
    taglineVi: 'Sống cạnh tàu giá hợp lý gần Olympic Park',
    blurbEn: 'an address in Auburn — a multicultural Western Sydney suburb on the main western rail line, between Parramatta and Sydney Olympic Park',
    blurbVi: 'một dự án tại Auburn — khu đa văn hóa Tây Sydney trên tuyến tàu tây chính, giữa Parramatta và Sydney Olympic Park',
    marketEn: 'Auburn sits on the main western rail line between Parramatta and Sydney Olympic Park, ~19 km from the CBD — a multicultural, affordable market with strong rental demand from families and workers across those two employment hubs.',
    marketVi: 'Auburn nằm trên tuyến tàu tây chính giữa Parramatta và Sydney Olympic Park, cách CBD ~19 km — thị trường đa văn hóa, giá hợp lý, nhu cầu thuê mạnh từ gia đình và người lao động của hai trung tâm việc làm đó.',
    note: (c) => ({
      en: `Auburn sits on the main western line between Parramatta and Sydney Olympic Park, ~19 km from the CBD — a multicultural, affordable market with steady rental demand from families and workers across both employment hubs. That gives ${c.brand} a deep value-tenant base and a relatively higher ~${c.yld}% yield. NAC reads it as a yield-and-value hold: freehold AUD title and the rail location underpin rentability. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Auburn nằm trên tuyến tây chính giữa Parramatta và Sydney Olympic Park, cách CBD ~19 km — thị trường đa văn hóa, giá hợp lý, nhu cầu thuê ổn định từ gia đình và người lao động của cả hai trung tâm việc làm. Điều này mang lại cho ${c.brand} nguồn khách thuê giá trị dồi dào và lợi suất ~${c.yld}% tương đối cao hơn. NAC xem đây là khoản đầu tư lợi suất & giá trị: sở hữu freehold bằng AUD và vị trí cạnh tàu hỗ trợ cho thuê. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Main western line — between Parramatta & Sydney Olympic Park', vi: 'Tuyến tây chính — giữa Parramatta & Sydney Olympic Park' },
      { en: 'Affordable entry with a relatively higher rental yield', vi: 'Mức vào hợp lý với lợi suất cho thuê tương đối cao hơn' },
      { en: 'Deep, multicultural rental demand', vi: 'Nhu cầu thuê đa văn hóa, dồi dào' },
    ],
    feats: [
      { icon: '🚆', en: 'Auburn station on the main western line', vi: 'Ga Auburn trên tuyến tây chính' },
      { icon: '🏟️', en: 'Near Sydney Olympic Park & Parramatta jobs', vi: 'Gần Sydney Olympic Park & việc làm Parramatta' },
    ],
    conRisk: { en: 'Middle-ring value market — growth led by affordability, not a blue-chip address', vi: 'Thị trường giá trị vành giữa — tăng giá nhờ giá hợp lý, không phải địa chỉ blue-chip' },
  },
  'Arncliffe': {
    taglineEn: 'Airport-line living by the Cooks River',
    taglineVi: 'Sống cạnh tuyến sân bay ven sông Cooks',
    blurbEn: 'an address in Arncliffe — a St George (southern Sydney) suburb on the airport rail line, beside the Wolli Creek hub and the Cooks River',
    blurbVi: 'một dự án tại Arncliffe — khu St George (nam Sydney) trên tuyến tàu sân bay, kề trung tâm Wolli Creek và sông Cooks',
    marketEn: 'Arncliffe sits in Sydney’s St George area on the airport rail line, ~9 km from the CBD beside the Wolli Creek transport hub and the Cooks River parklands — quick to both the city and the airport, drawing professionals and commuters.',
    marketVi: 'Arncliffe nằm trong khu St George của Sydney trên tuyến tàu sân bay, cách CBD ~9 km, kề trung tâm giao thông Wolli Creek và công viên sông Cooks — nhanh tới cả thành phố lẫn sân bay, hút chuyên gia và người đi làm.',
    note: (c) => ({
      en: `Arncliffe sits in Sydney’s St George area on the airport rail line, ~9 km from the CBD beside the Wolli Creek transport hub and the Cooks River parklands — fast to both the city and the airport. That connectivity gives ${c.brand} a steady professional and commuter tenant pool. NAC reads it as a rental and capital-growth hold: the ~${c.yld}% yield is workable and the airport-line location keeps it leasable. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Arncliffe nằm trong khu St George của Sydney trên tuyến tàu sân bay, cách CBD ~9 km, kề trung tâm giao thông Wolli Creek và công viên sông Cooks — nhanh tới cả thành phố lẫn sân bay. Kết nối đó mang lại cho ${c.brand} nguồn khách thuê chuyên gia và người đi làm ổn định. NAC xem đây là khoản đầu tư cho thuê & tăng giá vốn: lợi suất ~${c.yld}% khả thi và vị trí tuyến sân bay giúp luôn cho thuê được. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Airport rail line — quick to both the CBD & the airport', vi: 'Tuyến tàu sân bay — nhanh tới cả CBD & sân bay' },
      { en: 'Beside the Wolli Creek hub & Cooks River parklands', vi: 'Kề trung tâm Wolli Creek & công viên sông Cooks' },
      { en: 'Southern-Sydney value with strong connectivity', vi: 'Giá trị nam Sydney với kết nối mạnh' },
    ],
    feats: [
      { icon: '🚆', en: 'Arncliffe station on the airport line', vi: 'Ga Arncliffe trên tuyến sân bay' },
      { icon: '🌊', en: 'Cooks River parklands at hand', vi: 'Công viên sông Cooks kề bên' },
    ],
    conRisk: { en: 'Under-airport flight paths nearby — and growing Wolli Creek apartment supply', vi: 'Gần đường bay sân bay — và nguồn cung căn hộ Wolli Creek đang tăng' },
  },
  'North Sydney': {
    taglineEn: 'Harbourside corporate living, a Metro from the CBD',
    taglineVi: 'Sống bên cảng khu doanh nghiệp, cách CBD một chuyến Metro',
    blurbEn: 'an address in North Sydney — a major harbourside business district across the bridge from the CBD, now on the Sydney Metro',
    blurbVi: 'một dự án tại North Sydney — khu thương mại lớn bên cảng, qua cầu là CBD, nay có Sydney Metro',
    marketEn: 'North Sydney is a major corporate district just across the Harbour Bridge from the CBD — dense office towers, the new Victoria Cross Metro station and harbour-and-Luna-Park amenity. It draws a deep pool of corporate professionals.',
    marketVi: 'North Sydney là khu doanh nghiệp lớn ngay bên kia cầu Harbour so với CBD — các toà văn phòng dày đặc, ga Victoria Cross Metro mới và tiện ích cảng-Luna Park. Khu này hút nguồn chuyên gia doanh nghiệp dồi dào.',
    note: (c) => ({
      en: `North Sydney is a major corporate district just across the Harbour Bridge from the CBD, now served by the new Victoria Cross Metro station, with dense office towers and harbour amenity. That gives ${c.brand} a deep corporate-professional tenant pool and strong leasability. NAC reads it as a yield and liquidity play: the ~${c.yld}% yield is solid for premium Sydney and the Metro is a structural resale catalyst. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `North Sydney là khu doanh nghiệp lớn ngay bên kia cầu Harbour so với CBD, nay có ga Victoria Cross Metro mới, với các toà văn phòng dày đặc và tiện ích bên cảng. Điều này mang lại cho ${c.brand} nguồn khách thuê chuyên gia doanh nghiệp dồi dào và khả năng cho thuê mạnh. NAC xem đây là khoản đầu tư lợi suất & thanh khoản: lợi suất ~${c.yld}% tốt cho phân khúc cao cấp Sydney và Metro là động lực bán lại cấu trúc. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'New Victoria Cross Metro station in the precinct', vi: 'Ga Victoria Cross Metro mới trong khu' },
      { en: 'Major office district — deep corporate tenant demand', vi: 'Khu văn phòng lớn — nhu cầu thuê doanh nghiệp dồi dào' },
      { en: 'Harbour, Luna Park & a short hop to the CBD', vi: 'Cảng, Luna Park & rất gần CBD' },
    ],
    feats: [
      { icon: '🚇', en: 'Victoria Cross Metro + a bridge from the CBD', vi: 'Victoria Cross Metro + qua cầu là CBD' },
      { icon: '🏙️', en: 'Major harbourside business district', vi: 'Khu thương mại lớn bên cảng' },
    ],
    conRisk: { en: 'Premium entry price; high-rise supply rewards a well-chosen aspect', vi: 'Giá vào cao cấp; nguồn cung cao tầng đòi hỏi chọn hướng tốt' },
  },
  'Lakemba': {
    taglineEn: 'Value, high-yield rail living in Sydney’s south-west',
    taglineVi: 'Sống cạnh tàu giá hợp lý, lợi suất cao ở tây nam Sydney',
    blurbEn: 'an address in Lakemba — a multicultural Canterbury-Bankstown suburb on the rail line, ~13 km from the CBD and famous for its food street',
    blurbVi: 'một dự án tại Lakemba — khu đa văn hóa Canterbury-Bankstown trên tuyến tàu, cách CBD ~13 km, nổi tiếng với phố ẩm thực',
    marketEn: 'Lakemba is a multicultural Canterbury-Bankstown suburb on the rail line ~13 km from the CBD, known Sydney-wide for its Haldon Street food scene. It’s an affordability-and-yield market with consistently strong rental demand.',
    marketVi: 'Lakemba là khu đa văn hóa Canterbury-Bankstown trên tuyến tàu cách CBD ~13 km, nổi tiếng khắp Sydney với phố ẩm thực Haldon Street. Đây là thị trường giá hợp lý & lợi suất với nhu cầu thuê luôn mạnh.',
    note: (c) => ({
      en: `Lakemba is a multicultural Canterbury-Bankstown suburb on the rail line ~13 km from the CBD, known across Sydney for its Haldon Street food scene. Affordability and dense rental demand give ${c.brand} a relatively higher ~${c.yld}% yield than inner Sydney. NAC reads it as a yield-and-value play rather than a capital-growth story: freehold AUD title and the rail location underpin steady rentability. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Lakemba là khu đa văn hóa Canterbury-Bankstown trên tuyến tàu cách CBD ~13 km, nổi tiếng khắp Sydney với phố ẩm thực Haldon Street. Giá hợp lý và nhu cầu thuê dày đặc mang lại cho ${c.brand} lợi suất ~${c.yld}% tương đối cao hơn nội đô Sydney. NAC xem đây là khoản đầu tư lợi suất & giá trị hơn là câu chuyện tăng giá vốn: sở hữu freehold bằng AUD và vị trí cạnh tàu hỗ trợ cho thuê ổn định. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Rail line into the CBD; affordable entry', vi: 'Tuyến tàu vào CBD; mức vào hợp lý' },
      { en: 'Relatively higher rental yield for Sydney', vi: 'Lợi suất cho thuê tương đối cao hơn cho Sydney' },
      { en: 'Famous Haldon Street food & dense rental demand', vi: 'Phố ẩm thực Haldon Street nổi tiếng & nhu cầu thuê dày đặc' },
    ],
    feats: [
      { icon: '🚆', en: 'Lakemba station ~13 km from the CBD', vi: 'Ga Lakemba cách CBD ~13 km' },
      { icon: '💰', en: 'Affordability-led, higher-yield market', vi: 'Thị trường giá hợp lý, lợi suất cao hơn' },
    ],
    conRisk: { en: 'A yield/value market — capital growth more modest than blue-chip suburbs', vi: 'Thị trường lợi suất/giá trị — tăng giá vốn khiêm tốn hơn khu blue-chip' },
  },
  'Hurstville': {
    taglineEn: 'Rail-hub city living in Sydney’s south',
    taglineVi: 'Sống đô thị cạnh đầu mối tàu ở nam Sydney',
    blurbEn: 'an address in Hurstville — a major St George retail-and-rail centre in southern Sydney with a strong Chinese-Australian community',
    blurbVi: 'một dự án tại Hurstville — trung tâm bán lẻ và tàu lớn của St George ở nam Sydney với cộng đồng người Hoa mạnh',
    marketEn: 'Hurstville is a major southern-Sydney centre ~16 km from the CBD — a rail interchange, Westfield Hurstville and a large Chinese-Australian retail and dining hub. That keeps tenant demand deep across families, students and professionals.',
    marketVi: 'Hurstville là trung tâm lớn ở nam Sydney cách CBD ~16 km — đầu mối tàu, Westfield Hurstville và trung tâm bán lẻ-ẩm thực người Hoa lớn. Điều đó giữ nhu cầu thuê sâu từ gia đình, sinh viên và chuyên gia.',
    note: (c) => ({
      en: `Hurstville is a major southern-Sydney centre ~16 km from the CBD — a rail interchange, Westfield Hurstville and a large Chinese-Australian retail and dining hub. That breadth gives ${c.brand} deep, year-round tenant demand. NAC reads it as a transport-and-retail hold: the ~${c.yld}% yield is modest, but freehold AUD title and the rail-hub location support rentability and resale. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Hurstville là trung tâm lớn ở nam Sydney cách CBD ~16 km — đầu mối tàu, Westfield Hurstville và trung tâm bán lẻ-ẩm thực người Hoa lớn. Bề rộng đó mang lại cho ${c.brand} nhu cầu thuê sâu, quanh năm. NAC xem đây là khoản đầu tư theo giao thông & bán lẻ: lợi suất ~${c.yld}% khiêm tốn, nhưng sở hữu freehold bằng AUD và vị trí đầu mối tàu hỗ trợ cho thuê lẫn bán lại. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Hurstville rail interchange into the CBD', vi: 'Đầu mối tàu Hurstville vào CBD' },
      { en: 'Westfield Hurstville & a major dining hub at the door', vi: 'Westfield Hurstville & trung tâm ẩm thực lớn ngay cửa' },
      { en: 'Deep, multicultural tenant demand', vi: 'Nhu cầu thuê đa văn hóa, dồi dào' },
    ],
    feats: [
      { icon: '🚆', en: 'Hurstville rail interchange ~16 km from the CBD', vi: 'Đầu mối tàu Hurstville cách CBD ~16 km' },
      { icon: '🛍️', en: 'Westfield Hurstville & dining precinct', vi: 'Westfield Hurstville & khu ẩm thực' },
    ],
    conRisk: { en: 'High-density southern centre — plenty of stock, so aspect/floor matter', vi: 'Trung tâm phía nam mật độ cao — nhiều nguồn cung, cần chọn hướng/tầng' },
  },
  'Bankstown': {
    taglineEn: 'Metro-upgrade & university growth in the south-west',
    taglineVi: 'Nâng cấp Metro & tăng trưởng đại học ở tây nam',
    blurbEn: 'an address in Bankstown — a Canterbury-Bankstown centre being connected by the Sydney Metro, with a new Western Sydney University campus',
    blurbVi: 'một dự án tại Bankstown — trung tâm Canterbury-Bankstown đang được kết nối bằng Sydney Metro, với khuôn viên Đại học Western Sydney mới',
    marketEn: 'Bankstown is a major south-west Sydney centre being upgraded to the Sydney Metro, anchored by a new Western Sydney University city campus, ~20 km from the CBD. The Metro conversion plus a student campus are structural demand drivers in an affordable market.',
    marketVi: 'Bankstown là trung tâm lớn ở tây nam Sydney đang được nâng cấp lên Sydney Metro, với khuôn viên Đại học Western Sydney mới, cách CBD ~20 km. Việc chuyển đổi Metro cùng khuôn viên sinh viên là động lực cầu cấu trúc trong một thị trường giá hợp lý.',
    note: (c) => ({
      en: `Bankstown is a major south-west Sydney centre being upgraded to the Sydney Metro and anchored by a new Western Sydney University city campus, ~20 km from the CBD. Those two structural shifts plus affordability give ${c.brand} growing student and professional demand at a relatively higher ~${c.yld}% yield. NAC reads it as an infrastructure-and-yield growth play: freehold AUD title plus the Metro and campus underpin the case. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Bankstown là trung tâm lớn ở tây nam Sydney đang được nâng cấp lên Sydney Metro và có khuôn viên Đại học Western Sydney mới, cách CBD ~20 km. Hai thay đổi cấu trúc đó cùng giá hợp lý mang lại cho ${c.brand} nhu cầu sinh viên và chuyên gia đang tăng ở lợi suất ~${c.yld}% tương đối cao hơn. NAC xem đây là khoản đầu tư tăng trưởng theo hạ tầng & lợi suất: sở hữu freehold bằng AUD cùng Metro và khuôn viên đại học củng cố luận điểm. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Sydney Metro upgrade coming to Bankstown', vi: 'Nâng cấp Sydney Metro sắp tới Bankstown' },
      { en: 'New Western Sydney University city campus — student demand', vi: 'Khuôn viên Đại học Western Sydney mới — nhu cầu sinh viên' },
      { en: 'Affordable entry with a relatively higher yield', vi: 'Mức vào hợp lý với lợi suất tương đối cao hơn' },
    ],
    feats: [
      { icon: '🚇', en: 'Sydney Metro upgrade + WSU campus', vi: 'Nâng cấp Sydney Metro + khuôn viên WSU' },
      { icon: '🎓', en: 'New university campus drives student rental', vi: 'Khuôn viên đại học mới thúc đẩy thuê sinh viên' },
    ],
    conRisk: { en: 'South-west value market — growth led by infrastructure, not a blue-chip address', vi: 'Thị trường giá trị tây nam — tăng giá nhờ hạ tầng, không phải địa chỉ blue-chip' },
  },
  'Box Hill North': _boxHill,
  'Box Hill South': _boxHill,
  'South Melbourne': {
    taglineEn: 'Market-and-tram living on the CBD fringe',
    taglineVi: 'Sống cạnh chợ & tram ở rìa CBD',
    blurbEn: 'an address in South Melbourne — a heritage CBD-fringe suburb around the South Melbourne Market, ~3 km from the city and wrapped in trams',
    blurbVi: 'một dự án tại South Melbourne — khu di sản ven CBD quanh chợ South Melbourne Market, cách trung tâm ~3 km và phủ kín tram',
    marketEn: 'South Melbourne is a heritage CBD-fringe suburb built around the South Melbourne Market, ~3 km from the city with trams at the door and Albert Park nearby. It draws CBD professionals and families wanting an inner-city lifestyle off the high-rise grid.',
    marketVi: 'South Melbourne là khu di sản ven CBD quanh chợ South Melbourne Market, cách trung tâm ~3 km, tram ngay cửa và gần Albert Park. Khu này hút chuyên gia CBD và gia đình muốn lối sống nội đô ngoài lưới cao ốc.',
    note: (c) => ({
      en: `South Melbourne is a heritage CBD-fringe suburb built around the South Melbourne Market, ~3 km from the city with trams at the door and Albert Park close by. Its village-meets-city character gives ${c.brand} steady demand from CBD professionals and families. NAC reads it as a lifestyle and capital-growth hold: the ~${c.yld}% yield is workable and the inner location underpins both rentability and resale. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `South Melbourne là khu di sản ven CBD quanh chợ South Melbourne Market, cách trung tâm ~3 km, tram ngay cửa và gần Albert Park. Đặc trưng nửa làng phố nửa thành phố mang lại cho ${c.brand} nhu cầu ổn định từ chuyên gia CBD và gia đình. NAC xem đây là khoản đầu tư phong cách sống & tăng giá vốn: lợi suất ~${c.yld}% khả thi và vị trí nội đô hỗ trợ cả cho thuê lẫn bán lại. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Around the South Melbourne Market; trams at the door', vi: 'Quanh chợ South Melbourne Market; tram ngay cửa' },
      { en: '~3 km to the CBD; Albert Park & the bay nearby', vi: 'Cách CBD ~3 km; gần Albert Park & vịnh' },
      { en: 'Heritage, low-rise character on the city fringe', vi: 'Đặc trưng di sản, thấp tầng ở rìa thành phố' },
    ],
    feats: [
      { icon: '🛒', en: 'South Melbourne Market & tram lines', vi: 'Chợ South Melbourne Market & các tuyến tram' },
      { icon: '🏙️', en: 'CBD fringe, ~3 km from the city', vi: 'Rìa CBD, cách trung tâm ~3 km' },
    ],
    conRisk: { en: 'Boutique CBD-fringe market — premium pricing for the inner location', vi: 'Thị trường ven CBD nhỏ — giá cao cấp cho vị trí nội đô' },
  },
  'Melbourne CBD': {
    taglineEn: 'Free-tram-zone living in the heart of Melbourne',
    taglineVi: 'Sống trong vùng tram miễn phí giữa lòng Melbourne',
    blurbEn: 'a high-rise address in the Melbourne CBD — the city core, inside the Free Tram Zone and minutes from the universities and the Yarra',
    blurbVi: 'một dự án cao tầng tại Melbourne CBD — lõi thành phố, trong Vùng Tram Miễn Phí và cách các trường đại học, sông Yarra vài phút',
    marketEn: 'The Melbourne CBD is the city core — inside the Free Tram Zone, ringed by RMIT and the University of Melbourne, the laneway retail scene and the Yarra. It’s a dense, highly leasable student-and-professional rental market.',
    marketVi: 'Melbourne CBD là lõi thành phố — trong Vùng Tram Miễn Phí, bao quanh bởi RMIT và Đại học Melbourne, khu bán lẻ laneway và sông Yarra. Đây là thị trường cho thuê sinh viên-chuyên gia dày đặc, dễ cho thuê.',
    note: (c) => ({
      en: `The Melbourne CBD core sits inside the Free Tram Zone, ringed by RMIT and the University of Melbourne, the laneway retail scene and the Yarra. That density gives ${c.brand} one of the most leasable student-and-professional rental markets in the country. NAC reads it as a yield and liquidity play: the ~${c.yld}% yield is solid and the location keeps it leasable, though CBD high-rise supply means a well-chosen aspect matters for resale. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Lõi Melbourne CBD nằm trong Vùng Tram Miễn Phí, bao quanh bởi RMIT và Đại học Melbourne, khu bán lẻ laneway và sông Yarra. Mật độ đó mang lại cho ${c.brand} một trong những thị trường cho thuê sinh viên-chuyên gia dễ cho thuê nhất nước. NAC xem đây là khoản đầu tư lợi suất & thanh khoản: lợi suất ~${c.yld}% tốt và vị trí giúp luôn cho thuê được, dù nguồn cung cao tầng CBD đòi hỏi chọn hướng tốt khi bán lại. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'Inside the Free Tram Zone — walk/tram everywhere', vi: 'Trong Vùng Tram Miễn Phí — đi bộ/tram khắp nơi' },
      { en: 'Ringed by RMIT & the University of Melbourne — student demand', vi: 'Bao quanh bởi RMIT & Đại học Melbourne — nhu cầu sinh viên' },
      { en: 'Laneways, dining & the Yarra at the door', vi: 'Laneway, ẩm thực & sông Yarra ngay cửa' },
    ],
    feats: [
      { icon: '🚋', en: 'Free Tram Zone, walk to everything', vi: 'Vùng Tram Miễn Phí, đi bộ tới mọi nơi' },
      { icon: '🎓', en: 'RMIT & University of Melbourne nearby', vi: 'RMIT & Đại học Melbourne kề bên' },
    ],
    conRisk: { en: 'Dense CBD high-rise supply — aspect & floor are decisive for resale', vi: 'Nguồn cung cao tầng CBD dày đặc — hướng & tầng quyết định khi bán lại' },
  },
  'Alphington': {
    taglineEn: 'Riverside renewal living in Melbourne’s inner north-east',
    taglineVi: 'Sống tái thiết ven sông ở đông bắc nội đô Melbourne',
    blurbEn: 'an address in Alphington — a leafy, riverside inner-north-east Melbourne suburb on the Yarra, anchored by the YarraBend renewal and its own train station',
    blurbVi: 'một dự án tại Alphington — khu đông bắc nội đô Melbourne xanh mát, ven sông Yarra, với khu tái thiết YarraBend và ga tàu riêng',
    marketEn: 'Alphington is a leafy, riverside inner-north-east suburb on the Yarra ~6 km from the CBD, anchored by the YarraBend renewal of a former industrial site and served by its own Hurstbridge-line station. It draws families and professionals wanting green, well-connected inner living.',
    marketVi: 'Alphington là khu đông bắc nội đô xanh mát, ven sông Yarra cách CBD ~6 km, với khu tái thiết YarraBend trên nền công nghiệp cũ và ga riêng trên tuyến Hurstbridge. Khu này hút gia đình và chuyên gia muốn sống nội đô xanh, kết nối tốt.',
    note: (c) => ({
      en: `Alphington is a leafy, riverside inner-north-east suburb on the Yarra ~6 km from the CBD, anchored by the YarraBend renewal of a former industrial site and served by its own Hurstbridge-line station. That green, well-connected setting gives ${c.brand} steady family and professional demand. NAC reads it as a capital-growth and lifestyle hold: the ~${c.yld}% yield is modest, but freehold AUD title and the riverside location underpin durable value. Pricing here is a NAC estimate pending the developer price list.`,
      vi: `Alphington là khu đông bắc nội đô xanh mát, ven sông Yarra cách CBD ~6 km, với khu tái thiết YarraBend trên nền công nghiệp cũ và ga riêng trên tuyến Hurstbridge. Bối cảnh xanh, kết nối tốt đó mang lại cho ${c.brand} nhu cầu gia đình và chuyên gia ổn định. NAC xem đây là khoản đầu tư tăng giá vốn & phong cách sống: lợi suất ~${c.yld}% khiêm tốn, nhưng sở hữu freehold bằng AUD và vị trí ven sông giữ giá trị bền vững. Giá là NAC ước tính, chờ bảng giá CĐT.`,
    }),
    pros: [
      { en: 'On the Yarra — riverside parks & trails', vi: 'Ven sông Yarra — công viên & đường dạo ven sông' },
      { en: 'Alphington station on the Hurstbridge line', vi: 'Ga Alphington trên tuyến Hurstbridge' },
      { en: 'YarraBend renewal precinct, ~6 km from the CBD', vi: 'Khu tái thiết YarraBend, cách CBD ~6 km' },
    ],
    feats: [
      { icon: '🌊', en: 'Yarra River parklands at the door', vi: 'Công viên ven sông Yarra ngay cửa' },
      { icon: '🚆', en: 'Alphington station, ~6 km from the CBD', vi: 'Ga Alphington, cách CBD ~6 km' },
    ],
    conRisk: { en: 'Inner location — capital-growth led, with a modest rental yield', vi: 'Vị trí nội đô — thiên về tăng giá vốn, lợi suất cho thuê khiêm tốn' },
  },
});
// Macquarie Rise is a Macquarie Park project (parser kept the brand as suburb).
SUBURB_PROFILES['Macquarie Rise'] = SUBURB_PROFILES['Macquarie Park'];

// Universal lines reused across listings (kept short; suburb lines lead).
const uniPros = (c) => ([
  { en: `Freehold ${c.type} title, FIRB-approved for foreign buyers`, vi: `Sở hữu freehold ${c.typeVi}, được FIRB duyệt cho người nước ngoài` },
  { en: 'Australian rule of law & a stable AUD — a safe-haven hold', vi: 'Pháp quyền Úc & đồng AUD ổn định — tài sản trú ẩn an toàn' },
]);
const uniFeats = (c) => ([
  { icon: '💎', en: `Freehold ${c.type} — AUD-denominated, FIRB-approved`, vi: `${cap(c.typeVi)} sở hữu freehold — định giá AUD, FIRB duyệt` },
  { icon: '🛡️', en: 'Stable-currency, rule-of-law safe-haven hold', vi: 'Tài sản trú ẩn an toàn, tiền tệ ổn định' },
  { icon: '🎓', en: 'Education & skilled-migration pathway for families', vi: 'Lộ trình giáo dục & định cư tay nghề cho gia đình' },
]);
const uniCons = (c) => ([
  { en: `~${c.yld}% gross yield — a capital-growth hold, not a cash-flow play`, vi: `Lợi suất gộp ~${c.yld}% — kênh tăng giá vốn, không phải dòng tiền` },
  { en: 'Foreign buyers need FIRB approval + state surcharge duties', vi: 'Người nước ngoài cần FIRB + phụ phí thuế bang' },
  { en: '~9-hour flight from Vietnam; pricing indicative (NAC estimate)', vi: 'Cách Việt Nam ~9 giờ bay; giá tham khảo (NAC ước tính)' },
]);

// ── Notion read helpers ─────────────────────────────────────────────────────
const rt = (p) => { if (!p) return ''; if (p.title) return p.title.map(t => t.plain_text).join(''); if (p.rich_text) return p.rich_text.map(t => t.plain_text).join(''); return ''; };
const txt = (s) => ({ rich_text: s == null || s === '' ? [] : [{ text: { content: String(s).slice(0, 1990) } }] });

async function fetchAU() {
  let out = [], cursor;
  do {
    const res = await notion.databases.query({ database_id: DB, filter: { property: 'Hub Status', select: { equals: 'Live' } }, start_cursor: cursor, page_size: 100 });
    out = out.concat(res.results); cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out.filter(pg => (pg.properties['Country']?.select?.name || '') === 'Australia');
}

function compose(pg) {
  const p = pg.properties;
  const slug = rt(p['🔗 Slug']);
  const districtRaw = rt(p['📍 District']) || (rt(p['Region/City']).split(',')[0] || '').trim();
  const geoHay = `${rt(p['📍 District'])} ${rt(p['Region/City'])}`.toLowerCase();
  // City from the state/city token (some rows carry "Suburb, NSW 2113").
  const city = /\bvic\b|melbourne/i.test(geoHay) ? 'Melbourne' : 'Sydney';
  const hubType = p['🏨 Hub Type']?.select?.name || 'Condo';
  const brand = rt(p['✦ Brand']) || rt(p['Property Name']);
  const yld = ((p['Yield %']?.number || 0) * 100).toFixed(1);
  const [tEn, tVi] = typeWord[hubType] || typeWord.Condo;
  // Exact key first; else find a profile key contained in the district/region
  // string (handles "Macquarie Park, NSW 2113", "Green Square, Zetland NSW…").
  let suburb = districtRaw;
  let prof = SUBURB_PROFILES[suburb];
  if (!prof) {
    const key = Object.keys(SUBURB_PROFILES).find(k => geoHay.includes(k.toLowerCase()));
    if (key) { prof = SUBURB_PROFILES[key]; suburb = key; }
  }
  if (!prof) return { slug, skip: `no suburb profile for "${districtRaw}"` };
  const c = { brand, type: tEn, typeVi: tVi, yld, city, suburb };
  const note = prof.note(c);
  const pros = [...prof.pros, ...uniPros(c)].slice(0, 5);
  const cons = [uniCons(c)[0], uniCons(c)[1], prof.conRisk, uniCons(c)[2]].slice(0, 4);
  const feats = [...prof.feats, ...uniFeats(c)].slice(0, 5);
  const desc = {
    en: `${brand} is ${prof.blurbEn}. AUD-denominated and FIRB-approved for foreign buyers, it suits families pursuing Australian education, migration optionality, or stable-currency diversification. Pricing is a NAC estimate pending the developer price list.`,
    vi: `${brand} là ${prof.blurbVi}. Định giá AUD và được FIRB duyệt cho người nước ngoài; phù hợp gia đình hướng đến giáo dục Úc, lựa chọn định cư, hoặc đa dạng hóa tiền tệ ổn định. Giá là NAC ước tính, chờ bảng giá CĐT.`,
  };
  const props = {
    '🏷️ Tagline EN': txt(prof.taglineEn), '🏷️ Tagline VI': txt(prof.taglineVi),
    '💬 NAC Note EN': txt(note.en), '💬 NAC Note VI': txt(note.vi),
    '✅ Pros JSON': txt(JSON.stringify(pros)),
    '⚠️ Cons JSON': txt(JSON.stringify(cons)),
    '✨ Features JSON': txt(JSON.stringify(feats)),
    '🌍 Market EN': txt(prof.marketEn), '🌍 Market VI': txt(prof.marketVi),
    '✦ Brand Intro EN': txt(`${brand} — ${prof.blurbEn}.`), '✦ Brand Intro VI': txt(`${brand} — ${prof.blurbVi}.`),
    '📝 Desc EN': txt(desc.en), '📝 Desc VI': txt(desc.vi),
  };
  return { slug, suburb, city, brand, pageId: pg.id, props, preview: { tagline: prof.taglineEn, note: note.en, pros: pros.map(x => x.en), cons: cons.map(x => x.en), feats: feats.map(x => x.icon + ' ' + x.en) } };
}

(async () => {
  let rows = await fetchAU();
  if (SAMPLE.length) rows = rows.filter(pg => SAMPLE.includes(rt(pg.properties['🔗 Slug'])));
  console.log(`personalise-au — ${rows.length} AU listing(s)${DRY_RUN ? ' [DRY RUN]' : ''}${SAMPLE.length ? ` (sample: ${SAMPLE.join(', ')})` : ''}\n`);
  let done = 0, skip = 0;
  for (const pg of rows) {
    const r = compose(pg);
    if (r.skip) { console.log(`  ⤳ ${r.slug}: skipped (${r.skip})`); skip++; continue; }
    console.log(`━━━ ${r.slug} — ${r.brand} (${r.suburb}, ${r.city}) ━━━`);
    console.log(`  tagline: ${r.preview.tagline}`);
    console.log(`  note: ${r.preview.note}`);
    console.log(`  pros:\n   - ${r.preview.pros.join('\n   - ')}`);
    console.log(`  cons:\n   - ${r.preview.cons.join('\n   - ')}`);
    console.log(`  features:\n   - ${r.preview.feats.join('\n   - ')}\n`);
    if (!DRY_RUN) { await notion.pages.update({ page_id: r.pageId, properties: r.props }); }
    done++;
  }
  console.log(`\nDone. ${done} ${DRY_RUN ? 'previewed' : 'updated'}, ${skip} skipped (no profile).`);
})().catch(e => { console.error(e); process.exit(1); });
