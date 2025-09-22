#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const APPLE_URL = 'https://rss.applemarketingtools.com/api/v2/us/music/most-played/100/songs.json';
const WDQS_URL = 'https://query.wikidata.org/sparql';

const OUT_DIR = path.join(process.cwd(), 'pref_data');
const PUBLIC_OUT_DIR = path.join(process.cwd(), 'public', 'pref_data');

async function ensureDirs() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_OUT_DIR, { recursive: true });
}

function nowIso() { return new Date().toISOString(); }

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'User-Agent': 'Rhythmoji PrefData/1.0 (+https://github.com/nmaffly/rhythmoji-generator)',
      'Accept': 'application/json',
      ...(opts.headers || {})
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// --- Wikidata lightweight fallback for artist image (P18) ---
function commonsFromFileName(fileName, width = 256) {
  if (!fileName) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=${width}`;
}

async function wikidataImageForName(name) {
  try {
    // Prefer exact-label match via WDQS, limited to humans or musical groups with relevant occupations
    const q = `SELECT ?file WHERE {\n  BIND(${JSON.stringify(name)}@en AS ?targetLabel)\n  {\n    ?item rdfs:label ?targetLabel.\n    ?item wdt:P31/wdt:P279* wd:Q5.  # human\n    ?item wdt:P106 ?occ. ?occ rdfs:label ?occLabel FILTER(LANG(?occLabel)='en').\n    FILTER(REGEX(?occLabel, '(singer|musician|rapper|DJ|disc jockey|singer-songwriter|music producer|composer)', 'i')).\n  } UNION {\n    ?item rdfs:label ?targetLabel.\n    ?item wdt:P31/wdt:P279* wd:Q215380.  # musical group\n  }\n  ?item wdt:P18 ?file.\n} LIMIT 1`;
    const url = new URL('https://query.wikidata.org/sparql');
    url.searchParams.set('query', q);
    url.searchParams.set('format', 'json');
    const res = await fetch(url.toString(), { headers: { 'Accept': 'application/sparql-results+json', 'User-Agent': 'Rhythmoji PrefData/1.0' } });
    if (res.ok) {
      const json = await res.json();
      const file = json?.results?.bindings?.[0]?.file?.value;
      if (file) return commonsFromFileName(file.split('/').pop());
    }
  } catch {}
  try {
    // Fallback: wbsearchentities then wbgetentities for P18
    const searchUrl = new URL('https://www.wikidata.org/w/api.php');
    searchUrl.searchParams.set('action', 'wbsearchentities');
    searchUrl.searchParams.set('search', name);
    searchUrl.searchParams.set('language', 'en');
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('limit', '1');
    const s = await fetchJson(searchUrl.toString());
    const id = s?.search?.[0]?.id;
    if (!id) return null;
    const entityUrl = new URL('https://www.wikidata.org/w/api.php');
    entityUrl.searchParams.set('action', 'wbgetentities');
    entityUrl.searchParams.set('ids', id);
    entityUrl.searchParams.set('props', 'claims');
    entityUrl.searchParams.set('format', 'json');
    const e = await fetchJson(entityUrl.toString());
    const claims = e?.entities?.[id]?.claims || {};
    const p18 = claims.P18?.[0]?.mainsnak?.datavalue?.value; // filename
    return commonsFromFileName(p18) || null;
  } catch {
    return null;
  }
}

async function enrichTopArtistImagesWikidata(artists) {
  const enriched = [];
  for (const a of artists) {
    const name = a.name || '';
    const eligible = name.length >= 3 && /\s/.test(name); // avoid 1-2 char or single-token ambiguous names
    const img = eligible ? await wikidataImageForName(name) : null;
    enriched.push({ ...a, image_url: img || a.image_url || null });
    // brief pause to be polite
    await new Promise(r => setTimeout(r, 300));
  }
  return enriched;
}

function splitArtistCredits(raw) {
  if (!raw) return [];
  let s = String(raw);
  // Remove common featuring patterns in parentheses
  s = s.replace(/\(.*?feat\.?[^)]*\)/gi, '');
  // Normalize separators to a pipe
  s = s
    .replace(/\s+&\s+/g, '|')
    .replace(/\s*,\s*/g, '|')
    .replace(/\s+x\s+/gi, '|')
    .replace(/\s+X\s+/g, '|')
    .replace(/\s+with\s+/gi, '|')
    .replace(/\s+and\s+/gi, '|')
    .replace(/\s*feat\.?\s*/gi, '|')
    .replace(/\s*featuring\s*/gi, '|')
    .replace(/\//g, '|');
  return s
    .split('|')
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => t.replace(/^[-–]+/, '').replace(/[-–]+$/, '').trim());
}

function normalizeArtistName(name) {
  return name.trim().replace(/\s+/g, ' ');
}

