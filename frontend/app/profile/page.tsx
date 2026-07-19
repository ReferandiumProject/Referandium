'use client'

import { useEffect, useState } from 'react'
import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { useUser } from '../context/UserContext'

type Position = {
  id: string
  market_id: string
  option_id: string
  market_title: string
  option_label: string
  shares: number
  avg_price: number
}

type Balance = {
  available_usdc: number
  locked_usdc: number
}

type DepositInfo = {
  platform_address: string
  usdc_mint: string
}

export default function ProfilePage() {
  const { authenticated, getAccessToken, login } = usePrivy()
  const { dbUser } = useUser()
  const { fundWallet } = useFundWallet({
    onUserExited: () => console.log('[Privy] card funding flow exited'),
  })

  const [balance, setBalance] = useState<Balance | null>(null)
  const [positions, setPositions] = useState<Position[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [sellAmounts, setSellAmounts] = useState<Record<string, string>>({})
  const [sellResponses, setSellResponses] = useState<Record<string, string>>({})

  const [depositMode, setDepositMode] = useState<'devnet' | 'wallet' | 'card'>('devnet')
  const [depositAmount, setDepositAmount] = useState('')
  const [depositInfo, setDepositInfo] = useState<DepositInfo | null>(null)
  const [depositSig, setDepositSig] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawWallet, setWithdrawWallet] = useState('')
  const [cardAmount, setCardAmount] = useState('')

  const fetchProfile = async () => {
    const token = await getAccessToken()
    if (!token) {
      setError('Not authenticated')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [balanceRes, positionsRes] = await Promise.all([
        fetch('/api/balance', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/profile/positions', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      const balanceJson = await balanceRes.json().catch(() => ({}))
      const positionsJson = await positionsRes.json().catch(() => ({}))

      if (!balanceRes.ok) {
        setError(balanceJson.error || 'Failed to load balance')
      } else {
        setBalance(balanceJson.data || null)
      }

      if (!positionsRes.ok) {
        setError((prev) => prev || positionsJson.error || 'Failed to load positions')
      } else {
        setPositions(positionsJson.positions || [])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authenticated) {
      fetchProfile()
    }
  }, [authenticated, getAccessToken])

  useEffect(() => {
    const init: Record<string, string> = {}
    positions?.forEach((p) => {
      init[p.id] = String(p.shares)
    })
    setSellAmounts(init)
  }, [positions])

  const handleDevnetDeposit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    const token = await getAccessToken()
    if (!token) {
      setError('Not authenticated')
      return
    }

    const amount = parseFloat(depositAmount)
    if (!amount || amount <= 0) {
      setMessage('Amount must be greater than 0')
      return
    }

    const res = await fetch('/api/deposit/devnet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amount_usdc: amount }),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(json.error || 'Deposit failed')
      return
    }

    setMessage(`Deposited. New balance: ${json.new_balance}`)
    setDepositAmount('')
    fetchProfile()
  }

  const loadDepositInfo = async () => {
    const res = await fetch('/api/deposit/wallet', { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(json.error || 'Failed to load deposit info')
      return
    }
    setDepositInfo(json)
  }

  const handleWalletDepositConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    const token = await getAccessToken()
    if (!token) {
      setError('Not authenticated')
      return
    }

    if (!depositSig.trim()) {
      setMessage('Transaction signature is required')
      return
    }

    const res = await fetch('/api/deposit/wallet/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ signature: depositSig.trim() }),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(json.error || 'Confirm failed')
      return
    }

    setMessage(`Credited ${json.credited_amount}. New balance: ${json.new_balance}`)
    setDepositSig('')
    fetchProfile()
  }

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    const token = await getAccessToken()
    if (!token) {
      setError('Not authenticated')
      return
    }

    const amount = parseFloat(withdrawAmount)
    if (!amount || amount <= 0) {
      setMessage('Amount must be greater than 0')
      return
    }
    if (!withdrawWallet.trim()) {
      setMessage('Wallet address is required')
      return
    }

    const res = await fetch('/api/withdraw', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount_usdc: amount,
        wallet_address: withdrawWallet.trim(),
      }),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(json.error || 'Withdraw failed')
      return
    }

    setMessage(`Withdrawn. New balance: ${json.new_balance}`)
    setWithdrawAmount('')
    setWithdrawWallet('')
    fetchProfile()
  }

  const handleSell = async (position: Position) => {
    setMessage(null)
    const token = await getAccessToken()
    if (!token) {
      setError('Not authenticated')
      return
    }

    const raw = sellAmounts[position.id] ?? String(position.shares)
    const shares = parseFloat(raw)
    if (!shares || shares <= 0) {
      setSellResponses((r) => ({ ...r, [position.id]: 'Invalid shares' }))
      return
    }
    if (shares > position.shares) {
      setSellResponses((r) => ({ ...r, [position.id]: 'Cannot sell more than owned' }))
      return
    }

    setSellResponses((r) => ({ ...r, [position.id]: 'Selling...' }))

    const res = await fetch('/api/trades', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        market_id: position.market_id,
        option_id: position.option_id,
        type: 'sell',
        shares,
      }),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setSellResponses((r) => ({ ...r, [position.id]: json.error || `Sell failed (${res.status})` }))
      return
    }

    const trade = json.trade || {}
    const proceeds = Number(trade.usdc_amount ?? 0) - Number(trade.fee ?? 0)
    setSellResponses((r) => ({
      ...r,
      [position.id]: `Sold. Proceeds: ${proceeds.toFixed(4)} USDC. New balance: ${json.newBalance}`,
    }))
    fetchProfile()
  }

  if (!authenticated) {
    return (
      <main style={{ padding: '1rem', fontFamily: 'sans-serif' }}>
        <h1>Profile</h1>
        <p>Sign in to view your profile</p>
        <button onClick={() => login()}>Sign In</button>
      </main>
    )
  }

  return (
    <main style={{ padding: '1rem', fontFamily: 'sans-serif' }}>
      <h1>Profile</h1>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {message && <p style={{ color: 'green' }}>{message}</p>}

      <section style={{ marginTop: '1rem' }}>
        <h2>Balance</h2>
        <p>Available: {balance ? `${balance.available_usdc} USDC` : '—'}</p>
        <p>Locked: {balance ? `${balance.locked_usdc} USDC` : '—'}</p>
      </section>

      <section style={{ marginTop: '1rem' }}>
        <h2>Deposit</h2>
        <select
          value={depositMode}
          onChange={(e) => setDepositMode(e.target.value as 'devnet' | 'wallet' | 'card')}
          style={{ marginBottom: '0.5rem' }}
        >
          <option value="devnet">Devnet Faucet</option>
          <option value="wallet">Wallet Deposit</option>
          <option value="card">Buy USDC with Card</option>
        </select>

        {depositMode === 'devnet' ? (
          <form onSubmit={handleDevnetDeposit}>
            <input
              type="number"
              step="0.01"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="Amount USDC"
              style={{ marginRight: '0.5rem' }}
            />
            <button type="submit">Deposit Devnet</button>
          </form>
        ) : depositMode === 'wallet' ? (
          <div>
            <button onClick={loadDepositInfo}>Load Deposit Address</button>
            {depositInfo && (
              <div style={{ marginTop: '0.5rem' }}>
                <p style={{ fontSize: '12px', wordBreak: 'break-all' }}>
                  Address: {depositInfo.platform_address}
                </p>
                <p style={{ fontSize: '12px', wordBreak: 'break-all' }}>
                  USDC Mint: {depositInfo.usdc_mint}
                </p>
                <form onSubmit={handleWalletDepositConfirm}>
                  <input
                    type="text"
                    value={depositSig}
                    onChange={(e) => setDepositSig(e.target.value)}
                    placeholder="Deposit transaction signature"
                    style={{ width: '300px', marginRight: '0.5rem' }}
                  />
                  <button type="submit">Confirm Wallet Deposit</button>
                </form>
              </div>
            )}
          </div>
        ) : (
          <div>
            <input
              type="number"
              step="0.01"
              value={cardAmount}
              onChange={(e) => setCardAmount(e.target.value)}
              placeholder="Amount USDC (optional)"
              style={{ marginRight: '0.5rem' }}
            />
            <button
              onClick={async () => {
                if (!dbUser?.wallet_address) {
                  setMessage('No wallet address available')
                  return
                }
                try {
                  await fundWallet({
                    address: dbUser.wallet_address,
                    options: { asset: 'USDC', amount: cardAmount || undefined } as any,
                  })
                } catch (err: any) {
                  console.error('[Privy] fundWallet error:', err)
                  setMessage(err?.message || 'Card funding failed to open')
                }
              }}
              disabled={!dbUser?.wallet_address}
            >
              Buy USDC with Card
            </button>
            <p style={{ fontSize: '12px', maxWidth: '500px' }}>
              Funds go to your embedded Solana wallet. After they arrive, use the
              Wallet Deposit flow to credit your platform balance.
            </p>
          </div>
        )}
      </section>

      <section style={{ marginTop: '1rem' }}>
        <h2>Withdraw</h2>
        <form onSubmit={handleWithdraw}>
          <input
            type="number"
            step="0.01"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            placeholder="Amount USDC"
            style={{ marginRight: '0.5rem' }}
          />
          <input
            type="text"
            value={withdrawWallet}
            onChange={(e) => setWithdrawWallet(e.target.value)}
            placeholder="Destination wallet address"
            style={{ width: '300px', marginRight: '0.5rem' }}
          />
          <button type="submit">Withdraw</button>
        </form>
      </section>

      <section style={{ marginTop: '1rem' }}>
        <h2>Positions</h2>
        {positions === null ? (
          <p>Loading positions...</p>
        ) : positions.length === 0 ? (
          <p>No positions</p>
        ) : (
          <table
            border={1}
            cellPadding={6}
            style={{ borderCollapse: 'collapse', marginTop: '0.5rem' }}
          >
            <thead>
              <tr>
                <th>Market</th>
                <th>Option</th>
                <th>Shares</th>
                <th>Avg Price</th>
                <th>Sell</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id}>
                  <td>{p.market_title}</td>
                  <td>{p.option_label}</td>
                  <td>{p.shares}</td>
                  <td>{p.avg_price}</td>
                  <td>
                    {p.shares > 0 ? (
                      <div>
                        <input
                          type="number"
                          step="0.01"
                          value={sellAmounts[p.id] ?? String(p.shares)}
                          onChange={(e) =>
                            setSellAmounts((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                          style={{ width: '80px', marginRight: '0.5rem' }}
                        />
                        <button onClick={() => handleSell(p)}>Sell</button>
                        {sellResponses[p.id] && (
                          <div style={{ fontSize: '12px' }}>{sellResponses[p.id]}</div>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
