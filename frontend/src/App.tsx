import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { StaffDashboard } from './components/StaffDashboard';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { Footer } from './components/Footer';

const PrivateRoute: React.FC<{ children: React.ReactNode; adminOnly?: boolean; teamleiterOrAdmin?: boolean }> = ({
  children,
  adminOnly = false,
  teamleiterOrAdmin = false,
}) => {
  const { user, isAdmin, isTeamleiterOrAdmin } = useAuth();

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" />;
  }

  if (teamleiterOrAdmin && !isTeamleiterOrAdmin) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { user, isTeamleiterOrAdmin } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            {isTeamleiterOrAdmin ? <AdminDashboard /> : <StaffDashboard />}
          </PrivateRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <PrivateRoute teamleiterOrAdmin>
            <AdminDashboard />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <div style={{ flex: 1 }}>
            <AppRoutes />
          </div>
          <Footer />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
