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
  const topSongs = { source: 'apple_music_rss', country: 'us', updated_at: nowIso(), songs };
  await fs.writeFile(path.join(OUT_DIR, 'top_songs_us.json'), JSON.stringify(topSongs, null, 2));
  await fs.writeFile(path.join(PUBLIC_OUT_DIR, 'top_songs_us.json'), JSON.stringify(topSongs));

  // Derive artists from song credits, de-duplicate, preserve order
  const seen = new Set();
  const allArtists = [];
  for (const s of songs) {
    const credits = splitArtistCredits(s.artist);
    for (const c of credits) {
      const norm = normalizeArtistName(c).toLowerCase();
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        allArtists.push({ name: normalizeArtistName(c), image_url: s.image || null });
      }
    }
  }

  // Top 10 unique artists
  const artists10 = allArtists.slice(0, 10);
  const topArtists = { source: 'apple_music_rss', country: 'us', updated_at: nowIso(), artists: artists10 };
  await fs.writeFile(path.join(OUT_DIR, 'top_artists_us.json'), JSON.stringify(topArtists, null, 2));
  await fs.writeFile(path.join(PUBLIC_OUT_DIR, 'top_artists_us.json'), JSON.stringify(topArtists));

  // Lightweight catalog for search (first 300 unique from feed)
  const catalog = { source: 'apple_music_rss', updated_at: nowIso(), count: Math.min(allArtists.length, 300), artists: allArtists.slice(0, 300) };
  await fs.writeFile(path.join(OUT_DIR, 'artists_catalog.json'), JSON.stringify(catalog, null, 2));
  await fs.writeFile(path.join(PUBLIC_OUT_DIR, 'artists_catalog.json'), JSON.stringify(catalog));
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
  } else if (mode === 'wikidata') {
    await updateWikidataCatalog();
  } else {
    await updateAppleTopSongs();
    await updateWikidataCatalog();
  }
  console.log('pref_data updated in', OUT_DIR, 'and copied to', PUBLIC_OUT_DIR);
}

main().catch(err => {
  console.error('Error updating pref data:', err);
  process.exit(1);
});
