"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function CustomerPrintPage() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [allOrdersWithBalance, setAllOrdersWithBalance] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  
  // Date range filters
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");
  const [appliedFilter, setAppliedFilter] = useState({ start: "", end: "" });
  const [sortOrder, setSortOrder] = useState("desc"); // "desc" (newest first) or "asc" (oldest first)
  const [baselineOffset, setBaselineOffset] = useState(0);

  const hasAutoPrintedRef = useRef(false);

  const [shopSettings, setShopSettings] = useState({
    name: "PRINT X",
    addressLine1: "No 189B",
    addressLine2: "RATNAPURA RD",
    addressLine3: "KALAWANA",
    phone: "070 143 49 49",
    email: "printxkalawana@gmail.com",
    website: "www.printx.lk",
    logoUrl: "/logo.png",
    footerInfo: "Created with Aronium - www.aronium.com"
  });

  useEffect(() => {
    const loadShopSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("shop_settings")
          .select("settings")
          .eq("id", "default")
          .single();
        if (!error && data && data.settings) {
          setShopSettings(prev => ({ ...prev, ...data.settings }));
        } else {
          const stored = localStorage.getItem("printx_shop_settings");
          if (stored) {
            setShopSettings(prev => ({ ...prev, ...JSON.parse(stored) }));
          }
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setSettingsLoading(false);
      }
    };
    loadShopSettings();
  }, []);

  useEffect(() => {
    if (id) {
      // Parse URL parameters initially
      const searchParams = new URLSearchParams(window.location.search);
      const s = searchParams.get("start") || "";
      const e = searchParams.get("end") || "";
      const sort = searchParams.get("sort") || "desc";
      setStartDateInput(s);
      setEndDateInput(e);
      setAppliedFilter({ start: s, end: e });
      setSortOrder(sort === "asc" ? "asc" : "desc");

      fetchCustomerData();
    }
  }, [id]);

  const fetchCustomerData = async () => {
    try {
      setLoading(true);

      // 1. Fetch Customer Profile
      const { data: cust, error: cError } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .single();
      if (cError) throw cError;
      setCustomer(cust);

      // 2. Fetch ALL non-voided orders chronologically to calculate running balance
      const { data: rawOrders, error: oError } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_id", id)
        .neq("status", "voided")
        .order("created_at", { ascending: true });
      if (oError) throw oError;

      const nonVoided = rawOrders || [];
      const currentCustDebt = Number(cust.outstanding_balance || 0);

      // Sum of all net transaction impacts
      const totalNetImpact = nonVoided.reduce((sum, o) => {
        return sum + (Number(o.total_amount || 0) - Number(o.paid_amount || 0));
      }, 0);

      // If customer has an initial balance before order logging began
      const initialBaseline = currentCustDebt - totalNetImpact;
      setBaselineOffset(initialBaseline);

      let running = initialBaseline;
      const computedOrders = nonVoided.map(o => {
        const net = Number(o.total_amount || 0) - Number(o.paid_amount || 0);
        running += net;
        return {
          ...o,
          running_balance: running
        };
      });

      setAllOrdersWithBalance(computedOrders);

      // 3. Fetch Quotations
      const { data: qts, error: qError } = await supabase
        .from("quotations")
        .select("*")
        .eq("customer_id", id)
        .order("created_at", { ascending: false });
      if (qError) throw qError;
      setQuotations(qts || []);

    } catch (err) {
      console.error("Error loading customer print report:", err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-print once on initial load if desired
  useEffect(() => {
    if (!loading && !settingsLoading && customer && !hasAutoPrintedRef.current) {
      hasAutoPrintedRef.current = true;
      const timer = setTimeout(() => {
        window.print();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, settingsLoading, customer]);

  const handleApplyFilter = () => {
    setAppliedFilter({ start: startDateInput, end: endDateInput });
    const url = new URL(window.location.href);
    if (startDateInput) url.searchParams.set("start", startDateInput);
    else url.searchParams.delete("start");
    if (endDateInput) url.searchParams.set("end", endDateInput);
    else url.searchParams.delete("end");
    url.searchParams.set("sort", sortOrder);
    window.history.replaceState({}, "", url.toString());
  };

  const handleResetFilter = () => {
    setStartDateInput("");
    setEndDateInput("");
    setAppliedFilter({ start: "", end: "" });
    const url = new URL(window.location.href);
    url.searchParams.delete("start");
    url.searchParams.delete("end");
    window.history.replaceState({}, "", url.toString());
  };

  const handleSetQuickPreset = (preset) => {
    const today = new Date();
    const endStr = today.toISOString().split("T")[0];
    let startStr = "";

    if (preset === "today") {
      startStr = endStr;
    } else if (preset === "this_month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      startStr = firstDay.toISOString().split("T")[0];
    } else if (preset === "last_month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      startStr = firstDay.toISOString().split("T")[0];
      setStartDateInput(startStr);
      setEndDateInput(lastDay.toISOString().split("T")[0]);
      setAppliedFilter({ start: startStr, end: lastDay.toISOString().split("T")[0] });
      return;
    } else if (preset === "last_30") {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      startStr = d.toISOString().split("T")[0];
    } else if (preset === "this_year") {
      startStr = `${today.getFullYear()}-01-01`;
    }

    setStartDateInput(startStr);
    setEndDateInput(endStr);
    setAppliedFilter({ start: startStr, end: endStr });
  };

  const formatCurrency = (val) => {
    const num = Number(val) || 0;
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      minimumFractionDigits: 2
    }).format(num).replace("LKR", "Rs");
  };

  if (loading) {
    return (
      <div className="loading-container">
        <style>{`
          .loading-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            font-family: sans-serif;
          }
          .spinner {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: 3px solid #e5e7eb;
            border-top-color: #6366f1;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <div className="spinner"></div>
        <p style={{ marginTop: "16px", color: "#4b5563" }}>Generating Customer Statement Report...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div style={{ padding: "40px", textAlign: "center", fontFamily: "sans-serif" }}>
        <h2>Customer Profile Not Found</h2>
        <button onClick={() => window.close()} style={{ marginTop: "16px", padding: "8px 16px" }}>Close Tab</button>
      </div>
    );
  }

  // Determine chronological orders and opening balance
  const startIso = appliedFilter.start ? new Date(appliedFilter.start + "T00:00:00") : null;
  const endIso = appliedFilter.end ? new Date(appliedFilter.end + "T23:59:59.999") : null;

  // Opening balance before start date
  let openingBalance = baselineOffset;
  if (startIso) {
    const ordersBeforeStart = allOrdersWithBalance.filter(o => new Date(o.created_at) < startIso);
    if (ordersBeforeStart.length > 0) {
      openingBalance = ordersBeforeStart[ordersBeforeStart.length - 1].running_balance;
    }
  }

  // Filter orders in date range
  let filteredOrders = allOrdersWithBalance;
  if (startIso) {
    filteredOrders = filteredOrders.filter(o => new Date(o.created_at) >= startIso);
  }
  if (endIso) {
    filteredOrders = filteredOrders.filter(o => new Date(o.created_at) <= endIso);
  }

  // Closing balance at end of period
  const closingPeriodBalance = filteredOrders.length > 0 
    ? filteredOrders[filteredOrders.length - 1].running_balance 
    : openingBalance;

  // Filter quotations in date range
  let filteredQuotations = quotations;
  if (startIso) {
    filteredQuotations = filteredQuotations.filter(q => new Date(q.created_at) >= startIso);
  }
  if (endIso) {
    filteredQuotations = filteredQuotations.filter(q => new Date(q.created_at) <= endIso);
  }

  // Order display sorting
  const displayOrders = sortOrder === "desc" ? [...filteredOrders].reverse() : [...filteredOrders];

  // Financial aggregates for the period
  const salesOrders = filteredOrders.filter(o => !o.order_number?.startsWith("PAY-") && Number(o.total_amount || 0) > 0);
  const payOrders = filteredOrders.filter(o => o.order_number?.startsWith("PAY-") || Number(o.total_amount || 0) === 0);

  const totalPeriodSales = salesOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const totalPeriodPaid = salesOrders.reduce((sum, o) => sum + Number(o.paid_amount || 0), 0) + payOrders.reduce((sum, o) => sum + Number(o.paid_amount || 0), 0);
  const currentTotalDebt = Number(customer.outstanding_balance || 0);

  return (
    <div className="print-report-container">
      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm 10mm;
          }
          .report-wrapper {
            box-shadow: none !important;
            border: none !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
        }
        @media screen {
          body {
            background-color: #f3f4f6 !important;
            margin: 0;
            padding: 0;
          }
          .print-report-container {
            padding: 20px 10px 40px;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .report-wrapper {
            background: #ffffff;
            width: 210mm;
            min-height: 297mm;
            padding: 14mm 12mm;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            border: 1px solid #d1d5db;
            box-sizing: border-box;
            margin-top: 16px;
          }
        }
        .report-wrapper {
          font-family: Arial, Helvetica, sans-serif;
          color: #000000;
          font-size: 11px;
          line-height: 1.4;
        }
        .header {
          display: flex;
          justify-content: space-between;
          border-bottom: 2px solid #222222;
          padding-bottom: 10px;
          margin-bottom: 16px;
        }
        .title-block h1 {
          font-size: 20px;
          font-weight: 800;
          margin: 0;
          letter-spacing: 0.02em;
          color: #111827;
        }
        .title-block p {
          margin: 3px 0 0 0;
          color: #4b5563;
          font-size: 11px;
        }
        .shop-info {
          text-align: right;
          font-size: 10px;
          color: #111111;
          line-height: 1.35;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: 1.15fr 1fr;
          gap: 25px;
          margin-bottom: 16px;
        }
        .section-title {
          font-size: 11px;
          font-weight: 700;
          border-bottom: 1.5px solid #d1d5db;
          padding-bottom: 4px;
          margin-bottom: 8px;
          text-transform: uppercase;
          color: #1f2937;
          letter-spacing: 0.03em;
        }
        .info-table {
          width: 100%;
          border-collapse: collapse;
        }
        .info-table td {
          padding: 2.5px 0;
          font-size: 10.5px;
        }
        .info-table td.label {
          width: 95px;
          color: #4b5563;
        }
        .info-table td.val {
          font-weight: 600;
          color: #111827;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-bottom: 20px;
        }
        .stat-card {
          border: 1px solid #d1d5db;
          background-color: #f9fafb;
          padding: 8px 10px;
          border-radius: 4px;
        }
        .stat-label {
          font-size: 8.5px;
          color: #4b5563;
          text-transform: uppercase;
          font-weight: 700;
        }
        .stat-val {
          font-size: 13.5px;
          font-weight: 800;
          margin-top: 3px;
          color: #111827;
        }
        .report-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        .report-table th {
          border: 1px solid #cccccc;
          background-color: #f3f4f6;
          padding: 5px 6px;
          font-size: 9.5px;
          font-weight: 700;
          text-align: left;
          color: #1f2937;
        }
        .report-table td {
          border: 1px solid #e5e7eb;
          padding: 4.5px 6px;
          font-size: 9.5px;
        }
        .badge {
          display: inline-block;
          padding: 1.5px 5px;
          font-size: 8.5px;
          font-weight: 700;
          border-radius: 99px;
          text-transform: uppercase;
        }
        .badge-paid { background-color: #d1fae5; color: #065f46; }
        .badge-pending { background-color: #fef3c7; color: #92400e; }
        .badge-partial { background-color: #dbeafe; color: #1e40af; }
        
        /* Interactive Screen Control Bar */
        .no-print-bar {
          background-color: #0f172a;
          color: #ffffff;
          padding: 10px 18px;
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 12px;
          width: 100%;
          max-width: 1100px;
          box-sizing: border-box;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          gap: 12px;
        }
        .control-group {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .control-label {
          color: #94a3b8;
          font-size: 11px;
          font-weight: 500;
        }
        .date-input {
          background: #1e293b;
          border: 1px solid #334155;
          color: #ffffff;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          outline: none;
        }
        .date-input:focus {
          border-color: #6366f1;
        }
        .preset-btn {
          background: #1e293b;
          border: 1px solid #334155;
          color: #cbd5e1;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .preset-btn:hover {
          background: #334155;
          color: #ffffff;
        }
        .preset-btn.active {
          background: #3b82f6;
          border-color: #3b82f6;
          color: #ffffff;
        }
        .action-btn-primary {
          background: #10b981;
          border: none;
          color: #ffffff;
          padding: 6px 14px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .action-btn-primary:hover {
          background: #059669;
        }
        .action-btn-filter {
          background: #6366f1;
          border: none;
          color: #ffffff;
          padding: 4px 10px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 11px;
          cursor: pointer;
        }
        .action-btn-filter:hover {
          background: #4f46e5;
        }
        .action-btn-secondary {
          background: #334155;
          border: none;
          color: #e2e8f0;
          padding: 6px 12px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
        }
        .action-btn-secondary:hover {
          background: #475569;
        }
      `}</style>

      {/* Control Navigation Bar (Screen Only) */}
      <div className="no-print-bar no-print">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontWeight: 700, color: "#f8fafc" }}>STATEMENT OF ACCOUNT</span>
          <span style={{ color: "#64748b" }}>|</span>
          <span style={{ color: "#38bdf8", fontWeight: 600 }}>{customer.name}</span>
        </div>

        {/* Date Filter Controls */}
        <div className="control-group">
          <span className="control-label">Range:</span>
          <input 
            type="date" 
            className="date-input" 
            value={startDateInput} 
            onChange={(e) => setStartDateInput(e.target.value)} 
            title="Start Date"
          />
          <span style={{ color: "#64748b" }}>to</span>
          <input 
            type="date" 
            className="date-input" 
            value={endDateInput} 
            onChange={(e) => setEndDateInput(e.target.value)} 
            title="End Date"
          />
          <button onClick={handleApplyFilter} className="action-btn-filter">Apply</button>
          
          {/* Quick Presets */}
          <button onClick={handleResetFilter} className="preset-btn" title="Clear filter, show full history">All Time</button>
          <button onClick={() => handleSetQuickPreset("this_month")} className="preset-btn">This Month</button>
          <button onClick={() => handleSetQuickPreset("last_month")} className="preset-btn">Last Month</button>
          <button onClick={() => handleSetQuickPreset("last_30")} className="preset-btn">Last 30D</button>

          {/* Sort Toggle */}
          <button 
            onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")} 
            className="preset-btn"
            style={{ marginLeft: "4px" }}
            title="Change chronological display order"
          >
            Sort: {sortOrder === "desc" ? "Newest First" : "Oldest First"}
          </button>
        </div>

        {/* Print & Close Actions */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button onClick={() => window.print()} className="action-btn-primary">
            🖨️ Print Statement
          </button>
          <button onClick={() => window.close()} className="action-btn-secondary">
            Close
          </button>
        </div>
      </div>

      {/* Main Printable A4 Document */}
      <div className="report-wrapper">
        {/* Document Header */}
        <div className="header">
          <div className="title-block">
            {shopSettings.logoUrl && (
              <img 
                src="/logo.png" 
                alt={shopSettings.name} 
                style={{ height: "42px", maxWidth: "160px", marginBottom: "6px", objectFit: "contain", display: "block" }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            )}
            <h1>STATEMENT OF ACCOUNT</h1>
            <p>Comprehensive transaction, invoice, and payment history statement</p>
          </div>
          <div className="shop-info">
            <div style={{ fontWeight: "bold", fontSize: "12px", color: "#111827" }}>{shopSettings.name}</div>
            <div>{shopSettings.addressLine1}</div>
            <div>{shopSettings.addressLine2} {shopSettings.addressLine3}</div>
            <div>Phone: {shopSettings.phone}</div>
            <div>Email: {shopSettings.email}</div>
          </div>
        </div>

        {/* Client & Period Information */}
        <div className="meta-grid">
          <div>
            <div className="section-title">Client Details</div>
            <table className="info-table">
              <tbody>
                <tr>
                  <td className="label">Client Name:</td>
                  <td className="val">{customer.name}</td>
                </tr>
                <tr>
                  <td className="label">Phone:</td>
                  <td className="val">{customer.phone}</td>
                </tr>
                <tr>
                  <td className="label">Email:</td>
                  <td className="val">{customer.email || "N/A"}</td>
                </tr>
                <tr>
                  <td className="label">Address:</td>
                  <td className="val">{customer.address || "N/A"}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <div className="section-title">Statement Summary</div>
            <table className="info-table">
              <tbody>
                <tr>
                  <td className="label">Statement Date:</td>
                  <td className="val">{new Date().toLocaleDateString("en-GB")}</td>
                </tr>
                <tr>
                  <td className="label">Filtered Period:</td>
                  <td className="val" style={{ color: appliedFilter.start || appliedFilter.end ? "#b45309" : "#111827", fontWeight: "bold" }}>
                    {appliedFilter.start ? new Date(appliedFilter.start).toLocaleDateString("en-GB") : "All History"}
                    {" — "}
                    {appliedFilter.end ? new Date(appliedFilter.end).toLocaleDateString("en-GB") : "To Date"}
                  </td>
                </tr>
                {appliedFilter.start && (
                  <tr>
                    <td className="label">Opening Balance:</td>
                    <td className="val" style={{ color: openingBalance > 0 ? "#b45309" : openingBalance < 0 ? "#047857" : "#111827" }}>
                      {openingBalance < 0 ? `${formatCurrency(Math.abs(openingBalance))} CR` : formatCurrency(openingBalance)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="label">Account Status:</td>
                  <td className="val" style={{ color: currentTotalDebt > 0 ? "#b45309" : "#047857", fontWeight: "bold" }}>
                    {currentTotalDebt > 0 
                      ? `Outstanding Debt: ${formatCurrency(currentTotalDebt)}` 
                      : currentTotalDebt < 0 
                        ? `Advance Credit: ${formatCurrency(Math.abs(currentTotalDebt))}` 
                        : "Account Settled (0.00)"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Statistical Summary Row */}
        <div className="stats-grid">
          {appliedFilter.start ? (
            <div className="stat-card">
              <div className="stat-label">Opening Balance</div>
              <div className="stat-val" style={{ color: openingBalance > 0 ? "#b45309" : openingBalance < 0 ? "#047857" : "#111827" }}>
                {openingBalance < 0 ? `${formatCurrency(Math.abs(openingBalance))} CR` : formatCurrency(openingBalance)}
              </div>
            </div>
          ) : (
            <div className="stat-card">
              <div className="stat-label">Total Transactions</div>
              <div className="stat-val">{filteredOrders.length} Records</div>
            </div>
          )}

          <div className="stat-card">
            <div className="stat-label">Period Orders Total</div>
            <div className="stat-val">{formatCurrency(totalPeriodSales)}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Period Amount Paid</div>
            <div className="stat-val" style={{ color: "#047857" }}>{formatCurrency(totalPeriodPaid)}</div>
          </div>

          <div className="stat-card" style={{ borderLeft: "3px solid #b45309" }}>
            <div className="stat-label">{appliedFilter.start || appliedFilter.end ? "Period Closing Balance" : "Total Outstanding"}</div>
            <div className="stat-val" style={{ color: (appliedFilter.start || appliedFilter.end ? closingPeriodBalance : currentTotalDebt) > 0 ? "#b45309" : "#047857" }}>
              {(appliedFilter.start || appliedFilter.end ? closingPeriodBalance : currentTotalDebt) < 0
                ? `${formatCurrency(Math.abs(appliedFilter.start || appliedFilter.end ? closingPeriodBalance : currentTotalDebt))} CR`
                : formatCurrency(appliedFilter.start || appliedFilter.end ? closingPeriodBalance : currentTotalDebt)}
            </div>
          </div>
        </div>

        {/* Main Orders & Billing Activity Table */}
        <div className="section-title">
          Orders &amp; Billing Activity {appliedFilter.start || appliedFilter.end ? "(Filtered Date Range)" : "(All Time)"}
        </div>
        <table className="report-table">
          <thead>
            <tr>
              <th style={{ width: "28px", textAlign: "center" }}>#</th>
              <th style={{ width: "75px", whiteSpace: "nowrap" }}>Date</th>
              <th style={{ whiteSpace: "nowrap", minWidth: "125px" }}>Reference No</th>
              <th style={{ textAlign: "right", width: "85px", whiteSpace: "nowrap" }}>Total Amount</th>
              <th style={{ textAlign: "right", width: "85px", whiteSpace: "nowrap" }}>Paid Amount</th>
              <th style={{ textAlign: "right", width: "95px", whiteSpace: "nowrap" }}>Remaining Balance</th>
              <th style={{ textAlign: "center", width: "75px", whiteSpace: "nowrap" }}>Status</th>
              <th style={{ textAlign: "right", width: "100px", whiteSpace: "nowrap" }}>Total Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {/* Opening Balance Row if Filtered Range and Ascending View */}
            {appliedFilter.start && sortOrder === "asc" && (
              <tr style={{ backgroundColor: "#f8fafc", fontStyle: "italic" }}>
                <td style={{ textAlign: "center", color: "#64748b" }}>-</td>
                <td style={{ whiteSpace: "nowrap" }}>{new Date(appliedFilter.start).toLocaleDateString("en-GB")}</td>
                <td style={{ fontWeight: "600", color: "#475569", whiteSpace: "nowrap" }}>
                  Opening Balance (Carried Forward)
                </td>
                <td style={{ textAlign: "right", color: "#64748b" }}>-</td>
                <td style={{ textAlign: "right", color: "#64748b" }}>-</td>
                <td style={{ textAlign: "right", color: "#64748b" }}>-</td>
                <td style={{ textAlign: "center", color: "#64748b", whiteSpace: "nowrap" }}>Balance B/F</td>
                <td style={{ 
                  textAlign: "right", 
                  fontWeight: "700", 
                  color: openingBalance > 0 ? "#b45309" : openingBalance < 0 ? "#047857" : "#111827",
                  whiteSpace: "nowrap"
                }}>
                  {openingBalance < 0 
                    ? `${formatCurrency(Math.abs(openingBalance))} CR` 
                    : formatCurrency(openingBalance)}
                </td>
              </tr>
            )}

            {displayOrders.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: "center", padding: "16px", color: "#4b5563" }}>
                  No billing history found for this client during the selected date range.
                </td>
              </tr>
            ) : (
              displayOrders.map((o, idx) => {
                const isPaymentReceipt = o.order_number?.startsWith("PAY-") || Number(o.total_amount || 0) === 0;
                const rowRunningBalance = Number(o.running_balance || 0);

                return (
                  <tr key={o.id} style={{ backgroundColor: isPaymentReceipt ? "#f0fdf4" : "transparent" }}>
                    <td style={{ textAlign: "center" }}>{idx + 1}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(o.created_at).toLocaleDateString("en-GB")}</td>
                    <td style={{ fontWeight: "600", color: isPaymentReceipt ? "#047857" : "#111827", whiteSpace: "nowrap" }}>
                      {o.order_number}
                      {isPaymentReceipt && <span style={{ fontSize: "8.5px", fontWeight: "normal", color: "#059669", marginLeft: "4px" }}>(Payment)</span>}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {isPaymentReceipt ? "-" : formatCurrency(o.total_amount)}
                    </td>
                    <td style={{ textAlign: "right", color: Number(o.paid_amount) > 0 ? "#047857" : "inherit", whiteSpace: "nowrap" }}>
                      {formatCurrency(o.paid_amount)}
                    </td>
                    <td style={{ 
                      textAlign: "right", 
                      fontWeight: "600", 
                      color: Number(o.balance_amount) > 0 ? "#b45309" : "#4b5563",
                      whiteSpace: "nowrap"
                    }}>
                      {formatCurrency(o.balance_amount)}
                    </td>
                    <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                      <span className={`badge ${
                        o.status === "paid" ? "badge-paid" : o.status === "partially_paid" ? "badge-partial" : "badge-pending"
                      }`}>
                        {o.status?.replace("_", " ")}
                      </span>
                    </td>
                    <td style={{ 
                      textAlign: "right", 
                      fontWeight: "700", 
                      color: rowRunningBalance > 0 ? "#b45309" : rowRunningBalance < 0 ? "#047857" : "#111827",
                      whiteSpace: "nowrap"
                    }}>
                      {rowRunningBalance < 0 
                        ? `${formatCurrency(Math.abs(rowRunningBalance))} CR` 
                        : formatCurrency(rowRunningBalance)}
                    </td>
                  </tr>
                );
              })
            )}

            {/* Opening Balance Row if Filtered Range and Descending View */}
            {appliedFilter.start && sortOrder === "desc" && (
              <tr style={{ backgroundColor: "#f8fafc", fontStyle: "italic" }}>
                <td style={{ textAlign: "center", color: "#64748b" }}>-</td>
                <td style={{ whiteSpace: "nowrap" }}>{new Date(appliedFilter.start).toLocaleDateString("en-GB")}</td>
                <td style={{ fontWeight: "600", color: "#475569", whiteSpace: "nowrap" }}>
                  Opening Balance (Carried Forward)
                </td>
                <td style={{ textAlign: "right", color: "#64748b" }}>-</td>
                <td style={{ textAlign: "right", color: "#64748b" }}>-</td>
                <td style={{ textAlign: "right", color: "#64748b" }}>-</td>
                <td style={{ textAlign: "center", color: "#64748b", whiteSpace: "nowrap" }}>Balance B/F</td>
                <td style={{ 
                  textAlign: "right", 
                  fontWeight: "700", 
                  color: openingBalance > 0 ? "#b45309" : openingBalance < 0 ? "#047857" : "#111827",
                  whiteSpace: "nowrap"
                }}>
                  {openingBalance < 0 
                    ? `${formatCurrency(Math.abs(openingBalance))} CR` 
                    : formatCurrency(openingBalance)}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Quotations Activity Section if any */}
        {filteredQuotations.length > 0 && (
          <>
            <div className="section-title">Saved Price Quotations Activity</div>
            <table className="report-table">
              <thead>
                <tr>
                  <th style={{ width: "30px", textAlign: "center" }}>#</th>
                  <th style={{ width: "75px" }}>Date</th>
                  <th>Quotation No</th>
                  <th style={{ textAlign: "right" }}>Total Value</th>
                  <th style={{ textAlign: "center", width: "95px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotations.map((q, idx) => (
                  <tr key={q.id}>
                    <td style={{ textAlign: "center" }}>{idx + 1}</td>
                    <td>{new Date(q.created_at).toLocaleDateString("en-GB")}</td>
                    <td style={{ fontWeight: "600" }}>{q.quotation_number}</td>
                    <td style={{ textAlign: "right" }}>{formatCurrency(q.total_amount)}</td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`badge ${q.converted_to_order ? "badge-paid" : "badge-pending"}`}>
                        {q.converted_to_order ? "Converted" : "Active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Printable Footer */}
        <div style={{ 
          marginTop: "30px", 
          borderTop: "1px solid #d1d5db", 
          paddingTop: "10px", 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
          fontSize: "9px", 
          color: "#6b7280" 
        }}>
          <div>
            Statement generated by <strong>{shopSettings.name}</strong> POS System on {new Date().toLocaleString("en-GB")}.
          </div>
          <div>
            Thank you for your valued business.
          </div>
        </div>
      </div>
    </div>
  );
}
