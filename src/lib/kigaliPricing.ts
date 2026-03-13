// kigaliPricing.ts — pure TypeScript, NO JSX
// Offline zone-based price predictor for Kigali deliveries.

export interface ZonePrice {
  distKm: number;
  priceRwf: number;
  fromZone: string;
  toZone: string;
  confidence: 'exact' | 'near' | 'estimated';
}

interface KigaliZone {
  id: string;
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
  district: 'Gasabo' | 'Kicukiro' | 'Nyarugenge';
}

export const KIGALI_ZONES: KigaliZone[] = [
  // ── GASABO ──────────────────────────────────────────────────────────────────
  { id: 'kimironko',  name: 'Kimironko',      aliases: ['kimironko', 'kimironco'],                               lat: -1.9365, lng: 30.1008, district: 'Gasabo' },
  { id: 'remera',     name: 'Remera',         aliases: ['remera', 'airport area', 'ikaze'],                      lat: -1.9594, lng: 30.1117, district: 'Gasabo' },
  { id: 'kacyiru',   name: 'Kacyiru',        aliases: ['kacyiru', 'kacyiru sud', 'kacyiru nord'],               lat: -1.9402, lng: 30.0682, district: 'Gasabo' },
  { id: 'kibagabaga',name: 'Kibagabaga',     aliases: ['kibagabaga', 'kiba'],                                    lat: -1.9247, lng: 30.0938, district: 'Gasabo' },
  { id: 'nduba',      name: 'Nduba',          aliases: ['nduba'],                                                lat: -1.8821, lng: 30.0538, district: 'Gasabo' },
  { id: 'rusororo',   name: 'Rusororo',       aliases: ['rusororo'],                                             lat: -1.8921, lng: 30.1138, district: 'Gasabo' },
  { id: 'bumbogo',    name: 'Bumbogo',        aliases: ['bumbogo'],                                              lat: -1.8738, lng: 30.0821, district: 'Gasabo' },
  { id: 'jali',       name: 'Jali',           aliases: ['jali'],                                                 lat: -1.8638, lng: 30.1221, district: 'Gasabo' },
  { id: 'gikomero',   name: 'Gikomero',       aliases: ['gikomero'],                                             lat: -1.8538, lng: 30.1421, district: 'Gasabo' },
  { id: 'rutunga',    name: 'Rutunga',        aliases: ['rutunga'],                                              lat: -1.8938, lng: 30.0421, district: 'Gasabo' },
  { id: 'ndera',      name: 'Ndera',          aliases: ['ndera'],                                                lat: -1.9138, lng: 30.1321, district: 'Gasabo' },
  { id: 'gisozi',     name: 'Gisozi',         aliases: ['gisozi', 'gisozi hill'],                                lat: -1.9238, lng: 30.0538, district: 'Gasabo' },
  { id: 'kinyinya',   name: 'Kinyinya',       aliases: ['kinyinya'],                                             lat: -1.9138, lng: 30.0838, district: 'Gasabo' },
  { id: 'jabana',     name: 'Jabana',         aliases: ['jabana'],                                               lat: -1.9038, lng: 30.1438, district: 'Gasabo' },
  { id: 'gatsata',    name: 'Gatsata',        aliases: ['gatsata'],                                              lat: -1.9338, lng: 30.0438, district: 'Gasabo' },
  { id: 'gisimenti',  name: 'Gisimenti',      aliases: ['gisimenti'],                                            lat: -1.9480, lng: 30.0980, district: 'Gasabo' },
  { id: 'norrsken',   name: 'Norrsken / KIC', aliases: ['norrsken', 'kic', 'kigali innovation city'],            lat: -1.9330, lng: 30.0980, district: 'Gasabo' },
  { id: 'kg_conv',    name: 'Convention Centre', aliases: ['convention centre', 'convention center', 'kcc'],    lat: -1.9530, lng: 30.0935, district: 'Gasabo' },

  // ── KICUKIRO ─────────────────────────────────────────────────────────────────
  { id: 'gikondo',    name: 'Gikondo',        aliases: ['gikondo', 'gikondo ind', 'rbc', 'rwanda biomedical'],  lat: -1.9838, lng: 30.0621, district: 'Kicukiro' },
  { id: 'niboye',     name: 'Niboye',         aliases: ['niboye'],                                              lat: -1.9938, lng: 30.0721, district: 'Kicukiro' },
  { id: 'kagarama',   name: 'Kagarama',       aliases: ['kagarama'],                                            lat: -1.9838, lng: 30.0821, district: 'Kicukiro' },
  { id: 'gahanga',    name: 'Gahanga',        aliases: ['gahanga'],                                             lat: -2.0138, lng: 30.0921, district: 'Kicukiro' },
  { id: 'kigarama',   name: 'Kigarama',       aliases: ['kigarama'],                                            lat: -1.9738, lng: 30.1021, district: 'Kicukiro' },
  { id: 'masaka',     name: 'Masaka',         aliases: ['masaka'],                                              lat: -2.0238, lng: 30.0738, district: 'Kicukiro' },
  { id: 'kanombe',    name: 'Kanombe',        aliases: ['kanombe', 'military hospital'],                         lat: -1.9638, lng: 30.1321, district: 'Kicukiro' },
  { id: 'kicukiro',   name: 'Kicukiro',       aliases: ['kicukiro centre', 'kicukiro'],                         lat: -1.9938, lng: 30.0538, district: 'Kicukiro' },
  { id: 'nyarugunga', name: 'Nyarugunga',     aliases: ['nyarugunga'],                                          lat: -1.9538, lng: 30.1221, district: 'Kicukiro' },
  { id: 'busanza',    name: 'Busanza',        aliases: ['busanza'],                                             lat: -1.9438, lng: 30.1421, district: 'Kicukiro' },
  { id: 'rwampara',   name: 'Rwampara',       aliases: ['rwampara'],                                            lat: -2.0038, lng: 30.1021, district: 'Kicukiro' },
  { id: 'sonatubes',  name: 'Sonatubes',      aliases: ['sonatubes'],                                           lat: -1.9780, lng: 30.0680, district: 'Kicukiro' },
  { id: 'kkia',       name: 'Kigali Airport', aliases: ['airport', 'kkia', 'international airport', 'aeroport'],lat: -1.9686, lng: 30.1395, district: 'Kicukiro' },

  // ── NYARUGENGE ───────────────────────────────────────────────────────────────
  { id: 'cbd',        name: 'CBD / Downtown', aliases: ['cbd', 'centre ville', 'downtown', 'ville', 'kigali city', 'town', 'centre'], lat: -1.9441, lng: 30.0619, district: 'Nyarugenge' },
  { id: 'nyamirambo', name: 'Nyamirambo',    aliases: ['nyamirambo', 'nyamirambo mosque'],                      lat: -1.9738, lng: 30.0438, district: 'Nyarugenge' },
  { id: 'muhima',     name: 'Muhima',         aliases: ['muhima'],                                              lat: -1.9538, lng: 30.0538, district: 'Nyarugenge' },
  { id: 'nyakabanda', name: 'Nyakabanda',     aliases: ['nyakabanda'],                                          lat: -1.9638, lng: 30.0438, district: 'Nyarugenge' },
  { id: 'gitega',     name: 'Gitega',         aliases: ['gitega'],                                              lat: -1.9638, lng: 30.0538, district: 'Nyarugenge' },
  { id: 'biryogo',    name: 'Biryogo',        aliases: ['biryogo'],                                             lat: -1.9538, lng: 30.0438, district: 'Nyarugenge' },
  { id: 'rwezamenyo', name: 'Rwezamenyo',     aliases: ['rwezamenyo'],                                          lat: -1.9838, lng: 30.0338, district: 'Nyarugenge' },
  { id: 'mageragere', name: 'Mageragere',     aliases: ['mageragere'],                                          lat: -1.9938, lng: 30.0138, district: 'Nyarugenge' },
  { id: 'kimisagara', name: 'Kimisagara',     aliases: ['kimisagara'],                                          lat: -1.9538, lng: 30.0338, district: 'Nyarugenge' },
  { id: 'nyarugenge', name: 'Nyarugenge',     aliases: ['nyarugenge sector'],                                   lat: -1.9538, lng: 30.0638, district: 'Nyarugenge' },
  { id: 'kiyovu',     name: 'Kiyovu',         aliases: ['kiyovu'],                                              lat: -1.9441, lng: 30.0538, district: 'Nyarugenge' },
  { id: 'chuk',       name: 'CHUK Hospital',  aliases: ['chuk', 'chu kigali', 'university hospital'],           lat: -1.9502, lng: 30.0603, district: 'Nyarugenge' },
  { id: 'nyabugogo',  name: 'Nyabugogo',      aliases: ['nyabugogo', 'taxi park', 'nyabugogo bus'],             lat: -1.9380, lng: 30.0480, district: 'Nyarugenge' },
  { id: 'st_familia', name: 'Sainte Famille', aliases: ['sainte famille', 'st famille', 'saint family'],        lat: -1.9500, lng: 30.0600, district: 'Nyarugenge' },
];

