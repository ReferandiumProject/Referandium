'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { supabase } from '@/lib/supabaseClient';

export interface AppUser {
  id: string;
  wallet_address: string;
  username: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface UserContextType {
  user: AppUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  loading: false,
  refreshUser: async () => {},
});

const AVATAR_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981',
  '#6366F1', '#EF4444', '#14B8A6', '#F97316', '#06B6D4',
];

function getAvatarColor(wallet: string): string {
  let hash = 0;
  for (let i = 0; i < wallet.length; i++) {
    hash = wallet.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function UserProvider({ children }: { children: ReactNode }) {
  const { publicKey, connected } = useWallet();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchOrCreateUser = async () => {
    if (!publicKey) {
      setUser(null);
      return;
    }

    const walletAddress = publicKey.toBase58();
    setLoading(true);

    try {
      // Check if user exists
      const { data: existing, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('wallet_address', walletAddress)
        .single();

      if (existing && !fetchError) {
        setUser(existing as AppUser);
        return;
      }

      // User doesn't exist — create one
      const username = 'User_' + walletAddress.slice(0, 6);
      const avatarColor = getAvatarColor(walletAddress);
      const avatarUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${walletAddress}&backgroundColor=${avatarColor.replace('#', '')}`;

      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          wallet_address: walletAddress,
          username,
          avatar_url: avatarUrl,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating user:', insertError.message);
        // Try fetching again in case of race condition (another tab created it)
        const { data: retry } = await supabase
          .from('users')
          .select('*')
          .eq('wallet_address', walletAddress)
          .single();
        if (retry) setUser(retry as AppUser);
      } else if (newUser) {
        setUser(newUser as AppUser);
      }
    } catch (err) {
      console.error('User fetch/create error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connected && publicKey) {
      fetchOrCreateUser();
    } else {
      setUser(null);
    }
  }, [connected, publicKey]);

  return (
    <UserContext.Provider value={{ user, loading, refreshUser: fetchOrCreateUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
