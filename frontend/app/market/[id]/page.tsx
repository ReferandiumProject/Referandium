import type { Metadata, ResolvingMetadata } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';
import MarketDetailClient from './MarketDetailClient';

export async function generateMetadata(
  { params }: { params: { id: string } },
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { data: market } = await supabaseAdmin
    .from('markets')
    .select('*')
    .eq('id', params.id)
    .single();

  const previousImages = (await parent).openGraph?.images || [];

  if (!market) {
    return {
      title: 'Market Not Found | Referandium',
      description: 'Trade on real-world outcomes with USDC on Solana.',
      openGraph: {
        images: ['/og-default.png', ...previousImages],
      },
    };
  }

  const title = `${market.title || 'Market'} | Referandium`;
  const description = market.description || 'Trade on real-world outcomes with USDC on Solana.';

  const imageUrl = (market as any).image_url;
  const images = imageUrl && imageUrl.startsWith('http')
    ? [imageUrl, ...previousImages]
    : ['/og-default.png', ...previousImages];

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images,
      type: 'website',
      siteName: 'Referandium',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images,
    },
  };
}

export default function MarketDetailPage({ params }: { params: { id: string } }) {
  return <MarketDetailClient id={params.id} />;
}