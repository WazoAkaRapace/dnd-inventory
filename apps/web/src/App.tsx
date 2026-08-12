import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { useSync } from './sync';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import PartiesPage from './pages/PartiesPage';
import PartyPage from './pages/PartyPage';
import CharacterInventoryPage from './pages/CharacterInventoryPage';
import GmDashboardPage from './pages/GmDashboardPage';
import NpcPage from './pages/NpcPage';

function SyncIndicator() {
  const { status } = useSync();
  const colors = { connected: 'bg-green-400', connecting: 'bg-yellow-400', disconnected: 'bg-red-400' };
  const labels = { connected: 'Synchronisé', connecting: 'Connexion…', disconnected: 'Hors ligne' };
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]}`}
      title={labels[status]}
      aria-label={labels[status]}
    />
  );
}

function Nav() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  if (!user) return null;

  return (
    <header className="sticky top-0 z-30 bg-ink-900 text-parchment-50 shadow-md">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/parties" className="font-display text-lg font-semibold flex items-center gap-2">
          <span className="text-blood-500">⚔</span>
          <span className="hidden sm:inline">Inventaire D&D</span>
          <span className="sm:hidden">D&D</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          {(loc.pathname.startsWith('/party/') || loc.pathname === '/parties') && (
            <Link to="/parties" className="btn-ghost text-parchment-50 hover:bg-ink-700 text-sm">
              <span className="hidden sm:inline">Mes groupes</span>
              <span className="sm:hidden">🏠</span>
            </Link>
          )}
          <span className="text-sm text-parchment-200 hidden sm:inline">{user.displayName}</span>
          <SyncIndicator />
          <button onClick={logout} className="btn-ghost text-parchment-50 hover:bg-ink-700 text-sm">
            Déconnexion
          </button>
        </div>
      </div>
    </header>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-ink-400 animate-pulse">Chargement…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <Nav />
      <main className="max-w-6xl mx-auto px-4 py-6 pb-24">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/parties" element={<ProtectedRoute><PartiesPage /></ProtectedRoute>} />
          <Route path="/party/:partyId" element={<ProtectedRoute><PartyPage /></ProtectedRoute>} />
          <Route path="/party/:partyId/character/:charId" element={<ProtectedRoute><CharacterInventoryPage /></ProtectedRoute>} />
          <Route path="/party/:partyId/gm" element={<ProtectedRoute><GmDashboardPage /></ProtectedRoute>} />
          <Route path="/party/:partyId/npcs" element={<ProtectedRoute><NpcPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/parties" replace />} />
        </Routes>
      </main>
    </>
  );
}
