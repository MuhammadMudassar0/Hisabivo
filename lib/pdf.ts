import { jsPDF, type TextOptionsLight } from "jspdf";
import autoTable, { type UserOptions } from "jspdf-autotable";
import { categoryTotals, dateLabel, isCashEntry, money, monthLabel, monthSummary, pendingExpenses, expenseRemaining, monthEnd, shiftMonth, transactionDate, type Transaction } from "./ledger";
import { cashSummary, loanPaid, loanRemaining, udharSummary, type UdharLoan, type UdharPayment } from "./udhar";

import type { Occurrence } from "./planning";
import { accountBalances, accountCashMovements, accountPeriodSummary, UNASSIGNED_ACCOUNT, type Account, type AccountTransfer } from "./accounts";
import { containsUrduText, embedFont, fetchPdfFont, PDF_FONT_FAMILY, pdfTextOptions, shapePdfText, type PdfFontData } from "./pdf-font";

export type UdharReportData = { loans: UdharLoan[]; payments: UdharPayment[] };

export type AccountReportData = { accounts: Account[]; transfers: AccountTransfer[] };

export function createMonthlyPdf(entries: Transaction[], month: string, owner: string, demo: boolean, udhar?: UdharReportData, expectedIncome?: Occurrence[], accountReport?: AccountReportData, fonts?: PdfFontData) {
  entries = entries.filter(entry => !entry.deleted_at);
  if (udhar) udhar = { loans: udhar.loans.filter(loan => !loan.deleted_at), payments: udhar.payments.filter(payment => !payment.deleted_at) };
  const hasUrdu = reportHasUrdu(entries, owner, udhar, expectedIncome, accountReport);
  if (hasUrdu && !fonts) throw new Error("Urdu text needs an embedded PDF font. Use downloadMonthlyPdf or pass PdfFontData to createMonthlyPdf.");
  const summary = udhar ? cashSummary(entries, udhar.loans, udhar.payments, month) : monthSummary(entries, month);
  const movements = accountReport ? accountCashMovements(entries, udhar?.loans || [], udhar?.payments || [], accountReport.transfers) : [];
  const accountPeriod = accountReport ? accountPeriodSummary(accountReport.accounts, movements, `${month}-01`, monthEnd(month)) : null;
  if (accountPeriod) { summary.opening = accountPeriod.opening; summary.closing = accountPeriod.closing; }
  const pending = pendingExpenses(entries, month);
  const pendingIncome=(expectedIncome||[]).filter(o=>o.type === "income" && o.scheduled_date<=monthEnd(month) && o.status!=="skipped" && (o.status==="expected" || Boolean(o.transaction_id && entries.find(e=>e.id===o.transaction_id && e.date>monthEnd(month)))));
  const doc = new jsPDF();
  if (fonts) embedFont(doc, fonts.regular, fonts.bold);
  const font = fonts ? PDF_FONT_FAMILY : "helvetica";
  function write(value: string | string[], x: number, y: number, options: TextOptionsLight = {}, bold = false) {
    doc.setFont(font, bold ? "bold" : "normal"); doc.setR2L(false);
    const joined = Array.isArray(value) ? value.join("\n") : value;
    const shaped = Array.isArray(value) ? value.map(line => shapePdfText(doc, line)) : shapePdfText(doc, value);
    doc.text(shaped, x, y, { ...pdfTextOptions(joined), ...options });
  }
  function fitFontSize(text: string, maxWidth: number, start: number, min = 8) {
    let size = start;
    doc.setFontSize(size);
    while (size > min && doc.getTextWidth(text) > maxWidth) { size -= 0.5; doc.setFontSize(size); }
    return size;
  }
  function statCard(x: number, y: number, w: number, h: number, label: string, value: string, caption: string, accent: [number, number, number], tint: [number, number, number]) {
    doc.setFillColor(...tint); doc.roundedRect(x, y, w, h, 2.2, 2.2, "F");
    doc.setFillColor(...accent); doc.roundedRect(x, y, 1.6, h, 0.8, 0.8, "F");
    doc.setTextColor(125, 135, 126); doc.setFontSize(8);
    write(label.toUpperCase(), x + 6, y + 8);
    doc.setFont(font, "bold"); fitFontSize(value, w - 11, 16.5, 9.5);
    doc.setTextColor(...accent);
    write(value, x + 6, y + 19, {}, true);
    if (caption) { doc.setFontSize(7.3); doc.setTextColor(150, 158, 148); write(doc.splitTextToSize(caption, w - 11)[0] || "", x + 6, y + h - 5); }
    doc.setTextColor(40, 50, 46); doc.setFontSize(9);
  }
  function statStrip(x: number, y: number, w: number, items: { label: string; value: string }[], accent: [number, number, number], tint: [number, number, number]) {
    const h = 18;
    doc.setFillColor(...tint); doc.roundedRect(x, y, w, h, 2, 2, "F");
    const colW = w / items.length;
    items.forEach((item, i) => {
      const cx = x + colW * i + 7;
      if (i > 0) { doc.setDrawColor(222, 230, 217); doc.line(x + colW * i, y + 3, x + colW * i, y + h - 3); }
      doc.setTextColor(125, 135, 126); doc.setFontSize(7.6);
      write(item.label, cx, y + 7);
      doc.setFont(font, "bold"); fitFontSize(item.value, colW - 12, 12, 8.5);
      doc.setTextColor(...accent);
      write(item.value, cx, y + 14.5, {}, true);
    });
    doc.setTextColor(40, 50, 46); doc.setFontSize(9);
  }
  function table(options: UserOptions) {
    autoTable(doc, { ...options, styles: { ...options.styles, font }, headStyles: { ...options.headStyles, font, fontStyle: "bold" },
      didParseCell: data => {
        data.cell.text = data.cell.text.map(text => shapePdfText(doc, text));
        const value = data.cell.text.join(" ");
        data.cell.styles.textOptions = pdfTextOptions(value);
        if (containsUrduText(value)) data.cell.styles.halign = "right";
      },
      // The bidi engine orders each line; globally reversing a mixed-language
      // cell also reverses English payment methods and account names.
      willDrawCell: () => { doc.setR2L(false); },
    }); doc.setR2L(false); doc.setFont(font, "normal");
  }
  const green: [number, number, number] = [24, 88, 68];
  const incomeColor: [number, number, number] = [34, 108, 78];
  const incomeTint: [number, number, number] = [233, 245, 235];
  const expenseColor: [number, number, number] = [168, 104, 76];
  const expenseTint: [number, number, number] = [252, 240, 233];
  const netColor: [number, number, number] = summary.net >= 0 ? [60, 93, 46] : [168, 90, 60];
  const netTint: [number, number, number] = summary.net >= 0 ? [234, 243, 227] : [252, 236, 230];
  const neutralColor: [number, number, number] = [60, 78, 66];
  const neutralTint: [number, number, number] = [245, 247, 243];
  doc.setFillColor(...green);
  doc.rect(0, 0, 210, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(23);
  write("Hisabivo", 16, 19, {}, true);
  doc.setFontSize(11);
  write(`Monthly statement  |  ${monthLabel(month)}`, 16, 29);
  doc.setTextColor(110, 120, 115);
  doc.setFontSize(8.5);
  const metaLines = doc.splitTextToSize(demo ? `DEMO REPORT - browser data, may include sample entries  |  PKR  |  Generated ${new Date().toLocaleString("en-GB")}` : `Account: ${owner}  |  PKR  |  Generated ${new Date().toLocaleString("en-GB")}`, 178);
  write(metaLines, 16, 47);
  let noteY = 47 + metaLines.length * 4.2 + 4;
  const captionBits = [udhar ? "Udhar affects cash balances only, not income or expense totals." : "Income and expense records only - Udhar is not included."];
  if (pending.length) captionBits.push("Expected expenses are listed separately on their own page.");
  doc.setFontSize(7.8);
  doc.setTextColor(145, 155, 143);
  const captionLines = doc.splitTextToSize(captionBits.join("   .   "), 178);
  write(captionLines, 16, noteY);
  doc.setTextColor(40, 50, 46);

  const cardY = noteY + captionLines.length * 3.8 + 7;
  const cardGap = 6, cardW = (178 - cardGap * 2) / 3, cardH = 30;
  const incomeCount = summary.cashRows.filter(e => e.type === "income").length;
  const expenseCount = summary.cashRows.filter(e => e.type === "expense").length;
  statCard(16, cardY, cardW, cardH, "Income received", money(summary.income, true), `${incomeCount} ${incomeCount === 1 ? "entry" : "entries"} this month`, incomeColor, incomeTint);
  statCard(16 + cardW + cardGap, cardY, cardW, cardH, "Expenses paid", money(summary.expense, true), `${expenseCount} ${expenseCount === 1 ? "entry" : "entries"} this month`, expenseColor, expenseTint);
  statCard(16 + (cardW + cardGap) * 2, cardY, cardW, cardH, "Net this month", money(summary.net, true), summary.net >= 0 ? "Income minus expenses" : "Expenses exceed income", netColor, netTint);

  const balLabel = udhar || accountReport ? "recorded cash" : "income/expense balance";
  const balY = cardY + cardH + 8;
  statStrip(16, balY, 178, [{ label: `Opening ${balLabel}`, value: money(summary.opening, true) }, { label: `Closing ${balLabel}`, value: money(summary.closing, true) }], neutralColor, neutralTint);
  let y = balY + 18 + 8;
  if (accountPeriod) {
    statStrip(16, y, 178, [{ label: "Starting balances introduced", value: money(accountPeriod.startingAdjustments, true) }, { label: "Account movement, net", value: money(accountPeriod.movementNet, true) }, { label: "Closing recorded cash", value: money(accountPeriod.closing, true) }], neutralColor, neutralTint);
    y += 18 + 5;
    doc.setFontSize(7.8); doc.setTextColor(145, 155, 143); write("Starting balances introduce existing cash once. Transfers are not income or expenses.", 16, y); doc.setTextColor(40, 50, 46);
    y += 9;
  }
  if (udhar) {
    const cash = cashSummary(entries, udhar.loans, udhar.payments, month);
    statStrip(16, y, 178, [{ label: "Udhar cash received", value: money(cash.loanIn, true) }, { label: "Udhar cash paid", value: money(cash.loanOut, true) }, { label: "Total cash change", value: money(cash.cashNet, true) }], neutralColor, neutralTint);
    y += 18 + 10;
  }
  for (const type of ["expense", "income"] as const) {
    if (y > 245) { doc.addPage(); y = 22; }
    doc.setFontSize(13);
    write(type === "expense" ? "Spending by category" : "Income by category", 16, y, {}, true);
    const totals = categoryTotals(summary.cashRows, type);
    const amountColor = type === "expense" ? expenseColor : incomeColor;
    table({ startY: y + 5, head: [["Category", "Amount (PKR)"]], body: totals.length ? totals.map(c => [c.name, money(c.amount, true)]) : [["No entries", money(0, true)]], headStyles: { fillColor: green }, styles: { fontSize: 9 }, columnStyles: { 1: { halign: "right", textColor: amountColor, fontStyle: "bold" } }, margin: { left: 16, right: 16, bottom: 20 } });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  }
  doc.addPage();
  doc.setFontSize(16);
  write(udhar ? "Cash movement details" : "Transaction details", 16, 22);
  doc.setFontSize(10);
  write(monthLabel(month), 16, 30);
  let activities: { date: string; created_at: string; description: string; notes: string; category: string; method: string; incoming: boolean; amount: number }[] = summary.cashRows.map(entry => ({ date: transactionDate(entry), created_at: entry.created_at, description: entry.description, notes: entry.notes, category: entry.category, method: entry.payment_method, incoming: entry.type === "income", amount: entry.amount_paisa }));
  if (udhar) {
    for (const loan of udhar.loans.filter(row => row.date.slice(0, 7) === month)) {
      activities.push({ date: loan.date, created_at: loan.created_at, description: `${loan.person} - ${loan.direction === "given" ? "Udhar given" : "Udhar taken"}`, notes: loan.notes, category: loan.direction === "given" ? "Udhar given" : "Udhar taken", method: loan.payment_method, incoming: loan.direction === "taken", amount: loan.amount_paisa });
    }
    for (const payment of udhar.payments.filter(row => row.date.slice(0, 7) === month)) {
      const loan = udhar.loans.find(row => row.id === payment.loan_id);
      if (!loan) continue;
      activities.push({ date: payment.date, created_at: payment.created_at, description: `${loan.person} - repayment`, notes: payment.notes, category: loan.direction === "given" ? "Udhar returned to you" : "Udhar repaid by you", method: payment.payment_method, incoming: loan.direction === "given", amount: payment.amount_paisa });
    }
  }
  if (accountReport) {
    const byAccount = new Map(accountReport.accounts.map(account => [account.id, account]));
    const metadata = new Map<string, { created_at: string; notes: string; category: string; method: string }>();
    for (const entry of entries) {
      metadata.set(`${entry.type}:${entry.id}`, { created_at: entry.created_at, notes: entry.notes, category: entry.category, method: entry.payment_method });
      for (const payment of entry.payments || []) metadata.set(`expense-payment:${payment.id}`, { created_at: payment.created_at, notes: payment.notes || entry.notes, category: entry.category, method: payment.payment_method });
    }
    for (const loan of udhar?.loans || []) metadata.set(`loan:${loan.id}`, { created_at: loan.created_at, notes: loan.notes, category: loan.direction === "given" ? "Udhar given" : "Udhar taken", method: loan.payment_method });
    for (const payment of udhar?.payments || []) metadata.set(`loan-payment:${payment.id}`, { created_at: payment.created_at, notes: payment.notes, category: "Udhar repayment", method: payment.payment_method });
    activities = movements.filter(movement => movement.kind !== "transfer" && movement.date.slice(0, 7) === month && (!movement.account_id || !byAccount.has(movement.account_id) || movement.date >= byAccount.get(movement.account_id)!.opening_date)).map(movement => {
      const meta = metadata.get(movement.id);
      return { date: movement.date, created_at: meta?.created_at || `${movement.date}T12:00:00Z`, description: movement.description, notes: meta?.notes || "", category: meta?.category || movement.kind, method: `${meta?.method || ""} | Account: ${movement.account_id ? byAccount.get(movement.account_id)?.name || "Unavailable" : "Unassigned"}`, incoming: movement.signed_paisa > 0, amount: Math.abs(movement.signed_paisa) };
    });
    for (const account of accountReport.accounts.filter(account => account.opening_date.slice(0, 7) === month)) activities.push({ date: account.opening_date, created_at: `${account.opening_date}T00:00:00Z`, description: `Starting balance: ${account.name}`, notes: "Existing cash introduced once. This is not income or an expense.", category: "Starting recorded cash", method: account.name, incoming: account.opening_balance_paisa >= 0, amount: Math.abs(account.opening_balance_paisa) });
  }
  const ordered = activities.sort((a, b) => a.date.localeCompare(b.date) || ((a.category === "Starting recorded cash" ? 0 : 1) - (b.category === "Starting recorded cash" ? 0 : 1)) || a.created_at.localeCompare(b.created_at) || a.description.localeCompare(b.description));
  let balance = summary.opening;
  table({
    startY: 38,
    head: [["Date", "Description / notes", "Type / method", "Money in", "Money out", "Balance"]],
    body: ordered.length ? ordered.map(e => {
      balance += e.incoming ? e.amount : -e.amount;
      return [dateLabel(e.date), `${e.description}${e.notes ? `\n${e.notes}` : ""}`, `${e.category}\n${e.method}`, e.incoming ? money(e.amount, true) : "-", !e.incoming ? money(e.amount, true) : "-", money(balance, true)];
    }) : [[{ content: "No transactions recorded for this month.", colSpan: 6, styles: { halign: "center" } }]],
    headStyles: { fillColor: green }, styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    columnStyles: { 0: { cellWidth: 23 }, 1: { cellWidth: 42 }, 2: { cellWidth: 34 }, 3: { halign: "right", textColor: incomeColor }, 4: { halign: "right", textColor: expenseColor }, 5: { halign: "right", fontStyle: "bold" } },
    margin: { left: 16, right: 16, bottom: 20 },
  });
  if (accountReport) {
    doc.addPage(); doc.setFontSize(16); write("Money accounts at month end", 16, 22);
    doc.setFontSize(10); write(`${monthLabel(month)} | Assigned accounts and Unassigned`, 16, 32);
    const balances = accountBalances(accountReport.accounts, movements, monthEnd(month));
    const includedAccounts = accountReport.accounts.filter(account => account.opening_date <= monthEnd(month));
    table({ startY: 40, head: [["Account", "Type / status", "Starting balance", "Starting date", "At month end"]], body: [...includedAccounts.map(account => [account.name, `${account.kind}${account.archived ? " / archived" : ""}`, money(account.opening_balance_paisa, true), dateLabel(account.opening_date), money(balances.get(account.id) || 0, true)]), ["Unassigned", "No account selected", "-", "-", money(balances.get(UNASSIGNED_ACCOUNT) || 0, true)]], headStyles: { fillColor: green }, styles: { fontSize: 8, cellPadding: 3 }, margin: { left: 16, right: 16, bottom: 20 } });
    const monthTransfers = accountReport.transfers.filter(transfer => transfer.date.slice(0, 7) === month).sort((a,b)=>a.date.localeCompare(b.date)||a.created_at.localeCompare(b.created_at));
    if (monthTransfers.length) {
      doc.addPage(); doc.setFontSize(16); write("Account transfers", 16, 22); doc.setFontSize(10); write("Internal movements only - not income or expenses. Total recorded cash is unchanged.", 16, 32);
      const name = (id: string) => accountReport.accounts.find(account => account.id === id)?.name || "Unavailable account";
      table({ startY: 40, head: [["Date", "From account", "To account", "Amount (PKR)", "Notes"]], body: monthTransfers.map(transfer=>[dateLabel(transfer.date),name(transfer.from_account_id),name(transfer.to_account_id),money(transfer.amount_paisa,true),transfer.notes]), headStyles: { fillColor: green }, styles: { fontSize: 8, cellPadding: 3 }, margin: { left: 16, right: 16, bottom: 20 } });
    }
  }
  if (pending.length) {
    doc.addPage(); doc.setFontSize(16); write("Expected expenses - unpaid at month end", 16, 22);
    doc.setFontSize(10); write(`${monthLabel(month)} | Planned amounts are not cash payments.`, 16, 32);
    table({ startY: 40, head: [["Expected date", "Description / notes", "Category", "Planned amount (PKR)"]], body: pending.map(entry => [dateLabel(entry.date), `${entry.description}${entry.notes ? `\n${entry.notes}` : ""}`, entry.category, money(expenseRemaining(entry,monthEnd(month)), true)]), headStyles: { fillColor: green }, styles: { fontSize: 9, cellPadding: 3 }, columnStyles: { 3: { halign: "right" } }, margin: { left: 16, right: 16, bottom: 20 } });
  }
  if (udhar) {
    const endExclusive = `${shiftMonth(month, 1)}-01`;
    const asOfLoans = udhar.loans.filter(loan => loan.date < endExclusive);
    const asOfPayments = udhar.payments.filter(payment => payment.date < endExclusive);
    const activeLoans = asOfLoans.filter(loan => loanRemaining(loan, asOfPayments) > 0);
    const outstanding = udharSummary(asOfLoans, asOfPayments);
    if (asOfLoans.length) {
      doc.addPage(); doc.setFontSize(16); write("Udhar outstanding at month end", 16, 22);
      doc.setFontSize(10); write(`${monthLabel(month)} | To receive: ${money(outstanding.toReceive, true)} | To repay: ${money(outstanding.toPay, true)}`, 16, 32);
      table({ startY: 40, head: [["Person", "Udhar type", "Original amount", "Repaid to date", "Outstanding", "Expected return"]], body: activeLoans.length ? activeLoans.map(loan => [loan.person, loan.direction === "given" ? "Given - to receive" : "Taken - to repay", money(loan.amount_paisa, true), money(loanPaid(loan.id, asOfPayments), true), money(loanRemaining(loan, asOfPayments), true), loan.due_date ? dateLabel(loan.due_date) : "Not set"]) : [[{ content: "All Udhar recorded by this month end is settled.", colSpan: 6, styles: { halign: "center" } }]], headStyles: { fillColor: green }, styles: { fontSize: 8, cellPadding: 3 }, margin: { left: 16, right: 16, bottom: 20 } });
    }
  }
  if(pendingIncome.length){doc.addPage();doc.setFontSize(16);write("Expected income - not received at month end",16,22);doc.setFontSize(10);write(`${monthLabel(month)} | Expected income is excluded from cash and received totals.`,16,32);table({startY:40,head:[["Expected date","Description","Income source","Expected amount (PKR)"]],body:pendingIncome.map(o=>[dateLabel(o.scheduled_date),o.description,o.category,money(o.amount_paisa,true)]),headStyles:{fillColor:green},styles:{fontSize:9},margin:{left:16,right:16,bottom:20}});}
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(110, 120, 115);
    write(`Hisabivo${demo ? " | DEMO" : ""} | ${monthLabel(month)} | PKR`, 16, 287);
    write(`${i} / ${pages}`, 194, 287, { align: "right" });
  }
  return doc;
}
function reportHasUrdu(entries: Transaction[], owner: string, udhar?: UdharReportData, expectedIncome?: Occurrence[], accountReport?: AccountReportData) {
  return containsUrduText(JSON.stringify({ entries, owner, udhar, expectedIncome, accountReport }));
}
export async function downloadMonthlyPdf(entries: Transaction[], month: string, owner: string, demo: boolean, udhar?: UdharReportData, expectedIncome?: Occurrence[], accountReport?: AccountReportData, fonts?: PdfFontData) {
  const embedded = fonts || (reportHasUrdu(entries, owner, udhar, expectedIncome, accountReport) ? await fetchPdfFont() : undefined);
  createMonthlyPdf(entries, month, owner, demo, udhar, expectedIncome, accountReport, embedded).save(`hisabivo-${month}${demo ? "-demo" : ""}.pdf`);
}
