export const revalidate = 0; // Sayfayı asla önbelleğe alma, her girişte taze veri çek.
import { createClient } from '@supabase/supabase-js';
import HomeClient from './components/HomeClient';

// Supabase Bağlantısı
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Piyasaları Çeken Fonksiyon
async function getMarkets() {
  const { data, error } = await supabase
    .from('markets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3); // Sadece son 6 piyasayı getir

  if (error) {
    console.error('Error loading markets:', error);
    return [];
  }
  return data || [];
}

export default async function Home() {
  const markets = await getMarkets();

  return <HomeClient markets={markets} />;
}