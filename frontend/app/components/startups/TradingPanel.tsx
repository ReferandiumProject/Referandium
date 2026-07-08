"use client";

import { useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { estimateTrade } from "@/lib/bonding-curve";
import { Spinner } from "@/app/components/ui/Spinner";

type Props = {
  marketId: string;
  totalSupply: number;
  authenticated: boolean;
  onTraded: () => void;
};

export function TradingPanel({ marketId, totalSupply, authenticated, onTraded }: Props) {
  const { getAccessToken } = usePrivy();
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const collateral = parseFloat(amount) || 0;

  const estimate = useMemo(
    () => estimateTrade(direction, totalSupply, collateral),
    [direction, totalSupply, collateral]
  );

  const handleTrade = async () => {
    if (collateral <= 0) {
      setMessage("Enter a valid amount");
      return;
    }
    setLoading(true);
    setMessage(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/trade/open", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          market_id: marketId,
          direction,
          collateral_usdc: collateral,
        }),
      });
      const data = await res.json();

      if (data.data) {
        setMessage(`Opened ${direction} — ${data.data.size_tokens.toFixed(2)} tokens`);
        setAmount("");
        onTraded();
      } else {
        setMessage(data.error || "Trade failed");
      }
    } catch {
      setMessage("Network error");
    } finally {
      setLoading(false);
    }
  };

  const isError = message !== null && !message.startsWith("Opened");

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-ink">Take a Position</h2>

      {/* Long / Short toggle */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => setDirection("long")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            direction === "long"
              ? "bg-long text-white"
              : "bg-surface text-muted hover:text-ink"
          }`}
        >
          Long
        </button>
        <button
          onClick={() => setDirection("short")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            direction === "short"
              ? "bg-short text-white"
              : "bg-surface text-muted hover:text-ink"
          }`}
        >
          Short
        </button>
      </div>

      {/* Amount input */}
      <div className="mt-4">
        <label htmlFor="trade-amount" className="block text-sm font-medium text-muted">
          Amount (USDC)
        </label>
        <input
          id="trade-amount"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="input mt-1"
        />
      </div>

      {/* Estimate preview */}
      <div className="mt-4 space-y-1 rounded-md bg-surface p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Position Size</span>
          <span className="font-medium text-ink">{estimate.sizeTokens.toFixed(4)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Estimated Entry Price</span>
          <span className="font-medium text-ink">${estimate.entryPrice.toFixed(4)}</span>
        </div>
      </div>

      {/* Action button */}
      <div className="mt-4">
        {authenticated ? (
          <button
            onClick={handleTrade}
            disabled={loading || collateral <= 0}
            className={`btn w-full text-white ${direction === "long" ? "bg-long" : "bg-short"} hover:opacity-90 disabled:opacity-50`}
          >
            {loading && <Spinner />}
            {loading ? "Processing..." : direction === "long" ? "Open Long" : "Open Short"}
          </button>
        ) : (
          <a href="/signin" className="btn btn-primary w-full">
            Sign in to take a position
          </a>
        )}
      </div>

      {message && (
        <p className={`mt-3 text-sm ${isError ? "text-short" : "text-long"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
