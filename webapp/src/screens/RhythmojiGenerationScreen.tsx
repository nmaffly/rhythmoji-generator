import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RainbowText from '../components/RainbowText';
import { Coffee, LogOut, Download, Eye } from 'lucide-react';

const RhythmojiGenerationScreen: React.FC = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const didStart = useRef(false);
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:5001';

  const startGenerate = async () => {
    if (!user?.preferences?.artists || !user?.preferences?.songs) return;
    try {
      setIsGenerating(true);
      setError(null);
      setImageUrl(null);
      const artists = (user.preferences.artists || []).map((a: any) => a.name || a);
      const songs = (user.preferences.songs || []).map((s: any) => ({ title: s.title || s.name || '', artist: s.artist || '' }));
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artists, songs })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.image_url) throw new Error(data?.error || 'Generation failed');
      const url: string = String(data.image_url).startsWith('http') ? data.image_url : `${API_BASE}${data.image_url}`;
      setImageUrl(url);
    } catch (e: any) {
      setError(e?.message || 'Failed to generate');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!user?.preferences?.artists || !user?.preferences?.songs) {
      navigate('/preferences');
      return;
    }
    if (!didStart.current) {
      didStart.current = true;
      startGenerate();
    }
  }, [user, navigate]);

  const handleDownload = async () => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = 'rhythmoji.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleStoreNavigation = () => {
    navigate('/store');
  };

  return (
    <div className="min-h-screen bg-gray-100 relative overflow-hidden">
      {/* Navigation Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <button className="text-gray-600 hover:text-gray-900 transition-colors">
              Home
            </button>
            <button className="text-gray-600 hover:text-gray-900 transition-colors">
              About
            </button>
            <button className="text-gray-600 hover:text-gray-900 transition-colors">
              Privacy
            </button>
            <button 
              onClick={handleStoreNavigation}
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Coffee className="w-4 h-4" />
              Buy Us a Coffee
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs hover:bg-green-200 transition-colors"
          >
            <LogOut className="w-3 h-3" />
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-4 relative">
        {/* Background glow effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="w-80 h-80 bg-green-400 rounded-full blur-3xl opacity-30 animate-pulse"></div>
          </div>
          <div className="absolute bottom-1/4 left-1/2 transform -translate-x-1/2">
            <div className="w-96 h-96 bg-green-500 rounded-full blur-3xl opacity-20 animate-pulse delay-1000"></div>
          </div>
        </div>

        <div className="relative z-10 text-center max-w-md mx-auto">
          {/* Rhythmoji Logo with Glow */}
          <div className="mb-8">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-green-400 rounded-2xl blur-xl opacity-60"></div>
              <div className="relative bg-green-400 px-8 py-6 rounded-2xl">
                <RainbowText text="Rhythmoji" className="text-4xl" />
                <p className="text-black text-lg font-medium mt-2">Your music, lego-fied</p>
              </div>
            </div>
          </div>

          {/* LEGO Character Display */}
          <div className="mb-12 relative">
            <div className="relative inline-block">
              {imageUrl ? (
                <img src={imageUrl} alt="Your Rhythmoji" className="w-64 h-80 object-cover rounded-lg shadow-2xl" />
              ) : (
                <div className="w-64 h-80 bg-gradient-to-b from-gray-200 to-gray-300 rounded-lg relative overflow-hidden shadow-2xl">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="animate-spin w-8 h-8 border-2 border-gray-700 border-t-transparent rounded-full"></div>
                      <span className="text-gray-700 text-sm">{isGenerating ? 'Generating your Rhythmoji...' : (error ? 'Failed. Click RETRY.' : 'Ready to generate')}</span>
                      {error && (
                        <button onClick={startGenerate} className="px-3 py-1 text-xs rounded bg-green-500 text-white hover:bg-green-600">RETRY</button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-4">
            <button
              onClick={handleDownload}
              disabled={isGenerating || !imageUrl}
              className="relative w-full group overflow-hidden"
            >
              <div className="absolute inset-0 bg-green-400 rounded-2xl blur-md opacity-60 group-hover:opacity-80 transition-opacity"></div>
              <div className="relative bg-green-400 hover:bg-green-300 text-black font-bold py-4 px-8 rounded-2xl transition-all duration-300 transform group-hover:scale-105 flex items-center justify-center gap-2">
                {isGenerating ? (
                  <>
                    <div className="animate-spin w-5 h-5 border-2 border-black border-t-transparent rounded-full"></div>
                    <span>GENERATING...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    <span>{imageUrl ? 'DOWNLOAD RHYTHMOJI' : 'READY TO GENERATE'}</span>
                  </>
                )}
              </div>
            </button>

            <button
              onClick={() => setShowDescription(!showDescription)}
              className="relative w-full group overflow-hidden"
            >
              <div className="absolute inset-0 bg-green-400 rounded-2xl blur-md opacity-60 group-hover:opacity-80 transition-opacity"></div>
              <div className="relative bg-green-400 hover:bg-green-300 text-black font-bold py-4 px-8 rounded-2xl transition-all duration-300 transform group-hover:scale-105 flex items-center justify-center gap-2">
                <Eye className="w-5 h-5" />
                <span>SEE DESCRIPTION</span>
              </div>
            </button>
          </div>

          {/* Store Section */}
          <div className="mt-12 w-full">
            <h2 className="text-white text-xl font-semibold mb-6 text-center">
              Get Your Rhythmoji on Products
            </h2>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Keychain */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 hover:bg-white/20 transition-all cursor-pointer"
                   onClick={handleStoreNavigation}>
                <img
                  src="https://images.pexels.com/photos/209831/pexels-photo-209831.jpeg?auto=compress&cs=tinysrgb&w=150"
                  alt="Rhythmoji Keychain"
                  className="w-full h-20 object-cover rounded-lg mb-2"
                />
                <h3 className="text-white font-medium text-sm">Keychain</h3>
                <p className="text-green-400 font-semibold text-sm">$12.99</p>
              </div>

              {/* Stickers */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 hover:bg-white/20 transition-all cursor-pointer"
                   onClick={handleStoreNavigation}>
                <img
                  src="https://images.pexels.com/photos/1314543/pexels-photo-1314543.jpeg?auto=compress&cs=tinysrgb&w=150"
                  alt="Rhythmoji Stickers"
                  className="w-full h-20 object-cover rounded-lg mb-2"
                />
                <h3 className="text-white font-medium text-sm">Sticker Pack</h3>
                <p className="text-green-400 font-semibold text-sm">$8.99</p>
              </div>

              {/* T-Shirt */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 hover:bg-white/20 transition-all cursor-pointer"
                   onClick={handleStoreNavigation}>
                <img
                  src="https://images.pexels.com/photos/1020585/pexels-photo-1020585.jpeg?auto=compress&cs=tinysrgb&w=150"
                  alt="Rhythmoji T-Shirt"
                  className="w-full h-20 object-cover rounded-lg mb-2"
                />
                <h3 className="text-white font-medium text-sm">T-Shirt</h3>
                <p className="text-green-400 font-semibold text-sm">$24.99</p>
              </div>

              {/* Phone Case */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 hover:bg-white/20 transition-all cursor-pointer"
                   onClick={handleStoreNavigation}>
                <img
                  src="https://images.pexels.com/photos/788946/pexels-photo-788946.jpeg?auto=compress&cs=tinysrgb&w=150"
                  alt="Rhythmoji Phone Case"
                  className="w-full h-20 object-cover rounded-lg mb-2"
                />
                <h3 className="text-white font-medium text-sm">Phone Case</h3>
                <p className="text-green-400 font-semibold text-sm">$18.99</p>
              </div>
            </div>

            <button
              onClick={handleStoreNavigation}
              className="relative w-full group overflow-hidden"
            >
              <div className="absolute inset-0 bg-green-400 rounded-2xl blur-md opacity-60 group-hover:opacity-80 transition-opacity"></div>
              <div className="relative bg-green-400 hover:bg-green-300 text-black font-bold py-4 px-8 rounded-2xl transition-all duration-300 transform group-hover:scale-105 flex items-center justify-center gap-2">
                <Coffee className="w-5 h-5" />
                <span>VIEW ALL PRODUCTS</span>
              </div>
            </button>
          </div>

          {/* Description Modal */}
          {showDescription && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-md mx-auto">
                <h3 className="text-xl font-bold mb-4">Your Rhythmoji Description</h3>
                <div className="space-y-3 text-left">
                  <p className="text-gray-700">
                    <strong>Based on your music preferences:</strong>
                  </p>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm"><strong>Artists:</strong> {user?.preferences?.artists?.map(a => a.name).join(', ')}</p>
                    <p className="text-sm mt-1"><strong>Songs:</strong> {user?.preferences?.songs?.slice(0, 2).map(s => s.title).join(', ')} and more...</p>
                  </div>
                  <p className="text-gray-700 text-sm">
                    Your Rhythmoji features a unique design combining musical elements from your favorite genres with personalized LEGO styling.
                  </p>
                </div>
                <button
                  onClick={() => setShowDescription(false)}
                  className="w-full mt-6 bg-green-500 text-white py-2 px-4 rounded-lg hover:bg-green-600 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RhythmojiGenerationScreen;
