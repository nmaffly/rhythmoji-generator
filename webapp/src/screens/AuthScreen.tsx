import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RainbowText from '../components/RainbowText';
import LoadingSpinner from '../components/LoadingSpinner';
import { Phone, ChevronDown } from 'lucide-react';

const countryCodes = [
  { code: '+1', country: 'US', flag: '🇺🇸' },
  { code: '+44', country: 'UK', flag: '🇬🇧' },
  { code: '+91', country: 'IN', flag: '🇮🇳' },
  { code: '+86', country: 'CN', flag: '🇨🇳' },
  { code: '+33', country: 'FR', flag: '🇫🇷' },
  { code: '+49', country: 'DE', flag: '🇩🇪' },
];

const AuthScreen: React.FC = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  
  const { login, isLoading, user } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user) {
      navigate('/preferences');
    }
  }, [user, navigate]);

  const validatePhoneNumber = (number: string) => {
    const phoneRegex = /^\d{10,15}$/;
    return phoneRegex.test(number.replace(/\D/g, ''));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    if (!cleanPhone) {
      setErrors({ phone: 'Phone number is required' });
      return;
    }

    if (!validatePhoneNumber(cleanPhone)) {
      setErrors({ phone: 'Please enter a valid phone number' });
      return;
    }

    try {
      await login(cleanPhone, countryCode);
      navigate('/preferences');
    } catch (error) {
      setErrors({ general: 'Failed to authenticate. Please try again.' });
    }
  };

  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length >= 6) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    } else if (digits.length >= 3) {
      return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    }
    return digits;
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-green-500/20 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute bottom-1/3 right-1/4 w-24 h-24 bg-purple-500/20 rounded-full blur-xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-12">
          <RainbowText text="Rhythmoji" className="text-5xl mb-4" />
          <p className="text-gray-400 text-lg">Your music, lego-fied</p>
        </div>

        {/* Auth Form */}
        <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-800">
          <h2 className="text-white text-2xl font-semibold mb-6 text-center">
            Enter your phone number
          </h2>
          
          {errors.general && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4">
              <p className="text-red-300 text-sm">{errors.general}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2">
              {/* Country Code Selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                  className="flex items-center gap-2 bg-gray-800 text-white px-4 py-4 rounded-lg border border-gray-700 hover:border-green-500 transition-colors"
                >
                  <span>{countryCodes.find(c => c.code === countryCode)?.flag}</span>
                  <span>{countryCode}</span>
                  <ChevronDown className="w-4 h-4" />
                </button>

                {showCountryDropdown && (
                  <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-20 min-w-[120px]">
                    {countryCodes.map((country) => (
                      <button
                        key={country.code}
                        type="button"
                        onClick={() => {
                          setCountryCode(country.code);
                          setShowCountryDropdown(false);
                        }}
                        className="flex items-center gap-2 w-full px-4 py-2 text-white hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg transition-colors"
                      >
                        <span>{country.flag}</span>
                        <span>{country.code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Phone Number Input */}
              <div className="flex-1 relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                  placeholder="123-456-7890"
                  className={`w-full pl-10 pr-4 py-4 bg-gray-800 text-white rounded-lg border ${
                    errors.phone ? 'border-red-500' : 'border-gray-700'
                  } focus:border-green-500 focus:outline-none transition-colors`}
                  inputMode="numeric"
                  pattern="[0-9\-]*"
                />
              </div>
            </div>

            {errors.phone && (
              <p className="text-red-400 text-sm mt-1">{errors.phone}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-green-500 to-green-400 text-black font-semibold py-4 px-6 rounded-lg hover:from-green-400 hover:to-green-300 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-green-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Authenticating...</span>
                </>
              ) : (
                'Continue'
              )}
            </button>
          </form>

          <p className="text-gray-500 text-xs text-center mt-6">
            We'll send you a verification code to confirm your number
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;