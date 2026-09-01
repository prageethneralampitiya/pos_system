"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function CustomerPrintPage() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState({ start: "", end: "" });
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
      fetchCustomerData();
    }
  }, [id]);

  const fetchCustomerData = async () => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const startDateStr = searchParams.get("start");
      const endDateStr = searchParams.get("end");
      setDateFilter({ start: startDateStr || "", end: endDateStr || "" });

      // 1. Fetch Customer
      const { data: cust, error: cError } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .single();
      if (cError) throw cError;
      setCustomer(cust);

      // 2. Fetch Orders (excluding voided bills)
      let orderQuery = supabase
        .from("orders")
        .select("*")
        .eq("customer_id", id)
        .neq("status", "voided");
      
      if (startDateStr) {
        orderQuery = orderQuery.gte("created_at", new Date(startDateStr).toISOString());
      }
      if (endDateStr) {
        const endDay = new Date(endDateStr);
        endDay.setHours(23, 59, 59, 999);
        orderQuery = orderQuery.lte("created_at", endDay.toISOString());
      }

      const { data: ords, error: oError } = await orderQuery.order("created_at", { ascending: false });
      if (oError) throw oError;
      setOrders(ords || []);

      // 3. Fetch Quotations
      let quoteQuery = supabase
        .from("quotations")
        .select("*")
        .eq("customer_id", id);
      
      if (startDateStr) {
        quoteQuery = quoteQuery.gte("created_at", new Date(startDateStr).toISOString());
      }
      if (endDateStr) {
        const endDay = new Date(endDateStr);
        endDay.setHours(23, 59, 59, 999);
        quoteQuery = quoteQuery.lte("created_at", endDay.toISOString());
      }

      const { data: qts, error: qError } = await quoteQuery.order("created_at", { ascending: false });
      if (qError) throw qError;
      setQuotations(qts || []);

    } catch (err) {
      console.error("Error loading customer print report:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!loading && !settingsLoading && customer) {
      const timer = setTimeout(() => {
        window.print();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, settingsLoading, customer]);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      minimumFractionDigits: 2
    }).format(val).replace("LKR", "Rs");
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
        <p>Generating Account Statement Report...</p>
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

  const activeOrders = orders.filter(o => o.status !== "voided");
  const salesOrders = activeOrders.filter(o => !o.order_number?.startsWith("PAY-") && Number(o.total_amount || 0) > 0);
  const payOrders = activeOrders.filter(o => o.order_number?.startsWith("PAY-") || Number(o.total_amount || 0) === 0);

  const totalDealsValue = salesOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const totalCollected = salesOrders.filter(o => o.status === "paid" && o.payment_method !== "pending").reduce((sum, o) => sum + Number(o.total_amount || 0), 0) + payOrders.reduce((sum, o) => sum + Number(o.paid_amount || 0), 0);
  const currentDebt = Number(customer.outstanding_balance || 0);

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
            margin: 12mm 10mm;
          }
        }
        @media screen {
          body {
            background-color: #f3f4f6 !important;
          }
          .print-report-container {
            padding: 30px 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .report-wrapper {
            background: #ffffff;
            width: 210mm;
            min-height: 297mm;
            padding: 15mm 12mm;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            border: 1px solid #d1d5db;
            box-sizing: border-box;
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
          border-bottom: 2px solid #333333;
          padding-bottom: 12px;
          margin-bottom: 20px;
        }
        .title-block h1 {
          font-size: 22px;
          font-weight: 800;
          margin: 0;
          letter-spacing: 0.02em;
        }
        .title-block p {
          margin: 4px 0 0 0;
          color: #4b5563;
          font-size: 12px;
        }
        .shop-info {
          text-align: right;
          font-size: 10px;
          color: #111111;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 40px;
          margin-bottom: 20px;
        }
        .section-title {
          font-size: 12px;
          font-weight: 700;
          border-bottom: 1px solid #d1d5db;
          padding-bottom: 4px;
          margin-bottom: 8px;
          text-transform: uppercase;
        }
        .info-table {
          width: 100%;
          border-collapse: collapse;
        }
        .info-table td {
          padding: 2px 0;
          font-size: 11px;
        }
        .info-table td.label {
          width: 90px;
          color: #4b5563;
        }
        .info-table td.val {
          font-weight: 600;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 15px;
          margin-bottom: 25px;
        }
        .stat-card {
          border: 1px solid #cccccc;
          background-color: #f9fafb;
          padding: 10px 12px;
          border-radius: 4px;
        }
        .stat-label {
          font-size: 9px;
          color: #4b5563;
          text-transform: uppercase;
          font-weight: 700;
        }
        .stat-val {
          font-size: 16px;
          font-weight: 800;
          margin-top: 4px;
        }
        .report-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 25px;
        }
        .report-table th {
          border: 1px solid #cccccc;
          background-color: #f3f4f6;
          padding: 6px 8px;
          font-size: 10px;
          font-weight: 700;
          text-align: left;
        }
        .report-table td {
          border: 1px solid #e5e7eb;
          padding: 6px 8px;
          font-size: 10px;
        }
        .badge {
          display: inline-block;
          padding: 2px 6px;
          font-size: 9px;
          font-weight: 700;
          border-radius: 99px;
          text-transform: uppercase;
        }
        .badge-paid { background-color: #d1fae5; color: #065f46; }
        .badge-pending { background-color: #fef3c7; color: #92400e; }
        .badge-partial { background-color: #dbeafe; color: #1e40af; }
        
        .no-print-bar {
          background-color: #111827;
          color: #ffffff;
          padding: 10px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-family: sans-serif;
          font-size: 13px;
          width: 100%;
          box-sizing: border-box;
        }
        .no-print-actions {
          display: flex;
          gap: 8px;
        }
        .action-btn-primary {
          background: #22c55e;
          border: none;
          color: #ffffff;
          padding: 5px 12px;
          border-radius: 4px;
          font-weight: 600;
          cursor: pointer;
        }
        .action-btn-secondary {
          background: #4b5563;
          border: none;
          color: #ffffff;
          padding: 5px 12px;
          border-radius: 4px;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>

      <div className="no-print-bar no-print">
        <span>Account Statement Report - {shopSettings.name}</span>
        <div className="no-print-actions">
          <button onClick={() => window.print()} className="action-btn-primary">Print Statement</button>
          <button onClick={() => window.close()} className="action-btn-secondary">Close Tab</button>
        </div>
      </div>

      <div className="report-wrapper">
        <div className="header">
          <div className="title-block">
            {shopSettings.logoUrl && (
              <img 
                src="/logo.png" 
                alt={shopSettings.name} 
                style={{ height: "45px", maxWidth: "160px", marginBottom: "8px", objectFit: "contain", display: "block" }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            )}
            <h1>STATEMENT OF ACCOUNT</h1>
            <p>Customer transaction and payment history report</p>
          </div>
          <div className="shop-info">
            <div style={{ fontWeight: "bold", fontSize: "12px" }}>{shopSettings.name}</div>
            <div>{shopSettings.addressLine1}</div>
            <div>{shopSettings.addressLine2} {shopSettings.addressLine3}</div>
            <div>Phone: {shopSettings.phone}</div>
            <div>Email: {shopSettings.email}</div>
          </div>
        </div>

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
                  <td className="label">Report Date:</td>
                  <td className="val">{new Date().toLocaleDateString()}</td>
                </tr>
                {dateFilter.start || dateFilter.end ? (
                  <tr>
                    <td className="label">Filtered Period:</td>
                    <td className="val" style={{ color: "#b45309", fontWeight: "bold" }}>
                      {dateFilter.start ? new Date(dateFilter.start).toLocaleDateString() : "Beginning"} - {dateFilter.end ? new Date(dateFilter.end).toLocaleDateString() : "Today"}
                    </td>
                  </tr>
                ) : null}
                <tr>
                  <td className="label">Registered:</td>
                  <td className="val">{new Date(customer.created_at).toLocaleDateString()}</td>
                </tr>
                <tr>
                  <td className="label">Status:</td>
                  <td className="val" style={{ color: currentDebt > 0 ? "#b45309" : "#047857", fontWeight: "bold" }}>
                    {currentDebt > 0 ? "Outstanding Debt Balance" : "Account Settled"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Volume of Deals</div>
            <div className="stat-val">{formatCurrency(totalDealsValue)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Amount Paid</div>
            <div className="stat-val" style={{ color: "#047857" }}>{formatCurrency(totalCollected)}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: "3px solid #b45309" }}>
            <div className="stat-label">Current Outstanding Debt</div>
            <div className="stat-val" style={{ color: "#b45309" }}>{formatCurrency(currentDebt)}</div>
          </div>
        </div>

        <div className="section-title">Orders & Billing Activity</div>
        <table className="report-table">
          <thead>
            <tr>
              <th style={{ width: "35px" }}>#</th>
              <th>Date</th>
              <th>Reference No</th>
              <th style={{ textAlign: "right" }}>Total Amount</th>
              <th style={{ textAlign: "right" }}>Paid Amount</th>
              <th style={{ textAlign: "right" }}>Remaining Balance</th>
              <th style={{ textAlign: "center", width: "90px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {activeOrders.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: "center", padding: "12px", color: "#4b5563" }}>
                  No billing history found for this client.
                </td>
              </tr>
            ) : (
              activeOrders.map((o, idx) => (
                <tr key={o.id}>
                  <td>{idx + 1}</td>
                  <td>{new Date(o.created_at).toLocaleDateString()}</td>
                  <td style={{ fontWeight: "600" }}>{o.order_number}</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(o.total_amount)}</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(o.paid_amount)}</td>
                  <td style={{ textAlign: "right", fontWeight: "600" }}>{formatCurrency(o.balance_amount)}</td>
                  <td style={{ textAlign: "center" }}>
                    <span className={`badge ${
                      o.status === "paid" ? "badge-paid" : o.status === "partially_paid" ? "badge-partial" : "badge-pending"
                    }`}>
                      {o.status?.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {quotations.length > 0 && (
          <>
            <div className="section-title">Quotations Activity</div>
            <table className="report-table">
              <thead>
                <tr>
                  <th style={{ width: "35px" }}>#</th>
                  <th>Date</th>
                  <th>Quotation No</th>
                  <th style={{ textAlign: "right" }}>Total Value</th>
                  <th style={{ textAlign: "center", width: "90px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((q, idx) => (
                  <tr key={q.id}>
                    <td>{idx + 1}</td>
                    <td>{new Date(q.created_at).toLocaleDateString()}</td>
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

        <div style={{ marginTop: "40px", borderTop: "1px solid #d1d5db", paddingTop: "12px", textAlign: "center", fontSize: "9px", color: "#6b7280" }}>
          Statement generated automatically by {shopSettings.name} POS System. Thank you for your business.
        </div>
      </div>
    </div>
  );
}
