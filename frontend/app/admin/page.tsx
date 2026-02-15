'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { ArrowLeft, Trash2, Plus, LayoutDashboard, Loader2, Save, Pencil, X, ImagePlus, Gavel } from 'lucide-react';

// Supabase Bağlantısı
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminPage() {
  const { connected, publicKey } = useWallet();
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const CATEGORIES = ['Crypto', 'Politics', 'Sports', 'Pop Culture', 'Business'];

  // Form State
  const [formData, setFormData] = useState({
    question: '',
    description: '',
    image_url: '',
    end_date: '',
    category: '',
  });
  const [categoryError, setCategoryError] = useState(false);

  // Verileri Çek
  useEffect(() => {
    fetchMarkets();
  }, []);

  const fetchMarkets = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('markets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMarkets(data || []);
    } catch (error) {
      console.error('Error fetching markets:', error);
    } finally {
      // Hata olsa da olmasa da yüklemeyi durdur
      setLoading(false);
    }
  };

  // Edit butonuna basınca formu doldur
  const handleEdit = (market: any) => {
    setEditingId(market.id);
    setImageFile(null);
    setImagePreview(market.image_url || null);
    setFormData({
      question: market.question || '',
      description: market.description || '',
      image_url: market.image_url || '',
      end_date: market.end_date ? market.end_date.split('T')[0] : '',
      category: market.category || '',
    });
    setCategoryError(false);
  };

  // Formu temizle
  const clearForm = () => {
    setEditingId(null);
    setImageFile(null);
    setImagePreview(null);
    setFormData({ question: '', description: '', image_url: '', end_date: '', category: '' });
    setCategoryError(false);
  };

  // Dosya seçildiğinde
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setImageFile(file);
    if (file) {
      setImagePreview(URL.createObjectURL(file));
    }
  };

  // Resmi Supabase Storage'a yükle
  const uploadImage = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
    const filePath = `markets/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('images').getPublicUrl(filePath);
    return data.publicUrl;
  };

  // Yeni Piyasa Ekleme / Güncelleme
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected) {
      alert('Please connect your wallet first.');
      return;
    }

    if (!formData.category) {
      setCategoryError(true);
      return;
    }
    setCategoryError(false);

    setIsSubmitting(true);
    try {
      // Resim yükleme (varsa)
      let imageUrl = formData.image_url;
      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }

      if (editingId) {
        // Update existing market
        const { error } = await supabase
          .from('markets')
          .update({
            question: formData.question,
            description: formData.description,
            image_url: imageUrl,
            end_date: formData.end_date,
            category: formData.category,
          })
          .eq('id', editingId);

        if (error) throw error;
        alert('Market updated successfully! ✅');
      } else {
        // Insert new market
        const { error } = await supabase.from('markets').insert([
          {
            question: formData.question,
            description: formData.description,
            image_url: imageUrl,
            end_date: formData.end_date,
            category: formData.category,
            yes_count: 0,
            no_count: 0,
            total_pool: 0,
            created_by: publicKey?.toBase58(),
          },
        ]);

        if (error) throw error;
        alert('Market created successfully! 🚀');
      }

      clearForm();
      fetchMarkets();
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Piyasa Sonuçlandırma
  const handleSettle = async (marketId: string) => {
    const choice = window.prompt('Who won? Type YES or NO:');
    if (!choice) return;
    const outcome = choice.trim().toUpperCase();
    if (outcome !== 'YES' && outcome !== 'NO') {
      alert('Invalid choice. Please type YES or NO.');
      return;
    }

    try {
      const { error } = await supabase
        .from('markets')
        .update({ outcome })
        .eq('id', marketId);

      if (error) throw error;
      alert(`Market resolved as ${outcome}!`);
      fetchMarkets();
    } catch (error: any) {
      alert('Failed to settle: ' + error.message);
    }
  };

  // Piyasa Silme
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this market? This action cannot be undone.')) return;

    try {
      // Önce oyları sil (Foreign Key hatasını önlemek için - gerçi SQL'de cascade açmıştık ama garanti olsun)
      await supabase.from('votes').delete().eq('market_id', id);
      
      // Sonra marketi sil
      const { error } = await supabase.from('markets').delete().eq('id', id);

      if (error) throw error;

      setMarkets(markets.filter((m) => m.id !== id));
      alert('Market deleted.');
    } catch (error: any) {
      alert('Delete failed: ' + error.message);
    }
  };

  // --- Render ---

  // 1. Yükleniyor Ekranı
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <p className="text-gray-500 font-medium">Loading Dashboard...</p>
      </div>
    );
  }

  // 2. Cüzdan Bağlı Değilse
  if (!connected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Admin Access</h1>
          <p className="text-gray-500 mb-6">You must connect your wallet to manage markets.</p>
          <div className="flex justify-center">
            <WalletMultiButton className="!bg-blue-600 !rounded-xl" />
          </div>
          <Link href="/" className="mt-6 block text-sm text-gray-400 hover:text-gray-600">
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // 3. Ana Dashboard
  return (
    <div className="min-h-screen bg-gray-100 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 bg-white rounded-lg hover:bg-gray-50 transition text-gray-600">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <LayoutDashboard className="text-blue-600" />
              Admin Dashboard
            </h1>
          </div>
          <WalletMultiButton className="!bg-gray-900 !rounded-xl" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* SOL TARAF: Yeni Piyasa Formu */}
          <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 sticky top-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                {editingId ? (
                  <><Pencil size={20} className="text-amber-600" /> Edit Market</>
                ) : (
                  <><Plus size={20} className="text-green-600" /> Create New Market</>
                )}
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Policy Statement</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., I want Bitcoin to reach $100k by May"
                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
                    value={formData.question}
                    onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                  />
                  <p className="text-xs text-gray-400 mt-1.5">Use prescriptive language (I want, We should...) instead of questions.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    rows={3}
                    placeholder="Market details..."
                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Category <span className="text-red-500">*</span></label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => { setFormData({ ...formData, category: cat }); setCategoryError(false); }}
                        className={`px-4 py-2 rounded-full text-sm font-semibold transition-all border ${
                          formData.category === cat
                            ? 'bg-gray-900 text-white border-gray-900 shadow-md'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  {categoryError && (
                    <p className="text-xs text-red-500 mt-1.5">Please select a category.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
                  
                  {/* Önizleme */}
                  {imagePreview && (
                    <div className="mb-2 relative">
                      <img 
                        src={imagePreview} 
                        alt="Preview" 
                        className="w-full h-32 object-cover rounded-xl border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => { setImageFile(null); setImagePreview(null); setFormData({ ...formData, image_url: '' }); }}
                        className="absolute top-2 right-2 p-1 bg-white/90 rounded-lg hover:bg-red-50 transition text-gray-500 hover:text-red-500"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  <label className="flex items-center justify-center gap-2 w-full p-3 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition text-sm text-gray-500">
                    <ImagePlus size={18} />
                    {imageFile ? imageFile.name : (editingId && formData.image_url ? 'Change image...' : 'Choose an image...')}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                  {editingId && !imageFile && formData.image_url && (
                    <p className="text-xs text-gray-400 mt-1">Current image will be kept if you don&apos;t select a new one.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'} text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin" size={20} /> {editingId ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      <Save size={20} /> {editingId ? 'Update Market' : 'Publish Market'}
                    </>
                  )}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={clearForm}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 rounded-xl transition flex items-center justify-center gap-2"
                  >
                    <X size={18} /> Cancel Editing
                  </button>
                )}
              </form>
            </div>
          </div>

          {/* SAĞ TARAF: Piyasa Listesi */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">Active Markets</h2>
                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">
                  {markets.length} Total
                </span>
              </div>

              {markets.length === 0 ? (
                <div className="p-10 text-center text-gray-400">
                  No markets found. Create one from the left panel.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {markets.map((market) => (
                    <div key={market.id} className="p-4 hover:bg-gray-50 transition flex items-start gap-4">
                      <img 
                        src={market.image_url} 
                        alt="market" 
                        className="w-16 h-16 rounded-lg object-cover bg-gray-200 border border-gray-200"
                        onError={(e) => (e.target as HTMLImageElement).src = 'https://placehold.co/100'}
                      />
                      
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900">{market.question}</h3>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                          <span>📅 {new Date(market.end_date).toLocaleDateString()}</span>
                          <span>💰 {market.total_pool} SOL</span>
                          {market.category && (
                            <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{market.category}</span>
                          )}
                        </div>
                      </div>

                      {market.outcome ? (
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                          market.outcome === 'YES' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          Won: {market.outcome}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSettle(market.id)}
                          className="p-2 text-purple-500 hover:bg-purple-50 rounded-lg transition"
                          title="Settle Market"
                        >
                          <Gavel size={18} />
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(market)}
                        className={`p-2 rounded-lg transition ${editingId === market.id ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:bg-gray-100 hover:text-amber-600'}`}
                        title="Edit Market"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(market.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                        title="Delete Market"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}