async function updateAppleTopSongs() {
  const data = await fetchJson(APPLE_URL);
  const results = data?.feed?.results || [];
  const songs = results.map((r) => ({
    id: String(r.id ?? r.url ?? r.name),
    title: r.name,
    artist: r.artistName,
    image: r.artworkUrl100?.replace(/100x100bb\.jpg$/, '200x200bb.jpg') || r.artworkUrl100 || null,
    url: r.url
  }));
  // Enrich with album info via iTunes Lookup (batch by ids)
  const ids = songs.map(s => s.id).filter(Boolean);
  const lookupUrl = new URL('https://itunes.apple.com/lookup');
  lookupUrl.searchParams.set('id', ids.join(','));
  lookupUrl.searchParams.set('country', 'us');
  let byId = new Map();
  try {
    const lookup = await fetchJson(lookupUrl.toString());
    const items = lookup?.results || [];
    for (const it of items) {
      const tid = String(it.trackId || it.collectionId || '');
      if (tid) byId.set(tid, {
        albumId: it.collectionId || null,
        album: it.collectionName || null,
        primaryArtist: it.artistName || null,
      });
    }
  } catch {}
  const songsEnriched = songs.map(s => {
    const extra = byId.get(String(s.id)) || {};
    return { ...s, albumId: extra.albumId || null, album: extra.album || null, primaryArtist: extra.primaryArtist || s.artist };
  });

  // Enforce album uniqueness per primary artist (no multiple songs from same album per artist)
  const artistAlbumSeen = new Map(); // artistKey -> Set(albumKey)
  const uniqueSongs = [];
  for (const s of songsEnriched) {
    const artistKey = (s.primaryArtist || s.artist || '').toLowerCase();
    const albumKey = s.albumId ? `id:${s.albumId}` : (s.album ? `name:${String(s.album).toLowerCase()}` : null);
    if (!artistAlbumSeen.has(artistKey)) artistAlbumSeen.set(artistKey, new Set());
    const seenSet = artistAlbumSeen.get(artistKey);
    const key = albumKey || `track:${s.id}`;
    if (seenSet.has(key)) continue;
    seenSet.add(key);
    uniqueSongs.push(s);
  }
  const topSongs = { source: 'apple_music_rss', country: 'us', updated_at: nowIso(), songs: uniqueSongs };
  await fs.writeFile(path.join(OUT_DIR, 'top_songs_us.json'), JSON.stringify(topSongs, null, 2));
  await fs.writeFile(path.join(PUBLIC_OUT_DIR, 'top_songs_us.json'), JSON.stringify(topSongs));

  // Derive artists from song credits, de-duplicate, preserve order, bind first song artwork per artist
  const artistOrder = [];
  const displayName = new Map(); // norm -> display string
  const artistImage = new Map(); // norm -> image url
  for (const s of uniqueSongs) {
    const credits = splitArtistCredits(s.artist);
    for (const c of credits) {
      const nameDisp = normalizeArtistName(c);
      const norm = nameDisp.toLowerCase();
      if (!norm) continue;
      if (!displayName.has(norm)) {
        displayName.set(norm, nameDisp);
        artistOrder.push(norm);
      }
      if (!artistImage.has(norm) && s.image) {
        artistImage.set(norm, s.image);
      }
    }
  }
  const allArtists = artistOrder.map(norm => ({ name: displayName.get(norm), image_url: artistImage.get(norm) || null }));

  // Top 10 unique artists; then try to enrich missing images from Wikidata
  let artists10 = allArtists.slice(0, 10);
  artists10 = await enrichTopArtistImagesWikidata(artists10);
  const topArtists = { source: 'apple_music_rss', country: 'us', updated_at: nowIso(), artists: artists10 };
  await fs.writeFile(path.join(OUT_DIR, 'top_artists_us.json'), JSON.stringify(topArtists, null, 2));
  await fs.writeFile(path.join(PUBLIC_OUT_DIR, 'top_artists_us.json'), JSON.stringify(topArtists));

  // Lightweight catalog for search (first 300 unique from feed)
  const catalog = { source: 'apple_music_rss', updated_at: nowIso(), count: Math.min(allArtists.length, 300), artists: allArtists.slice(0, 300) };
  await fs.writeFile(path.join(OUT_DIR, 'artists_catalog.json'), JSON.stringify(catalog, null, 2));
  await fs.writeFile(path.join(PUBLIC_OUT_DIR, 'artists_catalog.json'), JSON.stringify(catalog));
}

// Build a larger local songs catalog via iTunes Search (no auth)
async function buildSongsCatalogFromItunes(maxPerSeed = 200, seeds = 'abcdefghijklmnopqrstuvwxyz0123456789') {
  const seen = new Set();
  const out = [];
  for (const ch of seeds) {
    const url = new URL('https://itunes.apple.com/search');
    url.searchParams.set('term', ch);
    url.searchParams.set('entity', 'song');
    url.searchParams.set('country', 'us');
    url.searchParams.set('limit', String(maxPerSeed));
    try {
      const json = await fetchJson(url.toString());
      const items = json?.results || [];
      for (const r of items) {
        const id = r.trackId || r.collectionId || r.artistId || r.trackViewUrl;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({
          id: String(id),
          title: r.trackName || r.collectionName || r.trackCensoredName,
          artist: r.artistName,
          image: (r.artworkUrl100 || '').replace(/100x100bb\.jpg$/, '200x200bb.jpg') || r.artworkUrl100 || null,
          url: r.trackViewUrl || r.collectionViewUrl || null
        });
      }
    } catch {
      // skip on errors per seed
    }
    await new Promise(r => setTimeout(r, 200));
  }
  const catalog = { source: 'itunes_search', country: 'us', updated_at: nowIso(), count: out.length, songs: out };
  await fs.writeFile(path.join(OUT_DIR, 'songs_catalog.json'), JSON.stringify(catalog, null, 2));
  await fs.writeFile(path.join(PUBLIC_OUT_DIR, 'songs_catalog.json'), JSON.stringify(catalog));
}

