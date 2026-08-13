import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { useSync } from './sync';
import { HeaderProvider, useHeaderState } from './headerContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import PartiesPage from './pages/PartiesPage';
import PartyPage from './pages/PartyPage';
import CharacterInventoryPage from './pages/CharacterInventoryPage';
import GmDashboardPage from './pages/GmDashboardPage';
import NpcPage from './pages/NpcPage';
import CombatPage from './pages/CombatPage';
import CombatWidget from './components/CombatWidget';

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

/** Derive the module title + back link from the current route. */
function useRouteTitle(pathname: string): { title: string; backTo?: string } | null {
  const partyMatch = pathname.match(/^\/party\/(\d+)\/(.*)$/);
  if (partyMatch) {
    const sub = partyMatch[2];
    const partyBase = `/party/${partyMatch[1]}`;
    if (sub === 'gm') return { title: '🛡 Table du MD', backTo: partyBase };
    if (sub === 'npcs') return { title: '🎭 PNJ', backTo: partyBase };
    if (sub === 'combat') return { title: '⚔ Combat', backTo: partyBase };
    if (sub.startsWith('character/')) return { title: 'Personnage', backTo: partyBase };
    return { title: 'Groupe', backTo: '/parties' };
  }
  return null;
}

function Nav() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const { override } = useHeaderState();
  if (!user) return null;

  const routeTitle = useRouteTitle(loc.pathname);

  // A page can override the header (e.g., CombatPage shows the encounter name).
  // override.onBack = function → custom back action (button).
  // override.onBack = null → use the default route-based back link.
  const headerTitle = override?.title ?? routeTitle?.title;
  const headerBack = override?.onBack
    ? { label: '←', onClick: override.onBack }
    : routeTitle?.backTo
      ? { label: '←', to: routeTitle.backTo }
      : null;

  return (
    <header className="sticky top-0 z-30 bg-ink-900 text-parchment-50 shadow-md">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {headerBack ? (
            <>
              {headerBack.onClick ? (
                <button onClick={headerBack.onClick} className="btn-ghost text-parchment-50 hover:bg-ink-700 text-sm shrink-0">
                  {headerBack.label}
                </button>
              ) : (
                <Link to={headerBack.to!} className="btn-ghost text-parchment-50 hover:bg-ink-700 text-sm shrink-0">
                  {headerBack.label}
                </Link>
              )}
              <span className="font-display text-lg font-semibold truncate">{headerTitle}</span>
            </>
          ) : (
            <Link to="/parties" className="font-display text-lg font-semibold flex items-center gap-2">
              <span className="text-blood-500">⚔</span>
              <span className="hidden sm:inline">Inventaire D&D</span>
              <span className="sm:hidden">D&D</span>
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {(loc.pathname.startsWith('/party/') || loc.pathname === '/parties') && !routeTitle?.backTo && (
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
    <HeaderProvider>
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
          <Route path="/party/:partyId/combat" element={<ProtectedRoute><CombatPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/parties" replace />} />
        </Routes>
      </main>
      <CombatWidget />
    </HeaderProvider>
  );
}
