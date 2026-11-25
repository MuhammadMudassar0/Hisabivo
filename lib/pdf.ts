import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { categoryTotals, dateLabel, isCashEntry, money, monthLabel, monthSummary, pendingExpenses, expenseRemaining, monthEnd, shiftMonth, transactionDate, type Transaction } from "./ledger";
import { cashSummary, loanPaid, loanRemaining, udharSummary, type UdharLoan, type UdharPayment } from "./udhar";

import type { Occurrence } from "./planning";

type UdharReportData = { loans: UdharLoan[]; payments: UdharPayment[] };

export function createMonthlyPdf(entries: Transaction[], month: string, owner: string, demo: boolean, udhar?: UdharReportData, expectedIncome?: Occurrence[]) {
  const summary = udhar ? cashSummary(entries, udhar.loans, udhar.payments, month) : monthSummary(entries, month);
  const pending = pendingExpenses(entries, month);
  const pendingIncome=(expectedIncome||[]).filter(o=>o.type === "income" && o.scheduled_date<=monthEnd(month) && o.status!=="skipped" && (o.status==="expected" || Boolean(o.transaction_id && entries.find(e=>e.id===o.transaction_id && e.date>monthEnd(month)))));
  const doc = new jsPDF();
  const green: [number, number, number] = [24, 88, 68];
  doc.setFillColor(...green);
  doc.rect(0, 0, 210, 46, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text("Hisabivo", 16, 21);
  doc.setFontSize(12);
  doc.text(`Monthly statement | ${monthLabel(month)}`, 16, 33);
  doc.setTextColor(40, 50, 46);
  doc.setFontSize(10);
  const accountLines = doc.splitTextToSize(demo ? "DEMO REPORT - browser data, may include sample entries" : `Account: ${owner}`, 178);
  doc.text(accountLines, 16, 57);
  const metadataY = 57 + accountLines.length * 5;
  doc.text(`Currency: PKR | Generated: ${new Date().toLocaleString("en-GB")}`, 16, metadataY + 2);
  doc.setFontSize(8);
  doc.text(udhar ? "Udhar principal and repayments affect cash balances, not income or expense totals." : "Income and expense records only. Udhar is not included in these balances.", 16, metadataY + 9);
  if (pending.length) doc.text("Expected expenses are listed separately and do not reduce spending totals or cash balances.", 16, metadataY + 14);
  autoTable(doc, {
    startY: metadataY + (pending.length ? 21 : 15),
    head: [[udhar ? "Opening recorded cash" : "Opening income/expense balance", "Income received", "Expenses paid", "Income less paid expenses", udhar ? "Closing recorded cash" : "Closing income/expense balance"]],
    body: [[summary.opening, summary.income, summary.expense, summary.net, summary.closing].map(v => money(v, true))],
    theme: "grid", headStyles: { fillColor: green }, styles: { fontSize: 9 }, margin: { left: 16, right: 16, bottom: 20 },
  });
  let y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  if (udhar) {
    const cash = cashSummary(entries, udhar.loans, udhar.payments, month);
    autoTable(doc, { startY: y - 5, head: [["Udhar cash received", "Udhar cash paid", "Total cash change this month"]], body: [[money(cash.loanIn, true), money(cash.loanOut, true), money(cash.cashNet, true)]], theme: "grid", headStyles: { fillColor: green }, styles: { fontSize: 9 }, margin: { left: 16, right: 16, bottom: 20 } });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  }
  for (const type of ["expense", "income"] as const) {
    if (y > 245) { doc.addPage(); y = 22; }
    doc.setFontSize(13);
    doc.text(type === "expense" ? "Spending by category" : "Income by category", 16, y);
    const totals = categoryTotals(summary.cashRows, type);
    autoTable(doc, { startY: y + 5, head: [["Category", "Amount (PKR)"]], body: totals.length ? totals.map(c => [c.name, money(c.amount, true)]) : [["No entries", money(0, true)]], headStyles: { fillColor: green }, styles: { fontSize: 9 }, columnStyles: { 1: { halign: "right" } }, margin: { left: 16, right: 16, bottom: 20 } });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  }
  doc.addPage();
  doc.setFontSize(16);
  doc.text(udhar ? "Cash movement details" : "Transaction details", 16, 22);
  doc.setFontSize(10);
  doc.text(monthLabel(month), 16, 30);
  const activities = summary.cashRows.map(entry => ({ date: transactionDate(entry), created_at: entry.created_at, description: entry.description, notes: entry.notes, category: entry.category, method: entry.payment_method, incoming: entry.type === "income", amount: entry.amount_paisa }));
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
  const ordered = activities.sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  let balance = summary.opening;
  autoTable(doc, {
    startY: 38,
    head: [["Date", "Description / notes", "Type / method", "Money in", "Money out", "Balance"]],
    body: ordered.length ? ordered.map(e => {
      balance += e.incoming ? e.amount : -e.amount;
      return [dateLabel(e.date), `${e.description}${e.notes ? `\n${e.notes}` : ""}`, `${e.category}\n${e.method}`, e.incoming ? money(e.amount, true) : "-", !e.incoming ? money(e.amount, true) : "-", money(balance, true)];
    }) : [[{ content: "No transactions recorded for this month.", colSpan: 6, styles: { halign: "center" } }]],
    headStyles: { fillColor: green }, styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    columnStyles: { 0: { cellWidth: 23 }, 1: { cellWidth: 42 }, 2: { cellWidth: 34 }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    margin: { left: 16, right: 16, bottom: 20 },
  });
  if (pending.length) {
    doc.addPage(); doc.setFontSize(16); doc.text("Expected expenses - unpaid at month end", 16, 22);
    doc.setFontSize(10); doc.text(`${monthLabel(month)} | Planned amounts are not cash payments.`, 16, 32);
    autoTable(doc, { startY: 40, head: [["Expected date", "Description / notes", "Category", "Planned amount (PKR)"]], body: pending.map(entry => [dateLabel(entry.date), `${entry.description}${entry.notes ? `\n${entry.notes}` : ""}`, entry.category, money(expenseRemaining(entry,monthEnd(month)), true)]), headStyles: { fillColor: green }, styles: { fontSize: 9, cellPadding: 3 }, columnStyles: { 3: { halign: "right" } }, margin: { left: 16, right: 16, bottom: 20 } });
  }
  if (udhar) {
    const endExclusive = `${shiftMonth(month, 1)}-01`;
    const asOfLoans = udhar.loans.filter(loan => loan.date < endExclusive);
    const asOfPayments = udhar.payments.filter(payment => payment.date < endExclusive);
    const activeLoans = asOfLoans.filter(loan => loanRemaining(loan, asOfPayments) > 0);
    const outstanding = udharSummary(asOfLoans, asOfPayments);
    if (asOfLoans.length) {
      doc.addPage(); doc.setFontSize(16); doc.text("Udhar outstanding at month end", 16, 22);
      doc.setFontSize(10); doc.text(`${monthLabel(month)} | To receive: ${money(outstanding.toReceive, true)} | To repay: ${money(outstanding.toPay, true)}`, 16, 32);
      autoTable(doc, { startY: 40, head: [["Person", "Udhar type", "Original amount", "Repaid to date", "Outstanding", "Expected return"]], body: activeLoans.length ? activeLoans.map(loan => [loan.person, loan.direction === "given" ? "Given - to receive" : "Taken - to repay", money(loan.amount_paisa, true), money(loanPaid(loan.id, asOfPayments), true), money(loanRemaining(loan, asOfPayments), true), loan.due_date ? dateLabel(loan.due_date) : "Not set"]) : [[{ content: "All Udhar recorded by this month end is settled.", colSpan: 6, styles: { halign: "center" } }]], headStyles: { fillColor: green }, styles: { fontSize: 8, cellPadding: 3 }, margin: { left: 16, right: 16, bottom: 20 } });
    }
  }
  if(pendingIncome.length){doc.addPage();doc.setFontSize(16);doc.text("Expected income - not received at month end",16,22);doc.setFontSize(10);doc.text(`${monthLabel(month)} | Expected income is excluded from cash and received totals.`,16,32);autoTable(doc,{startY:40,head:[["Expected date","Description","Income source","Expected amount (PKR)"]],body:pendingIncome.map(o=>[dateLabel(o.scheduled_date),o.description,o.category,money(o.amount_paisa,true)]),headStyles:{fillColor:green},styles:{fontSize:9},margin:{left:16,right:16,bottom:20}});}
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(110, 120, 115);
    doc.text(`Hisabivo${demo ? " | DEMO" : ""} | ${monthLabel(month)} | PKR`, 16, 287);
    doc.text(`${i} / ${pages}`, 194, 287, { align: "right" });
  }
  return doc;
}
export function downloadMonthlyPdf(entries: Transaction[], month: string, owner: string, demo: boolean, udhar?: UdharReportData, expectedIncome?: Occurrence[]) {
  createMonthlyPdf(entries, month, owner, demo, udhar, expectedIncome).save(`hisabivo-${month}${demo ? "-demo" : ""}.pdf`);
}
