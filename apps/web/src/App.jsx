
import React from 'react';
import { Route, Routes, BrowserRouter as Router } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext.jsx';
import ScrollToTop from '@/components/ScrollToTop.jsx';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ProtectedRoute from '@/components/ProtectedRoute.jsx';
import HomePage from '@/pages/HomePage.jsx';
import SignupPage from '@/pages/SignupPage.jsx';
import SigninPage from '@/pages/SigninPage.jsx';
import UserProfilePage from '@/pages/UserProfilePage.jsx';
import SkillsPage from '@/pages/SkillsPage.jsx';
import LeaderboardPage from '@/pages/LeaderboardPage.jsx';
import MembersPage from '@/pages/MembersPage.jsx';
import AboutPage from '@/pages/AboutPage.jsx';
import RoundTablePage from '@/pages/RoundTablePage.jsx';
import BuildPage from '@/pages/BuildPage.jsx';
import ResetPasswordPage from '@/pages/ResetPasswordPage.jsx';
import ReviewPage from '@/pages/ReviewPage.jsx';
import ContactPage from '@/pages/ContactPage.jsx';

function App() {
  return (
    <Router>
      <AuthProvider>
        <ScrollToTop />
        <div className="flex flex-col min-h-screen">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/signin" element={<SigninPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route
                path="/review"
                element={
                  <ProtectedRoute>
                    <ReviewPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/skills" element={<SkillsPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/members" element={<MembersPage />} />
              <Route path="/contributors" element={<MembersPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/build" element={<BuildPage />} />
              <Route
                path="/roundtable"
                element={
                  <ProtectedRoute>
                    <RoundTablePage />
                  </ProtectedRoute>
                }
              />
              <Route 
                path="/profile" 
                element={
                  <ProtectedRoute>
                    <UserProfilePage />
                  </ProtectedRoute>
                } 
              />
              <Route path="*" element={
                <div className="min-h-screen flex items-center justify-center">
                  <div className="text-center">
                    <h1 className="text-4xl font-bold mb-4">404 - Page not found</h1>
                    <p className="text-muted-foreground mb-6">The page you're looking for doesn't exist.</p>
                    <a href="/" className="text-primary hover:underline">Back to home</a>
                  </div>
                </div>
              } />
            </Routes>
          </main>
          <Footer />
        </div>
        <Toaster />
      </AuthProvider>
    </Router>
  );
}

export default App;
