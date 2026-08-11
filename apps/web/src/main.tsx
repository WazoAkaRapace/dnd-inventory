import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider, useAuth } from './auth';
import { SyncProvider } from './sync';
import './index.css';

function AppWithSync() {
  const { user } = useAuth();
  return (
    <SyncProvider user={user}>
      <App />
    </SyncProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppWithSync />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
