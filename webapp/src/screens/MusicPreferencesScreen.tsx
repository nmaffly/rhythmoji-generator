import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Search, Music, User, Check, X, ArrowRight } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';

type Artist = { id: string; name: string; image?: string; genre?: string; aliases?: string[] };
type Song = { id: string; title: string; artist: string; image?: string; duration?: string };

const MusicPreferencesScreen: React.FC = () => {
  const [selectedArtists, setSelectedArtists] = useState<Artist[]>([]);
  const [selectedSongs, setSelectedSongs] = useState<Song[]>([]);
  const [artistSearch, setArtistSearch] = useState('');
  const [songSearch, setSongSearch] = useState('');
  const [topArtists, setTopArtists] = useState<Artist[]>([]);
  const [artistsCatalog, setArtistsCatalog] = useState<Artist[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [songsCatalog, setSongsCatalog] = useState<Song[]>([]);
  const [filteredArtists, setFilteredArtists] = useState<Artist[]>([]);
  const [filteredSongs, setFilteredSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const { updatePreferences } = useAuth();
  const navigate = useNavigate();

  // Canonical artist ID (slug of name) to unify across sources
  const slug = (s: string) => s.toLowerCase().trim().replace(/\s+/g, '-');
  const artistId = (name: string) => `name:${slug(name)}`;

  // Load data from static JSON files served from public/pref_data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [songsRes, artistsRes, catalogRes, songsCatRes] = await Promise.all([
          fetch('/pref_data/top_songs_us.json').catch(() => null),
          fetch('/pref_data/top_artists_us.json').catch(() => null),
          fetch('/pref_data/artists_catalog.json').catch(() => null),
          fetch('/pref_data/songs_catalog.json').catch(() => null),
        ]);

        if (songsRes && songsRes.ok) {
          const json = await songsRes.json();
          const mapped: Song[] = (json?.songs || []).map((s: any, idx: number) => ({
            id: String(s.id ?? idx),
            title: s.title ?? s.name,
            artist: s.artist ?? s.artistName,
            image: s.image ?? s.artworkUrl100 ?? s.artworkUrl,
            duration: s.duration || undefined,
          }));
          setSongs(mapped);
          setFilteredSongs(mapped);
        }

        if (artistsRes && artistsRes.ok) {
          const json = await artistsRes.json();
          const arr: Artist[] = (json?.artists || []).map((a: any) => ({
            id: artistId(a.name),
            name: a.name,
            image: a.image_url || undefined,
          }));
          // de-dup by normalized name and cap to 10 just in case
          const seen = new Set<string>();
          const mapped: Artist[] = [];
          for (const a of arr) {
            const key = a.id;
            if (key && !seen.has(key)) {
              seen.add(key);
              mapped.push(a);
            }
            if (mapped.length >= 10) break;
          }
          setTopArtists(mapped);
          setFilteredArtists(mapped);
        }

        if (catalogRes && catalogRes.ok) {
          const json = await catalogRes.json();
          const mapped: Artist[] = (json?.artists || []).map((a: any) => ({
            id: artistId(a.name),
            name: a.name,
            image: a.image_url || undefined,
            aliases: a.aliases || [],
          }));
          setArtistsCatalog(mapped);
        }

        if (songsCatRes && songsCatRes.ok) {
          const json = await songsCatRes.json();
          const cat: Song[] = (json?.songs || []).map((s: any, idx: number) => ({
            id: String(s.id ?? idx),
            title: s.title ?? s.trackName ?? s.name,
            artist: s.artist ?? s.artistName,
            image: s.image ?? s.artworkUrl100 ?? s.artworkUrl,
          }));
          setSongsCatalog(cat);
        }
      } catch (e) {
        // If anything fails, the UI will fall back to empty lists
      }
    };
    loadData();
  }, []);

  // Filter artists: use catalog when searching, otherwise show top artists (dedup by canonical id)
  useEffect(() => {
    const q = artistSearch.trim().toLowerCase();
    if (!q) {
      setFilteredArtists(topArtists);
      return;
    }
    const src = artistsCatalog.length > 0 ? artistsCatalog : topArtists;
    const filteredRaw = src.filter(a => {
      const inName = a.name?.toLowerCase().includes(q);
      const inAliases = (a.aliases || []).some((al: string) => al.toLowerCase().includes(q));
      return inName || inAliases;
    });
    const seen = new Set<string>();
    const out: Artist[] = [];
    for (const a of filteredRaw) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        out.push(a);
      }
      if (out.length >= 50) break;
    }
    setFilteredArtists(out);
  }, [artistSearch, topArtists, artistsCatalog]);

  useEffect(() => {
    const q = songSearch.trim().toLowerCase();
    let base = songs;
    if (q) {
      const src = songsCatalog.length > 0 ? songsCatalog : songs;
      base = src.filter(song =>
        (song.title || '').toLowerCase().includes(q) ||
        (song.artist || '').toLowerCase().includes(q)
      ).slice(0, 200);
    }
    // De-duplicate by id (then by title+artist as a fallback)
    const seen = new Set<string>();
    const deduped: Song[] = [];
    for (const s of base) {
      const key = s.id || `${(s.title||'').toLowerCase()}::${(s.artist||'').toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(s);
      }
    }
    setFilteredSongs(deduped);
  }, [songSearch, songs, songsCatalog]);

  const handleArtistSelect = (artist: Artist) => {
    const id = artist.id || artistId(artist.name);
    const exists = selectedArtists.some(a => a.id === id);
    if (exists) {
      setSelectedArtists(prev => prev.filter(a => a.id !== id));
    } else if (selectedArtists.length < 3) {
      setSelectedArtists(prev => [...prev, { id, name: artist.name, image: artist.image }]);
    }
  };

  const handleSongSelect = (song: Song) => {
    const id = String(song.id);
    const exists = selectedSongs.some(s => s.id === id);
    if (exists) {
      setSelectedSongs(prev => prev.filter(s => s.id !== id));
    } else if (selectedSongs.length < 5) {
      setSelectedSongs(prev => [...prev, { id, title: song.title, artist: song.artist, image: song.image }]);
    }
  };

  const handleContinue = async () => {
    if (selectedArtists.length === 3 && selectedSongs.length === 5) {
      setIsLoading(true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const minimalArtists = selectedArtists.map(a => ({ id: a.id, name: a.name }));
      const minimalSongs = selectedSongs.map(s => ({ id: s.id, title: s.title, artist: s.artist }));
      updatePreferences({ artists: minimalArtists as any, songs: minimalSongs as any });
      setIsLoading(false);
      navigate('/generate');
    }
  };

  const canContinue = selectedArtists.length === 3 && selectedSongs.length === 5;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="bg-black border-b border-gray-800 px-4 py-4">
        <h1 className="text-2xl font-bold text-white text-center">
          Music Preferences
        </h1>
        <p className="text-gray-400 text-center mt-1">
          Choose your favorites to create your Rhythmoji
        </p>
      </div>

      {/* Progress Indicator */}
      <div className="bg-black px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              selectedArtists.length === 3 ? 'bg-green-500 text-black' : 'bg-gray-800 text-gray-300'
            }`}>
              {selectedArtists.length === 3 ? <Check className="w-4 h-4" /> : '1'}
            </div>
            <span className="text-gray-300">Artists ({selectedArtists.length}/3)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              selectedSongs.length === 5 ? 'bg-green-500 text-black' : 'bg-gray-800 text-gray-300'
            }`}>
              {selectedSongs.length === 5 ? <Check className="w-4 h-4" /> : '2'}
            </div>
            <span className="text-gray-300">Songs ({selectedSongs.length}/5)</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {/* Artists Section */}
        <div className="h-1/2 bg-black border-b border-gray-800">
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-5 h-5 text-gray-300" />
              <h2 className="text-lg font-semibold text-white">
                Top 3 Favorite Artists
              </h2>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                placeholder="Search artists..."
                value={artistSearch}
                onChange={(e) => setArtistSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-700 rounded-lg bg-gray-900 text-white placeholder:text-gray-500 focus:border-green-500 focus:outline-none"
              />
            </div>
          </div>
          
          <div className="p-4 h-full overflow-y-hidden overflow-x-auto">
            <div className="flex gap-3 pr-4 snap-x snap-mandatory">
              {filteredArtists.map((artist) => {
                const selected = selectedArtists.some(a => a.id === artist.id);
                const canSelect = selectedArtists.length < 3 || selected;
                const imgSrc = artist.image || '/placeholder-artist.svg';
                return (
                  <div
                    key={artist.id}
                    onClick={() => canSelect && handleArtistSelect(artist)}
                    className={`relative p-3 rounded-lg border cursor-pointer transition-all snap-start min-w-[120px] ${
                      selected
                        ? 'border-green-500 bg-green-50'
                        : canSelect
                          ? 'border-gray-200 bg-white hover:border-gray-300'
                          : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
                    }`}
                  >
                    {selected && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <img
                      src={imgSrc}
                      alt={artist.name}
                      className="w-24 h-24 object-cover rounded-lg mb-2"
                    />
                    <h3 className="font-medium text-sm text-white truncate">{artist.name}</h3>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Songs Section */}
        <div className="h-1/2 bg-black">
          <div className="p-4 border-b border-gray-800 bg-black">
            <div className="flex items-center gap-2 mb-3">
              <Music className="w-5 h-5 text-gray-300" />
              <h2 className="text-lg font-semibold text-white">
                Top 5 Favorite Songs
              </h2>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                placeholder="Search songs..."
                value={songSearch}
                onChange={(e) => setSongSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-700 rounded-lg bg-gray-900 text-white placeholder:text-gray-500 focus:border-green-500 focus:outline-none"
              />
            </div>
          </div>
          
          <div className="p-4 h-full overflow-y-auto">
            <div className="space-y-3">
              {filteredSongs.map((song) => {
                const isSelected = selectedSongs.find(s => s.id === song.id);
                const canSelect = selectedSongs.length < 5;
                
                return (
                  <div
                    key={song.id}
                    onClick={() => handleSongSelect(song)}
                    className={`relative flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected 
                        ? 'border-green-500 bg-green-50' 
                        : canSelect
                          ? 'border-gray-200 bg-white hover:border-gray-300'
                          : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <img
                      src={song.image}
                      alt={song.title}
                      className="w-12 h-12 object-cover rounded-lg"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm text-white truncate">{song.title}</h3>
                      <p className="text-xs text-gray-400 truncate">{song.artist}</p>
                    </div>
                    <span className="text-xs text-gray-500">{song.duration}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Your Taste Panel */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-gray-800 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Your Taste</h3>
            <span className="text-xs text-gray-400">{selectedArtists.length}/3 artists • {selectedSongs.length}/5 songs</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Selected Artists (3 slots) */}
            <div>
              <div className="text-xs text-gray-400 mb-2">Artists</div>
              <div className="grid grid-cols-3 gap-2">
                {[0,1,2].map((i) => {
                  const a = selectedArtists[i];
                  return (
                    <div key={i} className={`h-16 rounded-lg border flex items-center justify-center relative ${a ? 'border-green-500 bg-green-500/10' : 'border-gray-800 bg-gray-900'}`}>
                      {a ? (
                        <>
                          <button
                            onClick={() => handleArtistSelect(a)}
                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
                            aria-label={`Remove ${a.name}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <span className="px-2 text-sm truncate">{a.name}</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-500">Empty</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Songs (5 slots) */}
            <div>
              <div className="text-xs text-gray-400 mb-2">Songs</div>
              <div className="grid grid-cols-5 gap-2">
                {[0,1,2,3,4].map((i) => {
                  const s = selectedSongs[i];
                  return (
                    <div key={i} className={`h-16 rounded-lg border flex items-center justify-center relative ${s ? 'border-green-500 bg-green-500/10' : 'border-gray-800 bg-gray-900'}`}>
                      {s ? (
                        <>
                          <button
                            onClick={() => handleSongSelect(s)}
                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
                            aria-label={`Remove ${s.title}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <span className="px-2 text-xs truncate text-center">{s.title}</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-500">Empty</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <button
              onClick={handleContinue}
              disabled={!canContinue || isLoading}
              className={`w-full py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                canContinue && !isLoading
                  ? 'bg-green-500 text-black hover:bg-green-400'
                  : 'bg-gray-800 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MusicPreferencesScreen;
