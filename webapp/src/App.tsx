import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import AuthScreen from './screens/AuthScreen';
import MusicPreferencesScreen from './screens/MusicPreferencesScreen';
import RhythmojiGenerationScreen from './screens/RhythmojiGenerationScreen';
import StoreScreen from './screens/StoreScreen';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <Router>
          <div className="min-h-screen bg-white">
            <Routes>
              <Route path="/" element={<AuthScreen />} />
              <Route 
                path="/preferences" 
                element={
                  <ProtectedRoute>
                    <MusicPreferencesScreen />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/generate" 
                element={
                  <ProtectedRoute>
                    <RhythmojiGenerationScreen />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/store" 
                element={
                  <ProtectedRoute>
                    <StoreScreen />
                  </ProtectedRoute>
                } 
              />
            </Routes>
          </div>
        </Router>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;