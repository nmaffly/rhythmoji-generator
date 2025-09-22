import React, { createContext, useContext, useState, ReactNode } from 'react';

interface User {
  phoneNumber: string;
  countryCode: string;
  preferences?: {
    artists: any[];
    songs: any[];
  };
}

interface AuthContextType {
  user: User | null;
  login: (phoneNumber: string, countryCode: string) => Promise<void>;
  logout: () => void;
  updatePreferences: (preferences: { artists: any[]; songs: any[] }) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const login = async (phoneNumber: string, countryCode: string) => {
    setIsLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setUser({ phoneNumber, countryCode });
    setIsLoading(false);
  };

  const logout = () => {
    setUser(null);
  };

  const updatePreferences = (preferences: { artists: any[]; songs: any[] }) => {
    if (user) {
      setUser({ ...user, preferences });
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updatePreferences, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};