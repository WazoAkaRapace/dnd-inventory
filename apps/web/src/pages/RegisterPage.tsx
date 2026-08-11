import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function RegisterPage() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(username, password, displayName);
      nav('/parties');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Inscription échouée');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">⚔️</div>
          <h1 className="font-display text-2xl font-bold text-blood-700">Créer un compte</h1>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Nom affiché</label>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Le MD"
              required
            />
          </div>
          <div>
            <label className="label">Nom d'utilisateur</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              required
            />
          </div>
          <div>
            <label className="label">Mot de passe (≥ 6 caractères)</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Création…' : "S'inscrire"}
          </button>
        </form>
        <p className="text-center text-sm text-ink-400 mt-4">
          Déjà un compte ?{' '}
          <Link to="/login" className="text-blood-600 font-medium hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
