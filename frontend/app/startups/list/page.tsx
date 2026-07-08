"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useUser } from "@/app/context/UserContext";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Spinner } from "@/app/components/ui/Spinner";

const LISTING_FEE = 200;
const MAX_DESC = 100;

export default function StartupListPage() {
  const { dbUser, authenticated, loading: authLoading } = useUser();
  const { getAccessToken } = usePrivy();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);

  if (authLoading) {
    return (
      <main className="mx-auto flex max-w-[1200px] items-center gap-2 px-4 py-12 text-muted">
        <Spinner /> Loading...
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="mx-auto flex max-w-[1200px] flex-col items-center justify-center px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-ink">Sign in to list your startup</h1>
        <p className="mt-2 text-muted">You need to be signed in to launch a market.</p>
        <Link
          href="/signin"
          className="mt-6 inline-flex items-center rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Sign In
        </Link>
      </main>
    );
  }

  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pitch, setPitch] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [stage, setStage] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!dbUser) return;

    const fetchPortfolio = async () => {
      try {
        const token = await getAccessToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch("/api/startup-portfolio", { headers });
        const json = await res.json();
        if (json.data?.summary) {
          setBalance(Number(json.data.summary.available_usdc));
        }
      } catch {
        setBalance(null);
      }
    };

    fetchPortfolio();
  }, [dbUser, getAccessToken]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setLogoFile(file);
    if (file) {
      setLogoPreview(URL.createObjectURL(file));
    } else {
      setLogoPreview(null);
    }
  };

  const goToStep2 = () => {
    setError(null);
    if (!name.trim()) {
      setError("Startup name is required");
      return;
    }
    if (!description.trim()) {
      setError("Description is required");
      return;
    }
    if (description.length > MAX_DESC) {
      setError(`Description must be ${MAX_DESC} characters or less`);
      return;
    }
    setStep(2);
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile || !dbUser) return null;

    const ext = logoFile.name.split(".").pop();
    const path = `${dbUser.id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("startup-logos")
      .upload(path, logoFile, { upsert: true });

    if (uploadError) {
      // Logo is optional — continue without it
      return null;
    }

    const { data } = supabase.storage.from("startup-logos").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleLaunch = async () => {
    setLoading(true);
    setError(null);

    try {
      const logoUrl = await uploadLogo();
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/startups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          pitch: pitch.trim() || null,
          website: website.trim() || null,
          twitter: twitter.trim() || null,
          stage: stage || null,
          logo_url: logoUrl,
        }),
      });

      const data = await res.json();

      if (res.ok && data.data?.market_id) {
        const marketId = data.data.market_id;
        // Brief success confirmation before redirecting
        setSuccess(true);
        setTimeout(() => {
          router.push(`/startups/market/${marketId}`);
        }, 1500);
      } else {
        setError(data.error || "Failed to launch market");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const insufficientBalance = balance !== null && balance < LISTING_FEE;

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight text-ink">List Your Startup</h1>

      {/* Step indicator */}
      <div className="mt-4 flex items-center gap-2 text-sm">
        <span className={step === 1 ? "font-semibold text-ink" : "text-muted"}>
          1. Details
        </span>
        <span className="text-muted">→</span>
        <span className={step === 2 ? "font-semibold text-ink" : "text-muted"}>
          2. Payment
        </span>
      </div>

      {/* Step 1: Details */}
      {step === 1 && (
        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-muted">
              Startup Name <span className="text-muted">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc."
              className="input mt-1"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-muted">
              One-line Description <span className="text-muted">*</span>
            </label>
            <input
              id="description"
              type="text"
              value={description}
              maxLength={MAX_DESC}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="The future of..."
              className="input mt-1"
            />
            <p className="mt-1 text-right text-xs text-muted">
              {description.length}/{MAX_DESC}
            </p>
          </div>

          <div>
            <label htmlFor="pitch" className="block text-sm font-medium text-muted">
              Pitch <span className="text-muted">(optional)</span>
            </label>
            <textarea
              id="pitch"
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              placeholder="What problem are you solving and how?"
              rows={4}
              className="input mt-1"
            />
          </div>

          <div>
            <label htmlFor="website" className="block text-sm font-medium text-muted">
              Website <span className="text-muted">(optional)</span>
            </label>
            <input
              id="website"
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://acme.com"
              className="input mt-1"
            />
          </div>

          <div>
            <label htmlFor="twitter" className="block text-sm font-medium text-muted">
              Twitter / X <span className="text-muted">(optional)</span>
            </label>
            <input
              id="twitter"
              type="text"
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="@acme"
              className="input mt-1"
            />
          </div>

          <div>
            <label htmlFor="stage" className="block text-sm font-medium text-muted">
              Stage <span className="text-muted">(optional)</span>
            </label>
            <select
              id="stage"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="input mt-1"
            >
              <option value="">Select a stage</option>
              <option value="Idea">Idea</option>
              <option value="MVP">MVP</option>
              <option value="Seed">Seed</option>
              <option value="Series A+">Series A+</option>
            </select>
          </div>

          <div>
            <label htmlFor="logo" className="block text-sm font-medium text-muted">
              Logo <span className="text-muted">(optional)</span>
            </label>
            <input
              id="logo"
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
            />
            {logoPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoPreview}
                alt="Logo preview"
                className="mt-3 h-16 w-16 rounded-md object-cover"
              />
            )}
          </div>

          {error && <p className="text-sm text-short">{error}</p>}

          <button onClick={goToStep2} className="btn btn-primary w-full">
            Continue
          </button>
        </div>
      )}

      {/* Step 2: Payment */}
      {step === 2 && (
        <div className="mt-6 space-y-5">
          <div className="card">
            <h2 className="text-sm font-semibold text-muted">Summary</h2>
            <div className="mt-3 flex items-start gap-3">
              {logoPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoPreview}
                  alt="Logo"
                  className="h-12 w-12 rounded-md object-cover"
                />
              )}
              <div>
                <p className="font-medium text-ink">{name}</p>
                <p className="text-sm text-muted">{description}</p>
              </div>
            </div>
          </div>

          <div className="card space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Listing Fee</span>
              <span className="font-semibold text-ink">${LISTING_FEE.toFixed(2)} USDC</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Your Available Balance</span>
              <span className={insufficientBalance ? "text-short font-semibold" : "font-semibold text-ink"}>
                {balance !== null ? `$${balance.toFixed(2)} USDC` : "—"}
              </span>
            </div>
          </div>

          {error && <p className="text-sm text-short">{error}</p>}

          {success ? (
            <div className="flex items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium text-long">
              <Spinner />
              Market launched successfully! Redirecting...
            </div>
          ) : insufficientBalance ? (
            <Link href="/profile" className="btn btn-primary w-full">
              Deposit funds first
            </Link>
          ) : (
            <button
              onClick={handleLaunch}
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading && <Spinner />}
              {loading ? "Launching..." : `Pay $${LISTING_FEE} and Launch Market`}
            </button>
          )}

          {!success && (
            <button
              onClick={() => { setStep(1); setError(null); }}
              className="w-full text-sm text-muted hover:text-ink"
            >
              Back to details
            </button>
          )}
        </div>
      )}
    </main>
  );
}
