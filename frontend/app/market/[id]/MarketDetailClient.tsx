'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { SystemProgram, Transaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { ArrowLeft, CheckCircle, XCircle, Share2, MessageSquare, Send, Loader2, Trash2, Trophy } from 'lucide-react';
import ThemeSwitch from '@/app/components/ThemeSwitch';

// Bileşenler
import VotingModal from '@/app/components/VotingModal';
import { Vote } from '@/app/types';

// Supabase & Sabitler
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const TREASURY_WALLET_PUBLIC_KEY = new PublicKey('PanbgtcTiZ2HasCT9CC94nUBwUx55uH8YDmZk6587da');
const ADMIN_WALLET = 'PanbgtcTiZ2HasCT9CC94nUBwUx55uH8YDmZk6587da';

export default function MarketDetailClient() {
  const { id } = useParams();
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  // State'ler
  const [market, setMarket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [voteType, setVoteType] = useState<'yes' | 'no'>('yes');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);

  // Veri Çekme
  useEffect(() => {
    fetchMarketData();
    fetchComments();
  }, [id]);

  // Kullanıcı oy vermiş mi kontrolü
  useEffect(() => {
    if (connected && publicKey && market) {
      checkIfVoted();
    }
  }, [connected, publicKey, market]);

  const fetchMarketData = async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('markets')
      .select('*')
      .eq('id', id)
      .single();
    
    if (data) setMarket(data);
    setLoading(false);
  };

  const fetchComments = async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('market_id', id)
      .order('created_at', { ascending: true });

    if (data) setComments(data);
  };

  const handlePostComment = async () => {
    if (!commentText.trim() || !connected || !publicKey || !id) return;

    setIsPostingComment(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          market_id: id,
          user_wallet: publicKey.toBase58(),
          content: commentText.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setComments(prev => [...prev, data]);
      }
      setCommentText('');
    } catch (error: any) {
      console.error('Comment error:', error);
      setNotification({ type: 'error', message: 'Failed to post comment.' });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      setComments(prev => prev.filter(c => c.id !== commentId));
      setNotification({ type: 'success', message: 'Comment deleted.' });
      setTimeout(() => setNotification(null), 2000);
    } catch (error: any) {
      console.error('Delete comment error:', error);
      setNotification({ type: 'error', message: 'Failed to delete comment.' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const checkIfVoted = async () => {
    const { data } = await supabase
      .from('votes')
      .select('*')
      .eq('market_id', id)
      .eq('user_wallet', publicKey?.toBase58())
      .single();
    
    if (data) setHasVoted(true);
  };

  // Oy Verme İşlemi (Back-end)
  const handleVoteClick = (type: 'yes' | 'no') => {
    if (!connected) {
      setNotification({ type: 'error', message: 'Lütfen önce cüzdanınızı bağlayın!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    setVoteType(type);
    setIsModalOpen(true);
  };

  const handleVote = async (vote: Vote) => {
    setIsSubmitting(true);
    try {
      // 1. Solana Transferi
      const lamports = Math.floor(vote.amount * LAMPORTS_PER_SOL);
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey!,
          toPubkey: TREASURY_WALLET_PUBLIC_KEY,
          lamports: lamports,
        })
      );
      
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');

      // 2. Supabase Kayıt (Oy)
      const { error: voteError } = await supabase.from('votes').insert({
        market_id: market.id,
        user_wallet: publicKey!.toBase58(),
        vote_direction: vote.type,
        amount_sol: vote.amount,
        transaction_signature: signature
      });
      if (voteError) throw voteError;

      // 3. Supabase Güncelleme (Anket Toplamı)
      const updateData: any = { total_pool: market.total_pool + vote.amount };
      if (vote.type === 'yes') updateData.yes_count = market.yes_count + 1;
      else updateData.no_count = market.no_count + 1;

      await supabase.from('markets').update(updateData).eq('id', market.id);

      // 4. Ekranı Güncelle
      setNotification({ type: 'success', message: 'Oyunuz başarıyla alındı! 🎉' });
      setHasVoted(true);
      setIsModalOpen(false);
      fetchMarketData(); // Verileri tazeje

    } catch (error: any) {
      console.error(error);
      setNotification({ type: 'error', message: 'İşlem başarısız oldu.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Yükleniyor...</div>;
  if (!market) return <div className="min-h-screen flex items-center justify-center">Piyasa bulunamadı.</div>;

  // Hesaplamalar
  const totalVotes = (market.yes_count || 0) + (market.no_count || 0);
  const yesPercent = totalVotes === 0 ? 0 : Math.round((market.yes_count / totalVotes) * 100);
  const noPercent = totalVotes === 0 ? 0 : Math.round((market.no_count / totalVotes) * 100);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 relative">
      
      {/* Bildirim Balonu */}
      {notification && (
        <div className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-xl flex items-center gap-3 text-white font-bold ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {notification.type === 'success' ? <CheckCircle size={20} /> : <XCircle size={20} />}
          {notification.message}
        </div>
      )}

      <div className="max-w-5xl mx-auto">
        {/* Üst Bar: Geri Dön + Cüzdan */}
        <div className="flex justify-between items-center mb-8">
          <Link href="/" className="flex items-center text-gray-500 hover:text-blue-600 transition font-medium">
            <ArrowLeft size={20} className="mr-2" />
            Piyasalara Dön
          </Link>
          <div className="flex items-center gap-3">
            <ThemeSwitch />
            <WalletMultiButton className="!bg-blue-600 hover:!bg-blue-700 !rounded-xl" />
          </div>
        </div>

        {/* Resolved Banner */}
        {market.outcome && (
          <div className={`rounded-2xl p-5 mb-6 flex items-center gap-4 shadow-lg ${
            market.outcome === 'YES'
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'
              : 'bg-gradient-to-r from-red-500 to-rose-600 text-white'
          }`}>
            <Trophy size={28} />
            <div>
              <h2 className="text-xl font-bold">Market Resolved: {market.outcome} WON</h2>
              <p className="text-sm opacity-90">This market has been settled. Voting is closed.</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
          
          {/* Görsel ve Başlık Bölümü */}
          <div className="relative h-64 md:h-80 w-full">
             <img 
                src={market.image_url} 
                alt={market.question}
                className="w-full h-full object-cover"
                onError={(e) => {(e.target as HTMLImageElement).src = 'https://placehold.co/800x400'}}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end">
                <div className="p-8 text-white w-full">
                  <h1 className="text-3xl md:text-4xl font-bold mb-2 shadow-sm">{market.question}</h1>
                  {market.description && (
                    <p className="text-gray-200 text-lg mt-2 mb-3 leading-relaxed line-clamp-2">{market.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm opacity-90">
                    <span className="bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">📅 {new Date(market.end_date).toLocaleDateString()}</span>
                    <span className="bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">💰 Havuz: {market.total_pool?.toFixed(2)} SOL</span>
                  </div>
                </div>
              </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3">
            {/* Sol Taraf: İçerik */}
            <div className="lg:col-span-2 p-8 border-r border-gray-100">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Detaylar</h2>
              <p className="text-gray-600 leading-relaxed text-lg mb-8">
                {market.description || "Bu piyasa hakkında detaylı açıklama bulunmuyor."}
              </p>

              {/* İlerleme Çubukları */}
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                  📊 Canlı Sonuçlar
                </h3>
                
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between mb-2 font-bold text-green-700">
                      <span>EVET</span>
                      <span>%{yesPercent}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div className="bg-green-500 h-3 rounded-full transition-all duration-1000" style={{ width: `${yesPercent}%` }}></div>
                    </div>
                    <div className="text-right text-xs text-gray-400 mt-1">{market.yes_count} Oy</div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2 font-bold text-red-700">
                      <span>HAYIR</span>
                      <span>%{noPercent}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div className="bg-red-500 h-3 rounded-full transition-all duration-1000" style={{ width: `${noPercent}%` }}></div>
                    </div>
                    <div className="text-right text-xs text-gray-400 mt-1">{market.no_count} Oy</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sağ Taraf: Oylama Paneli */}
            <div className="p-8 bg-blue-50/30 flex flex-col justify-center">
              {market.outcome ? (
                <div className={`text-center p-8 border-2 rounded-2xl ${
                  market.outcome === 'YES'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                    market.outcome === 'YES' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                  }`}>
                    <Trophy size={32} />
                  </div>
                  <h3 className={`text-xl font-bold mb-2 ${
                    market.outcome === 'YES' ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {market.outcome} Won!
                  </h3>
                  <p className={market.outcome === 'YES' ? 'text-green-600' : 'text-red-600'}>
                    This market has been resolved. Voting is closed.
                  </p>
                </div>
              ) : hasVoted ? (
                <div className="text-center p-8 bg-green-50 border-2 border-green-200 rounded-2xl">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-green-800 mb-2">Oyunuzu Kullandınız!</h3>
                  <p className="text-green-600">Katılımınız için teşekkürler. Sonuçları bu sayfadan takip edebilirsiniz.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-center font-bold text-gray-500 mb-2">Tarafını Seç</h3>
                  
                  <button 
                    onClick={() => handleVoteClick('yes')}
                    className="w-full group relative overflow-hidden bg-white border-2 border-green-500 hover:bg-green-500 text-green-600 hover:text-white transition-all p-4 rounded-2xl flex items-center justify-between shadow-sm hover:shadow-green-200 hover:shadow-xl"
                  >
                    <span className="font-bold text-xl">EVET</span>
                    <span className="bg-green-100 group-hover:bg-white/20 text-green-700 group-hover:text-white px-3 py-1 rounded-lg text-sm transition">Yükselir 🚀</span>
                  </button>

                  <button 
                    onClick={() => handleVoteClick('no')}
                    className="w-full group relative overflow-hidden bg-white border-2 border-red-500 hover:bg-red-500 text-red-600 hover:text-white transition-all p-4 rounded-2xl flex items-center justify-between shadow-sm hover:shadow-red-200 hover:shadow-xl"
                  >
                    <span className="font-bold text-xl">HAYIR</span>
                    <span className="bg-red-100 group-hover:bg-white/20 text-red-700 group-hover:text-white px-3 py-1 rounded-lg text-sm transition">Düşer 📉</span>
                  </button>

                  <p className="text-center text-xs text-gray-400 mt-4">
                    *Oy vermek için cüzdanınızda az miktarda SOL bulunmalıdır.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
        {/* Discussion Board */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 mt-8">
          <div className="p-6 border-b border-gray-100 bg-gray-50">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <MessageSquare size={22} className="text-blue-600" />
              Discussion Board
              <span className="ml-2 bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {comments.length}
              </span>
            </h2>
          </div>

          <div className="p-6">
            {/* Yorum Listesi */}
            {comments.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <MessageSquare size={36} className="mx-auto mb-3 opacity-40" />
                <p className="font-medium">No comments yet.</p>
                <p className="text-sm">Be the first to share your thoughts!</p>
              </div>
            ) : (
              <div className="space-y-4 mb-8 max-h-[500px] overflow-y-auto pr-2">
                {comments.map((comment) => {
                  const wallet = comment.user_wallet || '';
                  const shortWallet = wallet.length > 8 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : wallet;
                  const avatarColors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-amber-500', 'bg-emerald-500', 'bg-cyan-500', 'bg-rose-500', 'bg-indigo-500'];
                  const colorIndex = wallet.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % avatarColors.length;
                  const avatarColor = avatarColors[colorIndex];

                  const timeAgo = (dateStr: string) => {
                    const diff = Date.now() - new Date(dateStr).getTime();
                    const mins = Math.floor(diff / 60000);
                    if (mins < 1) return 'just now';
                    if (mins < 60) return `${mins}m ago`;
                    const hrs = Math.floor(mins / 60);
                    if (hrs < 24) return `${hrs}h ago`;
                    const days = Math.floor(hrs / 24);
                    return `${days}d ago`;
                  };

                  return (
                    <div key={comment.id} className="flex gap-3 group">
                      <div className={`w-9 h-9 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5`}>
                        {wallet.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-800 font-mono">{shortWallet}</span>
                          <span className="text-xs text-gray-400">{timeAgo(comment.created_at)}</span>
                        </div>
                        <p className="text-gray-600 text-sm leading-relaxed break-words">{comment.content}</p>
                      </div>
                      {connected && publicKey && (
                        publicKey.toBase58() === ADMIN_WALLET || publicKey.toBase58() === comment.user_wallet
                      ) && (
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100 shrink-0"
                          title="Delete comment"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Yorum Formu */}
            <div className="border-t border-gray-100 pt-6">
              {!connected ? (
                <div className="text-center py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <p className="text-gray-400 text-sm font-medium">Connect your wallet to join the discussion</p>
                </div>
              ) : (
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {publicKey?.toBase58().slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Share your thoughts..."
                      rows={3}
                      className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none text-sm transition"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          handlePostComment();
                        }
                      }}
                    />
                    <div className="flex justify-between items-center mt-2">
                      <p className="text-xs text-gray-400">Ctrl+Enter to send</p>
                      <button
                        onClick={handlePostComment}
                        disabled={!commentText.trim() || isPostingComment}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isPostingComment ? (
                          <><Loader2 size={16} className="animate-spin" /> Posting...</>
                        ) : (
                          <><Send size={16} /> Post Comment</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Modal */}
      <VotingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onVote={handleVote}
        referendumTitle={market.question}
        voteType={voteType}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
