import { createClient } from '@supabase/supabase-js';
import type { Metadata, ResolvingMetadata } from 'next';
import MarketDetailClient from './MarketDetailClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function generateMetadata(
  { params }: { params: { id: string } },
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { data: market } = await supabase
    .from('markets')
    .select('title, question, description, image_url')
    .eq('id', params.id)
    .single();

  const previousImages = (await parent).openGraph?.images || [];

  if (!market) {
    return {
      title: 'Market Not Found | Referandium',
      description: "Don't just predict the future, prescribe it. Join the decentralized policy prescription market on Solana.",
      openGraph: {
        images: ['/og-default.png', ...previousImages],
      },
    };
  }

  const title = `${market.title || market.question || 'Market'} | Referandium`;
  const description = market.description || "Don't just predict the future, prescribe it. Join the decentralized policy prescription market on Solana.";

  const imageUrl = market.image_url;
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

export default function MarketDetailPage() {
  return <MarketDetailClient />;
}