// ─────────────────────────────────────────────────────────────────────────────
// kigaliPricing.ts
// Offline zone-based price predictor for Kigali deliveries.
// Works with no internet, no GPS — uses sector/neighbourhood name matching.
// Falls back gracefully when used alongside GPS/OSRM pricing.
// ─────────────────────────────────────────────────────────────────────────────

export interface ZonePrice {
  distKm: number;
  priceRwf: number;
  fromZone: string;
  toZone: string;
  confidence: 'exact' | 'near' | 'estimated';
}

// ── 1. ALL KIGALI SECTORS + KEY NEIGHBOURHOODS ────────────────────────────────
// Each zone has: name, aliases, lat/lng centre, district
interface KigaliZone {
  id: string;
  name: string;
  aliases: string[];          // common misspellings / local names
  lat: number;
  lng: number;
  district: 'Gasabo' | 'Kicukiro' | 'Nyarugenge';
}

export const KIGALI_ZONES: KigaliZone[] = [
  // ── GASABO ──────────────────────────────────────────────────────────────────
  { id: 'kimironko',    name: 'Kimironko',    aliases: ['kimironko', 'kimironco'],                          lat: -1.9365, lng: 30.1008, district: 'Gasabo' },
  { id: 'remera',       name: 'Remera',       aliases: ['remera', 'airport area', 'ikaze'],                 lat: -1.9594, lng: 30.1117, district: 'Gasabo' },
  { id: 'kacyiru',      name: 'Kacyiru',      aliases: ['kacyiru', 'kacyiru sud', 'kacyiru nord'],          lat: -1.9402, lng: 30.0682, district: 'Gasabo' },
  { id: 'kibagabaga',   name: 'Kibagabaga',   aliases: ['kibagabaga', 'kiba'],                              lat: -1.9247, lng: 30.0938, district: 'Gasabo' },
  { id: 'nduba',        name: 'Nduba',        aliases: ['nduba'],                                           lat: -1.8821, lng: 30.0538, district: 'Gasabo' },
  { id: 'rusororo',     name: 'Rusororo',     aliases: ['rusororo'],                                        lat: -1.8921, lng: 30.1138, district: 'Gasabo' },
  { id: 'bumbogo',      name: 'Bumbogo',      aliases: ['bumbogo'],                                         lat: -1.8738, lng: 30.0821, district: 'Gasabo' },
  { id: 'jali',         name: 'Jali',         aliases: ['jali'],                                            lat: -1.8638, lng: 30.1221, district: 'Gasabo' },
  { id: 'gikomero',     name: 'Gikomero',     aliases: ['gikomero'],                                        lat: -1.8538, lng: 30.1421, district: 'Gasabo' },
  { id: 'rutunga',      name: 'Rutunga',      aliases: ['rutunga'],                                         lat: -1.8938, lng: 30.0421, district: 'Gasabo' },
  { id: 'ndera',        name: 'Ndera',        aliases: ['ndera'],                                           lat: -1.9138, lng: 30.1321, district: 'Gasabo' },
  { id: 'gisozi',       name: 'Gisozi',       aliases: ['gisozi', 'gisozi hill'],                           lat: -1.9238, lng: 30.0538, district: 'Gasabo' },
  { id: 'kinyinya',     name: 'Kinyinya',     aliases: ['kinyinya'],                                        lat: -1.9138, lng: 30.0838, district: 'Gasabo' },
  { id: 'jabana',       name: 'Jabana',       aliases: ['jabana'],                                          lat: -1.9038, lng: 30.1438, district: 'Gasabo' },
  { id: 'gatsata',      name: 'Gatsata',      aliases: ['gatsata'],                                         lat: -1.9338, lng: 30.0438, district: 'Gasabo' },
  { id: 'gikomero2',    name: 'Gikomero',     aliases: ['gikomero'],                                        lat: -1.8538, lng: 30.1421, district: 'Gasabo' },

  // ── KICUKIRO ─────────────────────────────────────────────────────────────────
  { id: 'gikondo',      name: 'Gikondo',      aliases: ['gikondo', 'gikondo ind'],                          lat: -1.9838, lng: 30.0621, district: 'Kicukiro' },
  { id: 'niboye',       name: 'Niboye',       aliases: ['niboye'],                                          lat: -1.9938, lng: 30.0721, district: 'Kicukiro' },
  { id: 'kagarama',     name: 'Kagarama',     aliases: ['kagarama'],                                        lat: -1.9838, lng: 30.0821, district: 'Kicukiro' },
  { id: 'gahanga',      name: 'Gahanga',      aliases: ['gahanga'],                                         lat: -2.0138, lng: 30.0921, district: 'Kicukiro' },
  { id: 'kigarama',     name: 'Kigarama',     aliases: ['kigarama'],                                        lat: -1.9738, lng: 30.1021, district: 'Kicukiro' },
  { id: 'masaka',       name: 'Masaka',       aliases: ['masaka'],                                          lat: -2.0238, lng: 30.0738, district: 'Kicukiro' },
  { id: 'kanombe',      name: 'Kanombe',      aliases: ['kanombe', 'military hospital'],                    lat: -1.9638, lng: 30.1321, district: 'Kicukiro' },
  { id: 'kicukiro',     name: 'Kicukiro',     aliases: ['kicukiro centre', 'kicukiro'],                     lat: -1.9938, lng: 30.0538, district: 'Kicukiro' },
  { id: 'nyarugunga',   name: 'Nyarugunga',   aliases: ['nyarugunga'],                                      lat: -1.9538, lng: 30.1221, district: 'Kicukiro' },
  { id: 'busanza',      name: 'Busanza',      aliases: ['busanza'],                                         lat: -1.9438, lng: 30.1421, district: 'Kicukiro' },
  { id: 'rwampara',     name: 'Rwampara',     aliases: ['rwampara'],                                        lat: -2.0038, lng: 30.1021, district: 'Kicukiro' },

  // ── NYARUGENGE ───────────────────────────────────────────────────────────────
  { id: 'cbd',          name: 'CBD / Downtown', aliases: ['cbd', 'centre ville', 'downtown', 'ville', 'kigali city', 'town', 'centre'],  lat: -1.9441, lng: 30.0619, district: 'Nyarugenge' },
  { id: 'nyamirambo',   name: 'Nyamirambo',   aliases: ['nyamirambo', 'nyamirambo mosque'],                 lat: -1.9738, lng: 30.0438, district: 'Nyarugenge' },
  { id: 'muhima',       name: 'Muhima',       aliases: ['muhima'],                                          lat: -1.9538, lng: 30.0538, district: 'Nyarugenge' },
  { id: 'nyakabanda',   name: 'Nyakabanda',   aliases: ['nyakabanda'],                                      lat: -1.9638, lng: 30.0438, district: 'Nyarugenge' },
  { id: 'gitega',       name: 'Gitega',       aliases: ['gitega'],                                          lat: -1.9638, lng: 30.0538, district: 'Nyarugenge' },
  { id: 'biryogo',      name: 'Biryogo',      aliases: ['biryogo'],                                         lat: -1.9538, lng: 30.0438, district: 'Nyarugenge' },
  { id: 'rwezamenyo',   name: 'Rwezamenyo',   aliases: ['rwezamenyo'],                                      lat: -1.9838, lng: 30.0338, district: 'Nyarugenge' },
  { id: 'mageragere',   name: 'Mageragere',   aliases: ['mageragere'],                                      lat: -1.9938, lng: 30.0138, district: 'Nyarugenge' },
  { id: 'kimisagara',   name: 'Kimisagara',   aliases: ['kimisagara'],                                      lat: -1.9538, lng: 30.0338, district: 'Nyarugenge' },
  { id: 'nyarugenge',   name: 'Nyarugenge',   aliases: ['nyarugenge sector'],                               lat: -1.9538, lng: 30.0638, district: 'Nyarugenge' },
  { id: 'kiyovu',       name: 'Kiyovu',       aliases: ['kiyovu'],                                          lat: -1.9441, lng: 30.0538, district: 'Nyarugenge' },

  // ── KEY LANDMARKS (bonus — very commonly used as locations) ──────────────────
  { id: 'kkia',         name: 'Kigali Airport', aliases: ['airport', 'kkia', 'international airport', 'aeroport'], lat: -1.9686, lng: 30.1395, district: 'Kicukiro' },
  { id: 'chuk',         name: 'CHUK Hospital',  aliases: ['chuk', 'chu kigali', 'university hospital'],    lat: -1.9502, lng: 30.0603, district: 'Nyarugenge' },
  { id: 'kg_convention',name: 'Kigali Convention', aliases: ['convention centre', 'convention center', 'kcc'], lat: -1.9530, lng: 30.0935, district: 'Gasabo' },
  { id: 'nyabugogo',    name: 'Nyabugogo',      aliases: ['nyabugogo', 'taxi park', 'nyabugogo bus'],       lat: -1.9380, lng: 30.0480, district: 'Nyarugenge' },
  { id: 'sonatubes',    name: 'Sonatubes',      aliases: ['sonatubes'],                                     lat: -1.9780, lng: 30.0680, district: 'Kicukiro' },
  { id: 'gisimenti',    name: 'Gisimenti',      aliases: ['gisimenti'],                                     lat: -1.9480, lng: 30.0980, district: 'Gasabo' },
  { id: 'st_familia',   name: 'Sainte Famille', aliases: ['sainte famille', 'st famille', 'saint family'],  lat: -1.9500, lng: 30.0600, district: 'Nyarugenge' },
  { id: 'rbc',          name: 'RBC / Gikondo',  aliases: ['rbc', 'rwanda biomedical'],                     lat: -1.9780, lng: 30.0620, district: 'Kicukiro' },
  { id: 'norrsken',     name: 'Norrsken / KIC',  aliases: ['norrsken', 'kic', 'kigali innovation city'],   lat: -1.9330, lng: 30.0980, district: 'Gasabo' },
];

