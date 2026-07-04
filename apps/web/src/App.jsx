
import React from 'react';
import { Route, Routes, BrowserRouter as Router, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext.jsx';
import { AdminAuthProvider } from '@/contexts/AdminAuthContext.jsx';
import ScrollToTop from '@/components/ScrollToTop.jsx';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ProtectedRoute from '@/components/ProtectedRoute.jsx';
import AdminProtectedRoute from '@/components/admin/AdminProtectedRoute.jsx';
import HomePage from '@/pages/HomePage.jsx';
import SignupPage from '@/pages/SignupPage.jsx';
import SigninPage from '@/pages/SigninPage.jsx';
import UserProfilePage from '@/pages/UserProfilePage.jsx';
import SkillsPage from '@/pages/SkillsPage.jsx';
import LeaderboardPage from '@/pages/LeaderboardPage.jsx';
import MembersPage from '@/pages/MembersPage.jsx';
import RoundTablePage from '@/pages/RoundTablePage.jsx';
import GrowthPartnerPage from '@/pages/GrowthPartnerPage.jsx';
import GrowthBusinessDetailPage from '@/pages/GrowthBusinessDetailPage.jsx';
import GrowthReportDetailPage from '@/pages/GrowthReportDetailPage.jsx';
import BuildPage from '@/pages/BuildPage.jsx';
import ResetPasswordPage from '@/pages/ResetPasswordPage.jsx';
import ReviewPage from '@/pages/ReviewPage.jsx';
import AboutPage from '@/pages/AboutPage.jsx';
import ContactPage from '@/pages/ContactPage.jsx';
import DevelopersPage from '@/pages/DevelopersPage.jsx';
import PartnerPortalPage from '@/pages/PartnerPortalPage.jsx';
import AdminLoginPage from '@/pages/admin/AdminLoginPage.jsx';
import AdminLayout from '@/pages/admin/AdminLayout.jsx';
import BusinessesPage from '@/pages/admin/BusinessesPage.jsx';
import BusinessDetailPage from '@/pages/admin/BusinessDetailPage.jsx';
import ReportDetailPage from '@/pages/admin/ReportDetailPage.jsx';
import ReviewsPage from '@/pages/admin/ReviewsPage.jsx';

function SiteChrome({ children }) {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');
  if (isAdmin) {
    return <main className="flex-1">{children}</main>;
  }
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AdminAuthProvider>
          <ScrollToTop />
          <SiteChrome>
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
              <Route
                path="/growth-partner"
                element={
                  <AdminProtectedRoute>
                    <GrowthPartnerPage />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/growth-partner/:id"
                element={
                  <AdminProtectedRoute>
                    <GrowthBusinessDetailPage />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/growth-partner/reports/:id"
                element={
                  <AdminProtectedRoute>
                    <GrowthReportDetailPage />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/developers"
                element={
                  <ProtectedRoute>
                    <DevelopersPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/build" element={<BuildPage />} />
              <Route
                path="/partner"
                element={
                  <ProtectedRoute>
                    <PartnerPortalPage />
                  </ProtectedRoute>
                }
              />
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

              {/* Admin area — own login, own chrome */}
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route
                path="/admin"
                element={
                  <AdminProtectedRoute>
                    <AdminLayout />
                  </AdminProtectedRoute>
                }
              >
                <Route index element={<BusinessesPage />} />
                <Route path="businesses" element={<BusinessesPage />} />
                <Route path="businesses/:id" element={<BusinessDetailPage />} />
                <Route path="reports/:id" element={<ReportDetailPage />} />
                <Route path="reviews" element={<ReviewsPage />} />
              </Route>

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
          </SiteChrome>
          <Toaster />
        </AdminAuthProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
