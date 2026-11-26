"use client";
import { useEffect, useRef, useState } from "react";
import { requestUuid } from "@/lib/ids";
import { sameTransfer, validateAccount, validateTransfer, type Account, type AccountInput, type AccountTransfer, type TransferInput } from "@/lib/accounts";
import { fetchAccounts, recordAccountTransfer, saveAccount as persistAccount, setAccountArchived } from "@/lib/account-store";

const message = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "Your account records could not be updated. Try again.";
export function useAccounts(userId: string, demo: boolean, readOnly = false, scopeKey = userId) {
  const [accounts, setAccounts] = useState<Account[]>([]), [transfers, setTransfers] = useState<AccountTransfer[]>([]);
  const [ready, setReady] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false), [storageWarning, setStorageWarning] = useState(""), [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const storageKey = `hisabivo.demo.accounts.v1:${encodeURIComponent(scopeKey)}`;
  useEffect(() => {
    let active = true;setReady(false);setError("");setAccounts([]);setTransfers([]);setStorageWarning("");
    if (demo) {
      try {
        const raw = localStorage.getItem(storageKey), data = raw ? JSON.parse(raw) : { accounts: [], transfers: [] };
        if (!Array.isArray(data.accounts) || !Array.isArray(data.transfers)) throw new Error("Invalid accounts demo.");
        for (const account of data.accounts) { validateAccount(account); if (!account.id || !account.created_at) throw new Error("Invalid account."); }
        for (const transfer of data.transfers) {
          // Historical transfers remain valid after archiving an account.
          validateTransfer(transfer, data.accounts.map((account: Account) => ({ ...account, archived: false })));
          if (!transfer.id || !transfer.request_id || !transfer.created_at) throw new Error("Invalid transfer.");
        }
        setAccounts(data.accounts);setTransfers(data.transfers);setReady(true);
      } catch { setError("Saved account demo data could not be opened. Clear the accounts demo to start again."); }
    } else fetchAccounts(userId).then(data => { if (active) {setAccounts(data.accounts);setTransfers(data.transfers);setReady(true);} }).catch(reason => {if(active)setError(message(reason));});
    return () => {active=false;};
  }, [userId, demo, attempt, storageKey, scopeKey]);
  useEffect(() => {
    if (!demo || !ready || storageWarning) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ accounts, transfers })); } catch {setStorageWarning("Your browser could not save accounts demo changes. They last only for this visit.");}
  }, [demo, ready, storageWarning, storageKey, accounts, transfers]);
  async function mutate(action: () => Promise<void>) {
    if (readOnly) throw new Error("This workspace is read-only for your account.");
    if (!ready) throw new Error("Wait for accounts to load, or complete the accounts database setup.");
    if (lock.current) throw new Error("An account change is already being saved.");
    lock.current=true;setBusy(true);try {await action();} finally {lock.current=false;setBusy(false);}
  }
  async function saveAccount(input: AccountInput, id?: string) {
    validateAccount(input);
    if (id && !accounts.some(account=>account.id===id)) throw new Error("This account could not be found. Refresh and try again.");
    if (accounts.some(account=>account.id!==id&&account.name.trim().toLowerCase()===input.name.trim().toLowerCase())) throw new Error("Choose a different name; this workspace already has that account.");
    await mutate(async()=>{const saved=demo?{...input,name:input.name.trim(),id:id||requestUuid(),created_at:accounts.find(account=>account.id===id)?.created_at||new Date().toISOString()}:await persistAccount(userId,input,id);setAccounts(rows=>id?rows.map(account=>account.id===id?saved:account):[...rows,saved]);});
  }
  async function archiveAccount(account: Account, archived: boolean) {
    await mutate(async()=>{const saved=demo?{...account,archived}:await setAccountArchived(userId,account.id,archived);setAccounts(rows=>rows.map(row=>row.id===account.id?saved:row));});
  }
  async function saveTransfer(input: TransferInput, requestId: string) {
    await mutate(async()=>{
      const existing=transfers.find(transfer=>transfer.request_id===requestId);
      if(existing){if(!sameTransfer(existing,input))throw new Error("This request already recorded a different transfer. Start a new transfer.");return;}
      validateTransfer(input,accounts);
      const saved=demo?{...input,notes:input.notes.trim(),id:requestId,request_id:requestId,created_at:new Date().toISOString()}:await recordAccountTransfer(userId,input,requestId,accounts);
      setTransfers(rows=>rows.some(row=>row.id===saved.id)?rows:[...rows,saved]);
    });
  }
  function clearDemo() {
    if(!demo||lock.current||readOnly)return;
    setAccounts([]);setTransfers([]);setError("");setReady(true);setStorageWarning("");try{localStorage.removeItem(storageKey);}catch{setStorageWarning("The demo is cleared for this visit only.");}
  }
  return { accounts, transfers, ready, loading:!ready&&!error, error, busy, storageWarning, retry:()=>{if(!lock.current)setAttempt(value=>value+1);}, saveAccount, archiveAccount, saveTransfer, clearDemo };
}
