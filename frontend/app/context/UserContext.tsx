'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export interface AppUser {
  id: string;
  privy_id: string;
  email: string | null;
  wallet_address: string | null;
}

interface UserContextType {
  dbUser: AppUser | null;
  loading: boolean;
  authenticated: boolean;
  logout: () => Promise<void>;
  syncError: string | null;
}

const UserContext = createContext<UserContextType>({
  dbUser: null,
  loading: false,
  authenticated: false,
  logout: async () => {},
  syncError: null,
});

export function UserProvider({ children }: { children: ReactNode }) {
  const { authenticated, ready, logout, getAccessToken } = usePrivy();
  const [dbUser, setDbUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    if (!authenticated) {
      setDbUser(null);
      setSyncError(null);
      return;
    }

    const syncUser = async () => {
      setLoading(true);
      setSyncError(null);

      try {
        const token = await getAccessToken();
        if (!token) {
          throw new Error('No access token available');
        }

        console.log('[UserContext] syncing user with /api/auth/sync');
        const res = await fetch('/api/auth/sync', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Sync failed with status ${res.status}`);
        }

        const data = await res.json();
        console.log('[UserContext] user synced, id:', data.id);

        setDbUser({
          id: data.id,
          privy_id: data.privy_id,
          email: data.email,
          wallet_address: data.wallet_address,
        });
      } catch (err: any) {
        console.error('[UserContext] sync error:', err);
        setSyncError(err.message || 'Failed to sync user');
        setDbUser(null);
      } finally {
        setLoading(false);
      }
    };

    syncUser();
  }, [authenticated, ready, getAccessToken]);

  return (
    <UserContext.Provider value={{ dbUser, loading, authenticated, logout, syncError }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
