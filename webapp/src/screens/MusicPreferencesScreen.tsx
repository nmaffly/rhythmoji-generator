import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Search, Music, User, Check, X, ArrowRight } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';

// Mock data for demonstration
const mockArtists = [
  { id: '1', name: 'Taylor Swift', image: 'https://images.pexels.com/photos/1587927/pexels-photo-1587927.jpeg?auto=compress&cs=tinysrgb&w=150', genre: 'Pop' },
  { id: '2', name: 'Drake', image: 'https://images.pexels.com/photos/1762578/pexels-photo-1762578.jpeg?auto=compress&cs=tinysrgb&w=150', genre: 'Hip-Hop' },
  { id: '3', name: 'Billie Eilish', image: 'https://images.pexels.com/photos/1699161/pexels-photo-1699161.jpeg?auto=compress&cs=tinysrgb&w=150', genre: 'Alternative' },
  { id: '4', name: 'Ed Sheeran', image: 'https://images.pexels.com/photos/1540406/pexels-photo-1540406.jpeg?auto=compress&cs=tinysrgb&w=150', genre: 'Pop' },
  { id: '5', name: 'The Weeknd', image: 'https://images.pexels.com/photos/1699161/pexels-photo-1699161.jpeg?auto=compress&cs=tinysrgb&w=150', genre: 'R&B' },
  { id: '6', name: 'Ariana Grande', image: 'https://images.pexels.com/photos/1587927/pexels-photo-1587927.jpeg?auto=compress&cs=tinysrgb&w=150', genre: 'Pop' },
];

const mockSongs = [
  { id: '1', title: 'Blinding Lights', artist: 'The Weeknd', image: 'https://images.pexels.com/photos/164962/pexels-photo-164962.jpeg?auto=compress&cs=tinysrgb&w=150', duration: '3:20' },
  { id: '2', title: 'Shape of You', artist: 'Ed Sheeran', image: 'https://images.pexels.com/photos/167636/pexels-photo-167636.jpeg?auto=compress&cs=tinysrgb&w=150', duration: '3:53' },
  { id: '3', title: 'Bad Guy', artist: 'Billie Eilish', image: 'https://images.pexels.com/photos/164821/pexels-photo-164821.jpeg?auto=compress&cs=tinysrgb&w=150', duration: '3:14' },
  { id: '4', title: 'Anti-Hero', artist: 'Taylor Swift', image: 'https://images.pexels.com/photos/164829/pexels-photo-164829.jpeg?auto=compress&cs=tinysrgb&w=150', duration: '3:20' },
  { id: '5', title: 'As It Was', artist: 'Harry Styles', image: 'https://images.pexels.com/photos/164962/pexels-photo-164962.jpeg?auto=compress&cs=tinysrgb&w=150', duration: '2:47' },
  { id: '6', title: 'Stay', artist: 'The Kid LAROI', image: 'https://images.pexels.com/photos/167636/pexels-photo-167636.jpeg?auto=compress&cs=tinysrgb&w=150', duration: '2:21' },
];

const MusicPreferencesScreen: React.FC = () => {
  const [selectedArtists, setSelectedArtists] = useState<any[]>([]);
  const [selectedSongs, setSelectedSongs] = useState<any[]>([]);
  const [artistSearch, setArtistSearch] = useState('');
  const [songSearch, setSongSearch] = useState('');
  const [filteredArtists, setFilteredArtists] = useState(mockArtists);
  const [filteredSongs, setFilteredSongs] = useState(mockSongs);
  const [isLoading, setIsLoading] = useState(false);

  const { updatePreferences } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const filtered = mockArtists.filter(artist =>
      artist.name.toLowerCase().includes(artistSearch.toLowerCase())
    );
    setFilteredArtists(filtered);
  }, [artistSearch]);

  useEffect(() => {
    const filtered = mockSongs.filter(song =>
      song.title.toLowerCase().includes(songSearch.toLowerCase()) ||
      song.artist.toLowerCase().includes(songSearch.toLowerCase())
    );
    setFilteredSongs(filtered);
  }, [songSearch]);

  const handleArtistSelect = (artist: any) => {
    if (selectedArtists.find(a => a.id === artist.id)) {
      setSelectedArtists(selectedArtists.filter(a => a.id !== artist.id));
    } else if (selectedArtists.length < 3) {
      setSelectedArtists([...selectedArtists, artist]);
    }
  };

  const handleSongSelect = (song: any) => {
    if (selectedSongs.find(s => s.id === song.id)) {
      setSelectedSongs(selectedSongs.filter(s => s.id !== song.id));
    } else if (selectedSongs.length < 5) {
      setSelectedSongs([...selectedSongs, song]);
    }
  };

  const handleContinue = async () => {
    if (selectedArtists.length === 3 && selectedSongs.length === 5) {
      setIsLoading(true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      updatePreferences({ artists: selectedArtists, songs: selectedSongs });
      setIsLoading(false);
      navigate('/generate');
    }
  };

  const canContinue = selectedArtists.length === 3 && selectedSongs.length === 5;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900 text-center">
          Music Preferences
        </h1>
        <p className="text-gray-600 text-center mt-1">
          Choose your favorites to create your Rhythmoji
        </p>
      </div>

      {/* Progress Indicator */}
      <div className="bg-white px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              selectedArtists.length === 3 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {selectedArtists.length === 3 ? <Check className="w-4 h-4" /> : '1'}
            </div>
            <span className="text-gray-700">Artists ({selectedArtists.length}/3)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              selectedSongs.length === 5 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {selectedSongs.length === 5 ? <Check className="w-4 h-4" /> : '2'}
            </div>
            <span className="text-gray-700">Songs ({selectedSongs.length}/5)</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {/* Artists Section */}
        <div className="h-1/2 bg-white border-b border-gray-200">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-5 h-5 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">
                Top 3 Favorite Artists
              </h2>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search artists..."
                value={artistSearch}
                onChange={(e) => setArtistSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
              />
            </div>
          </div>
          
          <div className="p-4 h-full overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              {filteredArtists.map((artist) => {
                const isSelected = selectedArtists.find(a => a.id === artist.id);
                const canSelect = selectedArtists.length < 3;
                
                return (
                  <div
                    key={artist.id}
                    onClick={() => handleArtistSelect(artist)}
                    className={`relative p-3 rounded-lg border cursor-pointer transition-all ${
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
                      src={artist.image}
                      alt={artist.name}
                      className="w-full h-20 object-cover rounded-lg mb-2"
                    />
                    <h3 className="font-medium text-sm text-gray-900 truncate">{artist.name}</h3>
                    <p className="text-xs text-gray-600">{artist.genre}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Songs Section */}
        <div className="h-1/2 bg-gray-50">
          <div className="p-4 border-b border-gray-200 bg-white">
            <div className="flex items-center gap-2 mb-3">
              <Music className="w-5 h-5 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">
                Top 5 Favorite Songs
              </h2>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search songs..."
                value={songSearch}
                onChange={(e) => setSongSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
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
                      <h3 className="font-medium text-sm text-gray-900 truncate">{song.title}</h3>
                      <p className="text-xs text-gray-600 truncate">{song.artist}</p>
                    </div>
                    <span className="text-xs text-gray-500">{song.duration}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
        <button
          onClick={handleContinue}
          disabled={!canContinue || isLoading}
          className={`w-full py-4 px-6 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
            canContinue && !isLoading
              ? 'bg-green-500 text-white hover:bg-green-600'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <>
              <LoadingSpinner size="sm" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <span>Generate My Rhythmoji</span>
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default MusicPreferencesScreen;