// ── 2. HAVERSINE DISTANCE (straight line km) ──────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Road factor — Kigali roads are hilly, actual road distance ≈ 1.35× straight line
const ROAD_FACTOR = 1.35;

// ── 3. FUZZY ZONE MATCHER ─────────────────────────────────────────────────────
// Finds the best matching zone for any free-text location string
function normalise(s: string): string {
  return s.toLowerCase()
    .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function scoreMatch(query: string, zone: KigaliZone): number {
  const q = normalise(query);
  const name = normalise(zone.name);
  // Exact match on any alias
  for (const alias of zone.aliases) {
    const a = normalise(alias);
    if (q === a || q.includes(a) || a.includes(q)) return 100;
  }
  // Partial match on zone name
  if (name.includes(q) || q.includes(name)) return 80;
  // Word-level match
  const qWords = q.split(' ');
  const nWords = name.split(' ');
  const shared = qWords.filter(w => w.length > 2 && nWords.some(n => n.includes(w) || w.includes(n)));
  if (shared.length > 0) return 60 + shared.length * 5;
  // Starts with same 4 chars
  if (q.length >= 4 && name.startsWith(q.slice(0, 4))) return 50;
  return 0;
}

export function findZone(locationText: string): { zone: KigaliZone; confidence: 'exact' | 'near' | 'estimated' } | null {
  if (!locationText || locationText.trim().length < 2) return null;

  // Deduplicated zones only
  const uniqueZones = KIGALI_ZONES.filter((z, i, arr) => arr.findIndex(z2 => z2.id === z.id) === i);

  const scored = uniqueZones.map(zone => ({ zone, score: scoreMatch(locationText, zone) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  const best = scored[0];
  const confidence = best.score >= 100 ? 'exact' : best.score >= 60 ? 'near' : 'estimated';
  return { zone: best.zone, confidence };
}

// ── 4. PRICE CALCULATOR ───────────────────────────────────────────────────────
const BASE_RATE_PER_KM = 350;   // RWF per km
const BASE_FIXED       = 800;   // RWF fixed base
const MIN_PRICE        = 1500;  // RWF minimum
const RUSH_MULTIPLIER  = 1.20;
const RAIN_MULTIPLIER  = 1.15;
const LARGE_MULTIPLIER = 1.30;
const SMALL_MULTIPLIER = 0.85;
const RAPID_MULTIPLIER = 1.20;
const POOR_ROAD_MULT   = 1.10;

export interface OfflinePriceInput {
  senderLocation:   string;
  receiverLocation: string;
  packageSize?:     'small' | 'medium' | 'large';
  isRushHour?:      boolean;
  isRaining?:       boolean;
  poorRoads?:       boolean;
  isRapid?:         boolean;
}

export interface OfflinePriceResult {
  priceRwf:      number;
  distKm:        number;
  fromZone:      string;
  toZone:        string;
  confidence:    'exact' | 'near' | 'estimated';
  breakdown: {
    baseFare:    number;
    distFare:    number;
    multipliers: string[];
  };
}

export function offlinePrice(input: OfflinePriceInput): OfflinePriceResult | null {
  const fromMatch = findZone(input.senderLocation);
  const toMatch   = findZone(input.receiverLocation);

  if (!fromMatch || !toMatch) return null;

  const { zone: from } = fromMatch;
  const { zone: to }   = toMatch;

  // Straight-line distance × road factor
  const straightKm = haversine(from.lat, from.lng, to.lat, to.lng);
  const roadKm     = Math.max(straightKm * ROAD_FACTOR, 0.8);

  // Price calculation
  let price = BASE_FIXED + (roadKm * BASE_RATE_PER_KM);
  const multipliers: string[] = [];

  if (input.isRushHour)                    { price *= RUSH_MULTIPLIER;  multipliers.push('🕐 Rush hour +20%');   }
  if (input.isRaining)                     { price *= RAIN_MULTIPLIER;  multipliers.push('🌧️ Rain +15%');        }
  if (input.poorRoads)                     { price *= POOR_ROAD_MULT;   multipliers.push('🪨 Poor roads +10%');  }
  if (input.packageSize === 'large')       { price *= LARGE_MULTIPLIER; multipliers.push('📦 Large size +30%'); }
  if (input.packageSize === 'small')       { price *= SMALL_MULTIPLIER; multipliers.push('📦 Small −15%');      }
  if (input.isRapid)                       { price *= RAPID_MULTIPLIER; multipliers.push('⚡ Rapid +20%');       }

  // Confidence penalty — if zone match is weak, add a small buffer
  if (fromMatch.confidence === 'estimated' || toMatch.confidence === 'estimated') {
    price *= 1.05;
  }

  const finalPrice = Math.max(Math.round(price / 100) * 100, MIN_PRICE);

  // Worst confidence of the two determines overall confidence
  const confidenceRank = { exact: 3, near: 2, estimated: 1 };
  const overallConf = confidenceRank[fromMatch.confidence] <= confidenceRank[toMatch.confidence]
    ? fromMatch.confidence : toMatch.confidence;

  return {
    priceRwf:   finalPrice,
    distKm:     Math.round(roadKm * 10) / 10,
    fromZone:   from.name,
    toZone:     to.name,
    confidence: overallConf,
    breakdown: {
      baseFare:    BASE_FIXED,
      distFare:    Math.round(roadKm * BASE_RATE_PER_KM),
      multipliers,
    },
  };
}

// ── 5. RUSH HOUR CHECK ────────────────────────────────────────────────────────
export function isOfflineRushHour(): boolean {
  const h = new Date().getHours();
  return (h >= 7 && h <= 9) || (h >= 17 && h <= 19);
}

// ── 6. RACE: offline vs GPS — whichever wins within timeout ──────────────────
// Use this in SenderOrderView to run both methods simultaneously.
// offlineResult fires instantly; gpsResult fires when OSRM responds (or times out).
export interface RaceResult {
  price:      number;
  distKm:     number;
  source:     'gps' | 'offline';
  fromZone?:  string;
  toZone?:    string;
  confidence?: 'exact' | 'near' | 'estimated';
}

export async function racePriceEstimate(
  offlineInput: OfflinePriceInput,
  gpsPromise: Promise<number>,        // resolves to GPS-based price
  gpsDistPromise: Promise<number>,    // resolves to GPS distance km
  timeoutMs = 5000
): Promise<RaceResult> {
  // 1. Offline result — instant
  const offline = offlinePrice(offlineInput);

  // 2. Race GPS against timeout
  const timeoutPromise = new Promise<null>(res => setTimeout(() => res(null), timeoutMs));

  try {
    const gpsWinner = await Promise.race([
      gpsPromise.then(price => ({ price, type: 'gps' as const })),
      timeoutPromise.then(() => null),
    ]);

    if (gpsWinner) {
      const dist = await Promise.race([gpsDistPromise, timeoutPromise]).catch(() => offline?.distKm ?? 5);
      return {
        price:  gpsWinner.price,
        distKm: typeof dist === 'number' ? dist : (offline?.distKm ?? 5),
        source: 'gps',
      };
    }
  } catch { /* GPS failed — fall through to offline */ }

  // 3. GPS timed out or failed — use offline
  if (offline) {
    return {
      price:      offline.priceRwf,
      distKm:     offline.distKm,
      source:     'offline',
      fromZone:   offline.fromZone,
      toZone:     offline.toZone,
      confidence: offline.confidence,
    };
  }

  // 4. Both failed — return safe default
  return { price: 3500, distKm: 5, source: 'offline' };
}