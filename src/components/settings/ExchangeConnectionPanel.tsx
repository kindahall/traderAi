"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Link2Off, Save, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checklist, StatusBadge } from "@/components/ui/dashboard";
import { ConnectionTestButton } from "@/components/system/ConnectionTestButton";
import { cn } from "@/lib/utils";

type ProviderId = "dydx" | "binance" | "kraken" | "coinbase";
type EthereumProvider = {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: "accountsChanged" | "chainChanged", handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: "accountsChanged" | "chainChanged", handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

type ExchangeStatus = {
  providerId: ProviderId;
  providerLabel: string;
  walletProvider: string;
  walletConfigured: boolean;
  apiKeyConfigured: boolean;
  secretConfigured: boolean;
  passphraseConfigured: boolean;
  tradingEnabled: boolean;
  withdrawalsEnabled: boolean;
};

type Props = {
  initialStatus: ExchangeStatus;
  className?: string;
};

const walletStorageKey = "traderai.connectedWallet";

export function ExchangeConnectionPanel({ initialStatus, className }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [providerId, setProviderId] = useState<ProviderId>(initialStatus.providerId);
  const [walletProvider, setWalletProvider] = useState(initialStatus.walletProvider || "metamask");
  const [walletAddress, setWalletAddress] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem(walletStorageKey) || "");
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [pending, setPending] = useState(false);
  const [walletPending, setWalletPending] = useState(false);
  const [message, setMessage] = useState(status.apiKeyConfigured ? "API locale configurée" : "API non connectée");
  const [walletMessage, setWalletMessage] = useState(() => {
    if (typeof window === "undefined") return "Wallet non connecté";
    const cached = window.localStorage.getItem(walletStorageKey) || "";
    return cached ? `Wallet ${maskAddress(cached)}` : "Wallet non connecté";
  });

  const rememberWallet = useCallback((account: string) => {
    window.localStorage.setItem(walletStorageKey, account);
    setWalletAddress(account);
    setWalletProvider((current) => window.ethereum?.isMetaMask ? "metamask" : current || "metamask");
    setWalletMessage(`Wallet ${maskAddress(account)}`);
  }, []);

  const forgetWallet = useCallback((nextMessage = "Wallet oublié localement") => {
    window.localStorage.removeItem(walletStorageKey);
    setWalletAddress("");
    setWalletMessage(nextMessage);
  }, []);

  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum) return;

    ethereum.request({ method: "eth_accounts" })
      .then((accounts) => {
        const [account] = Array.isArray(accounts) ? accounts as string[] : [];
        if (account) rememberWallet(account);
      })
      .catch(() => undefined);

    function handleAccountsChanged(accounts: unknown) {
      const [account] = Array.isArray(accounts) ? accounts as string[] : [];
      if (account) {
        rememberWallet(account);
      } else {
        forgetWallet("Wallet déconnecté");
      }
    }

    ethereum.on?.("accountsChanged", handleAccountsChanged);
    return () => ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
  }, [forgetWallet, rememberWallet]);

  async function connectWallet() {
    setWalletPending(true);
    setWalletMessage("Autorisation wallet...");
    try {
      const ethereum = window.ethereum;
      if (!ethereum) {
        setWalletMessage("Wallet navigateur introuvable");
        return;
      }

      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      const [account] = Array.isArray(accounts) ? accounts as string[] : [];
      if (!account) {
        setWalletMessage("Aucun compte autorisé");
        return;
      }

      rememberWallet(account);
    } catch (error) {
      setWalletMessage(error instanceof Error ? error.message : "Autorisation refusée");
    } finally {
      setWalletPending(false);
    }
  }

  async function disconnectWallet() {
    setWalletPending(true);
    try {
      await window.ethereum?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(() => undefined);
      forgetWallet("Wallet déconnecté");
    } finally {
      setWalletPending(false);
    }
  }

  async function connect() {
    setPending(true);
    setMessage("Connexion locale...");
    try {
      if (!apiKey.trim() && !status.apiKeyConfigured) {
        setMessage("Ajoute une clé API pour connecter.");
        return;
      }

      const response = await fetch("/api/settings/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          walletProvider,
          apiKey: apiKey.trim() || undefined,
          secretKey: secretKey.trim() || undefined,
          passphrase: passphrase.trim() || undefined,
          liveTradingEnabled: false,
          withdrawalsEnabled: false,
        }),
      });
      const payload = await response.json() as { ok: boolean; config?: ExchangeStatus; error?: string };
      if (!response.ok || !payload.ok || !payload.config) {
        setMessage(payload.error || `Erreur ${response.status}`);
        return;
      }
      setStatus(payload.config);
      setApiKey("");
      setSecretKey("");
      setPassphrase("");
      setMessage("Connecté localement");
      window.dispatchEvent(new Event("system-integrity-refresh"));
    } finally {
      setPending(false);
    }
  }

  async function disconnect() {
    setPending(true);
    setMessage("Déconnexion locale...");
    try {
      const response = await fetch("/api/settings/exchange", { method: "DELETE" });
      const payload = await response.json() as { ok: boolean; config?: ExchangeStatus; error?: string };
      if (!response.ok || !payload.ok || !payload.config) {
        setMessage(payload.error || `Erreur ${response.status}`);
        return;
      }
      setStatus(payload.config);
      setApiKey("");
      setSecretKey("");
      setPassphrase("");
      setMessage("API déconnectée");
      window.dispatchEvent(new Event("system-integrity-refresh"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-bold text-white">Connexion API</div>
        <StatusBadge tone={status.apiKeyConfigured ? "success" : "warning"}>{message}</StatusBadge>
      </div>
      <div className="grid gap-3">
        <div className="rounded-2xl border border-[#16314a] bg-white/[0.025] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="font-bold text-white">Wallet navigateur</div>
            <StatusBadge tone={walletAddress ? "success" : "warning"}>{walletMessage}</StatusBadge>
          </div>
          <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
            <Button disabled={walletPending} onClick={connectWallet} variant="ai"><Wallet className="size-4" /> Connecter wallet</Button>
            <Button disabled={walletPending || !walletAddress} onClick={disconnectWallet} variant="ghost"><Link2Off className="size-4" /> Déconnecter wallet</Button>
          </div>
        </div>
        <label className="text-xs text-slate-400">
          Exchange
          <select value={providerId} onChange={(event) => setProviderId(event.target.value as ProviderId)} className="mt-1 h-10 w-full rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none">
            <option value="dydx">dYdX</option>
            <option value="binance">Binance</option>
            <option value="kraken">Kraken</option>
            <option value="coinbase">Coinbase</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Wallet
          <select value={walletProvider} onChange={(event) => setWalletProvider(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3 text-sm text-slate-100 outline-none">
            <option value="metamask">MetaMask</option>
            <option value="walletconnect">WalletConnect</option>
            <option value="ledger">Ledger</option>
            <option value="">Aucun</option>
          </select>
        </label>
        <SecretInput configured={status.apiKeyConfigured} label="Clé API" value={apiKey} onChange={setApiKey} />
        <SecretInput configured={status.secretConfigured} label="Clé secrète" value={secretKey} onChange={setSecretKey} />
        <SecretInput configured={status.passphraseConfigured} label="Passphrase" value={passphrase} onChange={setPassphrase} />
      </div>
      <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
        <Button disabled={pending} onClick={connect}><Save className="size-4" /> Connecter API</Button>
        <Button disabled={pending || !status.apiKeyConfigured} onClick={disconnect} variant="danger"><Link2Off className="size-4" /> Déconnecter API</Button>
      </div>
      <ConnectionTestButton className="w-full" />
      <div>
        <Checklist items={[
          { label: "Clé API", status: status.apiKeyConfigured ? "ok" : "pending" },
          { label: "Wallet autorisé", status: walletAddress ? "ok" : "pending" },
          { label: "Wallet déclaré", status: status.walletConfigured ? "ok" : "pending" },
          { label: "Secret", status: status.secretConfigured ? "ok" : "pending" },
          { label: "Live trading", status: status.tradingEnabled ? "warning" : "ok" },
        ]} />
      </div>
    </div>
  );
}

function maskAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function SecretInput({ configured, label, value, onChange }: { configured: boolean; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs text-slate-400">
      {label}
      <div className="mt-1 flex h-10 items-center gap-2 rounded-xl border border-[#1b3a55] bg-slate-950/60 px-3">
        <KeyRound className="size-4 text-slate-500" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={configured ? "Déjà configurée" : "Non configurée"}
          type="password"
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
        />
      </div>
    </label>
  );
}