// ── HAVERSINE ─────────────────────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const ROAD_FACTOR = 1.35;

// ── NORMALISE ─────────────────────────────────────────────────────────────────
function normalise(s: string): string {
  return s.toLowerCase()
    .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ── ROAD CODE RESOLVER ────────────────────────────────────────────────────────
// KG/KN/KK road codes → enriched with district name for better matching
function resolveRoadCode(text: string): string {
  const upper = text.toUpperCase();
  if (/KN\s*\d/.test(upper)) return text + ' Kacyiru Gasabo';
  if (/KG\s*\d/.test(upper)) return text + ' Kacyiru Gasabo';
  if (/KK\s*\d/.test(upper)) return text + ' Kicukiro';
  if (/RN\s*\d/.test(upper)) return text + ' Nyarugenge';
  return text;
}

// ── FUZZY MATCHER ─────────────────────────────────────────────────────────────
function scoreMatch(query: string, zone: KigaliZone): number {
  const q = normalise(query);
  const name = normalise(zone.name);
  for (const alias of zone.aliases) {
    const a = normalise(alias);
    if (q === a || q.includes(a) || a.includes(q)) return 100;
  }
  if (name.includes(q) || q.includes(name)) return 80;
  const qWords = q.split(' ');
  const nWords = name.split(' ');
  const shared = qWords.filter(w => w.length > 2 && nWords.some(n => n.includes(w) || w.includes(n)));
  if (shared.length > 0) return 60 + shared.length * 5;
  if (q.length >= 4 && name.startsWith(q.slice(0, 4))) return 50;
  return 0;
}

export function findZone(locationText: string): { zone: KigaliZone; confidence: 'exact' | 'near' | 'estimated' } | null {
  if (!locationText || locationText.trim().length < 2) return null;

  const enriched = resolveRoadCode(locationText);
  const uniqueZones = KIGALI_ZONES.filter((z, i, arr) => arr.findIndex(z2 => z2.id === z.id) === i);

  const scored = uniqueZones
    .map(zone => ({ zone, score: scoreMatch(enriched, zone) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // District-level fallback
    const lower = locationText.toLowerCase();
    const fallback = uniqueZones.find(z =>
      (lower.includes('gasabo')     && z.id === 'kacyiru')  ||
      (lower.includes('kicukiro')   && z.id === 'kicukiro') ||
      (lower.includes('nyarugenge') && z.id === 'cbd')
    );
    if (fallback) return { zone: fallback, confidence: 'estimated' };
    return null;
  }

  const best = scored[0];
  const confidence = best.score >= 100 ? 'exact' : best.score >= 60 ? 'near' : 'estimated';
  return { zone: best.zone, confidence };
}

// ── PRICE CONSTANTS ───────────────────────────────────────────────────────────
const BASE_RATE_PER_KM = 350;
const BASE_FIXED       = 800;
const MIN_PRICE        = 1500;

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
  priceRwf:   number;
  distKm:     number;
  fromZone:   string;
  toZone:     string;
  confidence: 'exact' | 'near' | 'estimated';
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

  const straightKm = haversine(from.lat, from.lng, to.lat, to.lng);
  const roadKm     = Math.max(straightKm * ROAD_FACTOR, 0.8);

  let price = BASE_FIXED + roadKm * BASE_RATE_PER_KM;
  const multipliers: string[] = [];

  if (input.isRushHour)              { price *= 1.20; multipliers.push('🕐 Rush hour +20%');   }
  if (input.isRaining)               { price *= 1.15; multipliers.push('🌧️ Rain +15%');        }
  if (input.poorRoads)               { price *= 1.10; multipliers.push('🪨 Poor roads +10%');  }
  if (input.packageSize === 'large') { price *= 1.30; multipliers.push('📦 Large size +30%'); }
  if (input.packageSize === 'small') { price *= 0.85; multipliers.push('📦 Small −15%');      }
  if (input.isRapid)                 { price *= 1.20; multipliers.push('⚡ Rapid +20%');       }

  if (fromMatch.confidence === 'estimated' || toMatch.confidence === 'estimated') {
    price *= 1.05;
  }

  const finalPrice = Math.max(Math.round(price / 100) * 100, MIN_PRICE);

  const rank = { exact: 3, near: 2, estimated: 1 };
  const overallConf = rank[fromMatch.confidence] <= rank[toMatch.confidence]
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

export function isOfflineRushHour(): boolean {
  const h = new Date().getHours();
  return (h >= 7 && h <= 9) || (h >= 17 && h <= 19);
}