function wikidataSparql(limit = 5000, offset = 0) {
  const query = `# artist and band catalog with images\nSELECT ?item ?itemLabel (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?aliases) ?image WHERE {\n  { ?item wdt:P31/wdt:P279* wd:Q215380. }  # musical group/band\n  UNION\n  {\n    ?item wdt:P31 wd:Q5;  # human\n          wdt:P106 ?occ.\n    ?occ rdfs:label ?occLabel.\n    FILTER(LANG(?occLabel) = 'en' && (?occLabel IN ('singer','musician','rapper','DJ','disc jockey','singer-songwriter','music producer','composer')))\n  }\n  ?item wdt:P18 ?image.\n  OPTIONAL { ?item skos:altLabel ?alt FILTER (LANG(?alt) = 'en') }\n  SERVICE wikibase:label { bd:serviceParam wikibase:language 'en'. }\n}\nGROUP BY ?item ?itemLabel ?image\nLIMIT ${limit}\nOFFSET ${offset}`;
  const url = new URL(WDQS_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');
  return url.toString();
}

function commonsThumbUrl(imageUrl) {
  // Prefer to standardize via Special:FilePath when possible
  try {
    const u = new URL(imageUrl);
    const fileName = decodeURIComponent(u.pathname.split('/').pop());
    if (u.hostname.includes('wikimedia.org') || u.hostname.includes('wikipedia.org') || u.hostname.includes('commons')) {
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=256`;
    }
  } catch {}
  return imageUrl;
}

async function fetchWikidataCatalog(maxRecords = 20000, chunkSize = 5000) {
  let offset = 0;
  const artists = [];
  while (offset < maxRecords) {
    const url = wikidataSparql(Math.min(chunkSize, maxRecords - offset), offset);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Rhythmoji PrefData/1.0 (+https://github.com/nmaffly/rhythmoji-generator)',
        'Accept': 'application/sparql-results+json'
      }
    });
    if (!res.ok) throw new Error(`WDQS HTTP ${res.status}`);
    const json = await res.json();
    const rows = json?.results?.bindings || [];
    if (rows.length === 0) break;
    for (const b of rows) {
      const id = b.item?.value?.split('/').pop();
      const name = b.itemLabel?.value;
      const image_url = commonsThumbUrl(b.image?.value);
      const aliases = (b.aliases?.value || '')
        .split('|')
        .map(s => s.trim())
        .filter(Boolean);
      if (id && name && image_url) {
        artists.push({ id, name, aliases, image_url });
      }
    }
    offset += rows.length;
    // Friendly pause to avoid rate-limits
    await new Promise(r => setTimeout(r, 500));
  }
  return artists;
}

async function updateWikidataCatalog() {
  const artists = await fetchWikidataCatalog(20000, 5000);
  const output = { source: 'wikidata', updated_at: nowIso(), count: artists.length, artists };
  await fs.writeFile(path.join(OUT_DIR, 'artists_catalog.json'), JSON.stringify(output, null, 2));
  await fs.writeFile(path.join(PUBLIC_OUT_DIR, 'artists_catalog.json'), JSON.stringify(output));

  // Enrich top_artists_us.json images if present
  try {
    const topPath = path.join(OUT_DIR, 'top_artists_us.json');
    const top = JSON.parse(await fs.readFile(topPath, 'utf8'));
    const byName = new Map(artists.map(a => [a.name.toLowerCase(), a.image_url]));
    top.artists = top.artists.map(a => ({ ...a, image_url: a.image_url || byName.get(a.name.toLowerCase()) || null }));
    await fs.writeFile(topPath, JSON.stringify(top, null, 2));
    await fs.writeFile(path.join(PUBLIC_OUT_DIR, 'top_artists_us.json'), JSON.stringify(top));
  } catch (e) {
    // ignore if top artists not created yet
  }
}

async function main() {
  await ensureDirs();
  const mode = process.argv[2] || 'all';
  if (mode === 'apple') {
    await updateAppleTopSongs();
    await buildSongsCatalogFromItunes();
  } else if (mode === 'wikidata') {
    await updateWikidataCatalog();
  } else {
    await updateAppleTopSongs();
    await buildSongsCatalogFromItunes();
    await updateWikidataCatalog();
  }
  console.log('pref_data updated in', OUT_DIR, 'and copied to', PUBLIC_OUT_DIR);
}

main().catch(err => {
  console.error('Error updating pref data:', err);
  process.exit(1);
});
