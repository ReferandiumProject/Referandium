'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { Trash2, Plus, LayoutDashboard, Loader2, Save, Pencil, X, ImagePlus, Gavel } from 'lucide-react';
import ThemeSwitch from '../components/ThemeSwitch';

// Supabase Bağlantısı
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminPage() {
  const { connected, publicKey } = useWallet();
  const [activeTab, setActiveTab] = useState<'markets' | 'gookies'>('markets');
  
  // Market States
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const CATEGORIES = ['Crypto', 'Politics', 'Sports', 'Pop Culture', 'Business'];

  // Market Form State
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    image_url: '',
    end_date: '',
    category: '',
  });
  const [marketType, setMarketType] = useState<'binary' | 'multiple'>('binary');
  const [options, setOptions] = useState([{ title: '', bid_price: '' }, { title: '', bid_price: '' }]);
  const [categoryError, setCategoryError] = useState(false);

  // Gookies States
  const [gookies, setGookies] = useState<any[]>([]);
  const [gookieFormData, setGookieFormData] = useState({
    title: '',
    description: '',
    image_url: '',
    end_date: '',
    starting_bid: '0.01',
  });
  const [editingGookieId, setEditingGookieId] = useState<string | null>(null);

  // Fetch Data
  useEffect(() => {
    if (activeTab === 'markets') {
      fetchMarkets();
    } else {
      fetchGookies();
    }
  }, [activeTab]);

  const fetchGookies = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('gookies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGookies(data || []);
    } catch (error) {
      console.error('Error fetching gookies:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMarkets = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('markets')
        .select('*, options:market_options(*)')
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
      title: market.title || market.question || '',
      description: market.description || '',
      image_url: market.image_url || '',
      end_date: market.end_date ? market.end_date.split('T')[0] : '',
      category: market.category || '',
    });
    // Detect market type based on options
    if (market.options && market.options.length > 0) {
      setMarketType('multiple');
      setOptions(market.options.map((opt: any) => ({ title: opt.title || '', bid_price: opt.bid_price || '' })));
    } else {
      setMarketType('binary');
      setOptions([{ title: '', bid_price: '' }, { title: '', bid_price: '' }]);
    }
    setCategoryError(false);
  };

  // Formu temizle
  const clearForm = () => {
    setEditingId(null);
    setImageFile(null);
    setImagePreview(null);
    setFormData({ title: '', description: '', image_url: '', end_date: '', category: '' });
    setMarketType('binary');
    setOptions([{ title: '', bid_price: '' }, { title: '', bid_price: '' }]);
    setCategoryError(false);
  };

  // Gookie Form Functions
  const handleEditGookie = (gookie: any) => {
    setEditingGookieId(gookie.id);
    setImageFile(null);
    setImagePreview(gookie.image_url || null);
    setGookieFormData({
      title: gookie.title || '',
      description: gookie.description || '',
      image_url: gookie.image_url || '',
      end_date: gookie.end_date ? new Date(gookie.end_date).toISOString().slice(0, 16) : '',
      starting_bid: gookie.starting_bid?.toString() || '0.01',
    });
  };

  const clearGookieForm = () => {
    setEditingGookieId(null);
    setImageFile(null);
    setImagePreview(null);
    setGookieFormData({ title: '', description: '', image_url: '', end_date: '', starting_bid: '0.01' });
  };

  const handleSubmitGookie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected || !publicKey) {
      alert("Please connect your wallet first!");
      return;
    }

    try {
      setIsSubmitting(true);
      let imageUrlToSave = gookieFormData.image_url;

      if (imageFile) {
        imageUrlToSave = await uploadImage(imageFile);
      }

      const gookieData = {
        title: gookieFormData.title,
        description: gookieFormData.description,
        image_url: imageUrlToSave,
        starting_bid: parseFloat(gookieFormData.starting_bid),
        end_time: new Date(gookieFormData.end_date).toISOString(),
        creator_wallet: publicKey.toBase58(),
        status: 'active'
      };

      if (editingGookieId) {
        const { error } = await supabase
          .from('gookies')
          .update(gookieData)
          .eq('id', editingGookieId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('gookies')
          .insert(gookieData);
        if (error) throw error;
      }

      alert(`Gookie auction successfully ${editingGookieId ? 'updated' : 'created'}!`);
      clearGookieForm();
      fetchGookies();

    } catch (error: any) {
      console.error('Error submitting gookie:', error);
      alert('Error: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGookie = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Gookie auction?')) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('gookies').delete().eq('id', id);
      if (error) throw error;
      fetchGookies();
    } catch (error) {
      console.error('Error deleting gookie:', error);
      alert('Error deleting gookie');
    } finally {
      setLoading(false);
    }
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

      // Filter out empty options (only for multiple choice markets)
      const validOptions = options.filter(opt => opt.title.trim() !== '');
      if (marketType === 'multiple' && validOptions.length < 2) {
        alert('Please add at least 2 options with titles.');
        setIsSubmitting(false);
        return;
      }

      if (editingId) {
        // Update existing market
        const { error } = await supabase
          .from('markets')
          .update({
            title: formData.title,
            description: formData.description,
            image_url: imageUrl,
            end_date: formData.end_date,
            category: formData.category,
          })
          .eq('id', editingId);

        if (error) throw error;

        // Delete old options first
        await supabase.from('market_options').delete().eq('market_id', editingId);
        
        // Insert new options only for multiple choice markets
        if (marketType === 'multiple') {
          const optionsData = validOptions.map(opt => ({
            market_id: editingId,
            title: opt.title.trim(),
            bid_price: opt.bid_price.trim() || null,
            yes_pool: 0,
            no_pool: 0,
          }));
          const { error: optError } = await supabase.from('market_options').insert(optionsData);
          if (optError) throw optError;
        }

        alert('Market updated successfully! ✅');
      } else {
        // Step 1: Insert market
        const { data: market, error: marketError } = await supabase.from('markets').insert({
          title: formData.title,
          description: formData.description,
          image_url: imageUrl,
          end_date: formData.end_date,
          category: formData.category,
          created_by: publicKey?.toBase58(),
        }).select().single();

        if (marketError) throw marketError;

        // Step 2: Insert options (only for multiple choice markets)
        if (marketType === 'multiple') {
          const optionsData = validOptions.map(opt => ({
            market_id: market.id,
            title: opt.title.trim(),
            bid_price: opt.bid_price.trim() || null,
            yes_pool: 0,
            no_pool: 0,
          }));
          const { error: optError } = await supabase.from('market_options').insert(optionsData);
          if (optError) throw optError;
        }

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
      // Önce bağlı verileri sil (Foreign Key hatasını önlemek için)
      await supabase.from('market_options').delete().eq('market_id', id);
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
      <div className="min-h-screen flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <p className="text-gray-500 dark:text-gray-400 font-medium">Loading Dashboard...</p>
      </div>
    );
  }

  // 2. Cüzdan Bağlı Değilse
  if (!connected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md w-full">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Admin Access</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">You must connect your wallet to manage markets.</p>
          <div className="flex justify-center">
            <WalletMultiButton className="!bg-blue-600 !rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // 3. Ana Dashboard
  return (
    <div className="min-h-screen p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <LayoutDashboard className="text-blue-600" />
              Admin Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitch />
            <WalletMultiButton className="!bg-gray-900 !rounded-xl" />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-4 mb-8 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('markets')}
            className={`pb-4 px-2 text-lg font-bold transition-colors ${
              activeTab === 'markets' 
                ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Markets
          </button>
          <button
            onClick={() => setActiveTab('gookies')}
            className={`pb-4 px-2 text-lg font-bold transition-colors flex items-center gap-2 ${
              activeTab === 'gookies' 
                ? 'border-b-2 border-orange-500 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <span>🍪</span> Gookies
          </button>
        </div>

        {activeTab === 'markets' ? (
          /* MARKETS TAB */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* SOL TARAF: Yeni Piyasa Formu */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 sticky top-6">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                {editingId ? (
                  <><Pencil size={20} className="text-amber-600" /> Edit Market</>
                ) : (
                  <><Plus size={20} className="text-green-600" /> Create New Market</>
                )}
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Market Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Who will be the next transfer target?"
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                  <textarea
                    rows={3}
                    placeholder="Market details..."
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Category <span className="text-red-500">*</span></label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => { setFormData({ ...formData, category: cat }); setCategoryError(false); }}
                        className={`px-4 py-2 rounded-full text-sm font-semibold transition-all border ${
                          formData.category === cat
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white shadow-md'
                            : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 hover:border-gray-300'
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Image</label>
                  
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

                  <label className="flex items-center justify-center gap-2 w-full p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition text-sm text-gray-500 dark:text-gray-400">
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

                {/* Market Type Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Market Type <span className="text-red-500">*</span></label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setMarketType('binary')}
                      className={`flex-1 p-3 rounded-xl border-2 transition-all text-sm font-semibold ${
                        marketType === 'binary'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                      }`}
                    >
                      <div className="text-center">
                        <div className="text-lg mb-1">🎯</div>
                        <div>Binary (Yes/No)</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMarketType('multiple')}
                      className={`flex-1 p-3 rounded-xl border-2 transition-all text-sm font-semibold ${
                        marketType === 'multiple'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                      }`}
                    >
                      <div className="text-center">
                        <div className="text-lg mb-1">📊</div>
                        <div>Multiple Choice</div>
                      </div>
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {marketType === 'binary' 
                      ? 'Simple Yes/No question. No options needed.' 
                      : 'Users choose from multiple options, then vote Yes/No on each.'}
                  </p>
                </div>

                {/* Dynamic Options Section (Only for Multiple Choice) */}
                {marketType === 'multiple' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Options <span className="text-red-500">*</span> <span className="text-xs font-normal text-gray-400">(min 2)</span></label>
                  <div className="space-y-2">
                    {options.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5 text-center shrink-0">{idx + 1}</span>
                        <input
                          type="text"
                          placeholder="Option title"
                          className="flex-1 p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                          value={opt.title}
                          onChange={(e) => {
                            const updated = [...options];
                            updated[idx] = { ...updated[idx], title: e.target.value };
                            setOptions(updated);
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Bid price"
                          className="w-24 p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                          value={opt.bid_price}
                          onChange={(e) => {
                            const updated = [...options];
                            updated[idx] = { ...updated[idx], bid_price: e.target.value };
                            setOptions(updated);
                          }}
                        />
                        {options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setOptions(options.filter((_, i) => i !== idx))}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition shrink-0"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOptions([...options, { title: '', bid_price: '' }])}
                    className="mt-2 w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 transition flex items-center justify-center gap-1.5"
                  >
                    <Plus size={14} /> Add Option
                  </button>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-gray-700 dark:text-white"
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
                    className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium py-3 rounded-xl transition flex items-center justify-center gap-2"
                  >
                    <X size={18} /> Cancel Editing
                  </button>
                )}
              </form>
            </div>
          </div>

          {/* SAĞ TARAF: Piyasa Listesi */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">Active Markets</h2>
                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">
                  {markets.length} Total
                </span>
              </div>

              {markets.length === 0 ? (
                <div className="p-10 text-center text-gray-400 dark:text-gray-500">
                  No markets found. Create one from the left panel.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {markets.map((market) => (
                    <div key={market.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition flex items-start gap-4">
                      <img 
                        src={market.image_url} 
                        alt="market" 
                        className="w-16 h-16 rounded-lg object-cover bg-gray-200 border border-gray-200"
                        onError={(e) => (e.target as HTMLImageElement).src = 'https://placehold.co/100'}
                      />
                      
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 dark:text-white">{market.title || market.question}</h3>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                          <span>📅 {new Date(market.end_date).toLocaleDateString()}</span>
                          <span>💰 {market.total_pool} SOL</span>
                          {market.category && (
                            <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{market.category}</span>
                          )}
                        </div>
                      </div>

                      {market.outcome ? (
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                          market.outcome === 'YES' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                          Won: {market.outcome}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSettle(market.id)}
                          className="p-2 text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition"
                          title="Settle Market"
                        >
                          <Gavel size={18} />
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(market)}
                        className={`p-2 rounded-lg transition ${editingId === market.id ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-amber-600'}`}
                        title="Edit Market"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(market.id)}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
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
        ) : (
          /* GOOKIES TAB */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* LEFT: Create Gookie Form */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 sticky top-6">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                  {editingGookieId ? (
                    <><Pencil size={20} className="text-amber-600" /> Edit Gookie</>
                  ) : (
                    <><Plus size={20} className="text-orange-600" /> Create Gookie Auction</>
                  )}
                </h2>
                
                <form onSubmit={handleSubmitGookie} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Rare Gookie #001"
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                      value={gookieFormData.title}
                      onChange={(e) => setGookieFormData({ ...gookieFormData, title: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                    <textarea
                      rows={3}
                      placeholder="Auction details..."
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                      value={gookieFormData.description}
                      onChange={(e) => setGookieFormData({ ...gookieFormData, description: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Image</label>
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 dark:file:bg-orange-900/30 dark:file:text-orange-400"
                      />
                      {imagePreview && (
                        <div className="relative">
                          <img src={imagePreview} alt="Preview" className="w-full h-32 object-cover rounded-xl border border-gray-200 dark:border-gray-600" />
                          <button
                            type="button"
                            onClick={() => { setImageFile(null); setImagePreview(null); }}
                            className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                      <input
                        type="url"
                        placeholder="Or paste image URL"
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                        value={gookieFormData.image_url}
                        onChange={(e) => setGookieFormData({ ...gookieFormData, image_url: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Starting Bid (SOL)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.01"
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                      value={gookieFormData.starting_bid}
                      onChange={(e) => setGookieFormData({ ...gookieFormData, starting_bid: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date & Time</label>
                    <input
                      type="datetime-local"
                      required
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 dark:text-white"
                      value={gookieFormData.end_date}
                      onChange={(e) => setGookieFormData({ ...gookieFormData, end_date: e.target.value })}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Select the exact date and time when the auction should end
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`w-full ${editingGookieId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-orange-600 hover:bg-orange-700'} text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="animate-spin" size={20} /> {editingGookieId ? 'Updating...' : 'Creating...'}
                      </>
                    ) : (
                      <>
                        <Save size={20} /> {editingGookieId ? 'Update Gookie' : 'Create Auction'}
                      </>
                    )}
                  </button>

                  {editingGookieId && (
                    <button
                      type="button"
                      onClick={clearGookieForm}
                      className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium py-3 rounded-xl transition flex items-center justify-center gap-2"
                    >
                      <X size={18} /> Cancel Editing
                    </button>
                  )}
                </form>
              </div>
            </div>

            {/* RIGHT: Gookies List */}
            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <span>🍪</span> Gookie Auctions
                  </h2>
                  <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold">
                    {gookies.length} Total
                  </span>
                </div>

                {gookies.length === 0 ? (
                  <div className="p-10 text-center text-gray-400 dark:text-gray-500">
                    No auctions found. Create one from the left panel.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {gookies.map((gookie) => (
                      <div key={gookie.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition flex items-start gap-4">
                        <img 
                          src={gookie.image_url} 
                          alt="gookie" 
                          className="w-16 h-16 rounded-lg object-cover bg-gray-200 border border-gray-200"
                          onError={(e) => (e.target as HTMLImageElement).src = 'https://placehold.co/100'}
                        />
                        
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900 dark:text-white">{gookie.title}</h3>
                          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                            <span>📅 {new Date(gookie.end_time).toLocaleDateString()}</span>
                            <span>💰 {gookie.current_highest_bid > 0 ? gookie.current_highest_bid : gookie.starting_bid} SOL</span>
                            <span className={`px-2 py-0.5 rounded-full font-medium ${
                              gookie.status === 'active' 
                                ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400' 
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                            }`}>
                              {gookie.status}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleEditGookie(gookie)}
                          className={`p-2 rounded-lg transition ${editingGookieId === gookie.id ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-amber-600'}`}
                          title="Edit Gookie"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteGookie(gookie.id)}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                          title="Delete Gookie"
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
        )}

      </div>
    </div>
  );
}