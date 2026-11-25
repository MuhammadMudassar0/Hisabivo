"use client";

import { useEffect, useRef, useState } from "react";
import { createDemoId } from "@/lib/ledger";
import { loanPaid, validateLoan, validatePayment, type UdharInput, type UdharLoan, type UdharPayment, type UdharPaymentInput } from "@/lib/udhar";
import { deleteUdharLoan, deleteUdharPayment, fetchUdhar, saveUdharLoan, saveUdharPayment } from "@/lib/udhar-store";

const storageKey = "hisabivo.demo.udhar.v1";
function message(error: unknown) {
  return error && typeof error === "object" && "message" in error ? String(error.message) : "Your Udhar records could not be loaded. Please try again.";
}

export function useUdhar(userId: string, demo: boolean, onNotice: (text: string) => void) {
  const [loans, setLoans] = useState<UdharLoan[]>([]);
  const [payments, setPayments] = useState<UdharPayment[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const mutationLock = useRef(false);

  useEffect(() => {
    let active = true;
    setReady(false); setError(""); setLoans([]); setPayments([]);
    if (demo) {
      try {
        const stored = window.localStorage.getItem(storageKey);
        const data = stored ? JSON.parse(stored) : { loans: [], payments: [] };
        if (!Array.isArray(data.loans) || !Array.isArray(data.payments)) throw new Error("Invalid demo Udhar data.");
        for (const loan of data.loans) {
          validateLoan(loan);
          if (typeof loan.id !== "string" || typeof loan.created_at !== "string") throw new Error("Invalid demo Udhar record.");
        }
        for (const payment of data.payments) {
          const loan = data.loans.find((row: UdharLoan) => row.id === payment.loan_id);
          if (!loan || typeof payment.id !== "string" || typeof payment.created_at !== "string") throw new Error("Invalid demo repayment.");
          validatePayment(payment, loan, data.payments.filter((row: UdharPayment) => row.id !== payment.id));
        }
        setLoans(data.loans); setPayments(data.payments); setReady(true);
      } catch {
        setError("Your browser’s saved Udhar demo could not be opened. Clear the demo records in Settings to start again.");
      }
    } else {
      fetchUdhar(userId).then(data => {
        if (active) { setLoans(data.loans); setPayments(data.payments); setReady(true); }
      }).catch(err => {
        if (active) setError(message(err));
      });
    }
    return () => { active = false; };
  }, [userId, demo, attempt]);

  useEffect(() => {
    if (!demo || !ready || storageWarning) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify({ loans, payments })); }
    catch { setStorageWarning("Your browser could not save Udhar demo changes. They will last only for this visit."); }
  }, [loans, payments, demo, ready, storageWarning]);

  async function mutate(action: () => Promise<void>) {
    if (!ready) throw new Error("Wait for your Udhar records to load, or complete the Udhar database setup.");
    if (mutationLock.current) throw new Error("A record is being saved. Please wait a moment.");
    mutationLock.current = true; setBusy(true);
    try { await action(); }
    finally { mutationLock.current = false; setBusy(false); }
  }
  async function saveLoan(input: UdharInput, id?: string) {
    validateLoan(input);
    const previous = id ? loans.find(loan => loan.id === id) : undefined;
    if (id && !previous) throw new Error("This Udhar record could not be found. Refresh and try again.");
    if (id) {
      const repayments = payments.filter(payment => payment.loan_id === id);
      if (loanPaid(id, payments) > input.amount_paisa) throw new Error("The amount cannot be lower than the repayments already recorded.");
      if (repayments.length && previous?.direction !== input.direction) throw new Error("Udhar direction cannot be changed after recording a repayment.");
      if (repayments.some(payment => payment.date < input.date)) throw new Error("The Udhar date cannot be after a recorded repayment.");
    }
    await mutate(async () => {
      const saved = demo ? { ...input, id: id || createDemoId(), created_at: previous?.created_at || new Date().toISOString() } : await saveUdharLoan(userId, input, id);
      setLoans(rows => id ? rows.map(loan => loan.id === id ? saved : loan) : [...rows, saved]);
      onNotice(id ? "Udhar details updated." : input.direction === "given" ? "Udhar given recorded." : "Udhar taken recorded.");
    });
  }
  async function removeLoan(id: string) {
    await mutate(async () => {
      if (!demo) await deleteUdharLoan(userId, id);
      setLoans(rows => rows.filter(loan => loan.id !== id));
      setPayments(rows => rows.filter(payment => payment.loan_id !== id));
      onNotice("Udhar record and its repayment history deleted.");
    });
  }
  async function savePayment(input: UdharPaymentInput) {
    const loan = loans.find(row => row.id === input.loan_id);
    if (!loan) throw new Error("This Udhar record could not be found.");
    validatePayment(input, loan, payments);
    await mutate(async () => {
      const saved = demo ? { ...input, id: createDemoId(), created_at: new Date().toISOString() } : await saveUdharPayment(userId, input);
      setPayments(rows => [...rows, saved]);
      onNotice(loan.direction === "given" ? "Money received recorded." : "Repayment recorded.");
    });
  }
  async function removePayment(id: string) {
    await mutate(async () => {
      if (!demo) await deleteUdharPayment(userId, id);
      setPayments(rows => rows.filter(payment => payment.id !== id));
      onNotice("Repayment removed. The outstanding amount has been updated.");
    });
  }
  function clearDemo() {
    if (!demo || mutationLock.current) return;
    setLoans([]); setPayments([]); setError(""); setReady(true);
    try { window.localStorage.removeItem(storageKey); setStorageWarning(""); }
    catch { setStorageWarning("Your browser could not clear saved Udhar data. The records are cleared for this visit only."); }
  }
  return { loans, payments, ready, loading: !ready && !error, error, storageWarning, busy, retry: () => { if (!mutationLock.current) setAttempt(value => value + 1); }, saveLoan, removeLoan, savePayment, removePayment, clearDemo };
}
