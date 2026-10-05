"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/AuthGuard";
import { 
  BarChart2, 
  TrendingUp, 
  Users, 
  Package, 
  Calendar, 
  Printer, 
  DollarSign, 
  Clock, 
  Search,
  FileText,
  Percent,
  Download,
  AlertTriangle,
  AlertCircle
} from "lucide-react";

export default function ReportsPage() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  
  // Tab states
  const [activeTab, setActiveTab] = useState("profit"); // 'profit' | 'customer' | 'items' | 'balancing' | 'outstanding'

  useEffect(() => {
    if (tabParam && ["profit", "customer", "items", "balancing", "outstanding"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // Balancing reports states
  const [dayEndReports, setDayEndReports] = useState([]);
  const [weekendReports, setWeekendReports] = useState([]);
  const [balancingLoading, setBalancingLoading] = useState(false);

  // Edit Day End states
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [editCopyCount, setEditCopyCount] = useState("");
  const [editManualBilling, setEditManualBilling] = useState("");
  const [editExpenseAmount, setEditExpenseAmount] = useState("");
  const [editExpenseReason, setEditExpenseReason] = useState("");
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");

  const handleOpenEditModal = (report) => {
    setSelectedReport(report);
    setEditCopyCount(report.copy_count.toString());
    setEditManualBilling(report.manual_billing_amount === -1 ? "" : report.manual_billing_amount.toString());
    setEditExpenseAmount(report.expense_amount.toString());
    setEditExpenseReason(report.expense_reason || "");
    setEditError("");
    setEditSuccess("");
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedReport) return;
    if (editCopyCount === "" || editManualBilling === "") {
      setEditError("Please fill in the copy count and manual day balance.");
      return;
    }
    setSubmittingEdit(true);
    setEditError("");
    setEditSuccess("");
    try {
      const expAmt = Number(editExpenseAmount || 0);
      const manualAmt = Number(editManualBilling);
      const netCash = Number(selectedReport.total_cash_payments || 0) - expAmt;
      const updatedBy = selectedReport.created_by === "System (Auto)" ? `${profile?.username || "Owner"} (Verified)` : selectedReport.created_by;

      const { error } = await supabase
        .from("day_end_reports")
        .update({
          copy_count: Number(editCopyCount),
          manual_billing_amount: manualAmt,
          expense_amount: expAmt,
          expense_reason: editExpenseReason,
          net_drawer_cash: netCash,
          created_by: updatedBy
        })
        .eq("id", selectedReport.id);

      if (error) throw error;

      // Sync updated report to Google Sheets
      try {
        fetch("/api/sync-sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "DAY_END",
            date: selectedReport.date,
            copy_count: Number(editCopyCount),
            expense_amount: expAmt,
            expense_reason: editExpenseReason,
            expense_staff: selectedReport.expense_staff || "System",
            total_sales: selectedReport.total_sales,
            total_cash_payments: selectedReport.total_cash_payments,
            total_outstanding: selectedReport.total_outstanding,
            net_drawer_cash: netCash,
            manual_billing_amount: manualAmt,
            staff_name: updatedBy,
            username: profile?.username || "Owner",
            status: "DAY_END",
            is_update: true
          })
        });
      } catch (syncErr) {
        console.error("Sheets update sync failed:", syncErr);
      }

      setEditSuccess("Report updated successfully!");
      setDayEndReports(prev => prev.map(r => r.id === selectedReport.id ? {
        ...r,
        copy_count: Number(editCopyCount),
        manual_billing_amount: manualAmt,
        expense_amount: expAmt,
        expense_reason: editExpenseReason,
        net_drawer_cash: netCash,
        created_by: updatedBy
      } : r));

      setTimeout(() => {
        setShowEditModal(false);
        setSelectedReport(null);
        setEditSuccess("");
      }, 1500);
    } catch (err) {
      setEditError(err.message || "Failed to update Day End report.");
    } finally {
      setSubmittingEdit(false);
    }
  };

  const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatReportDate = (dateStr, createdAtStr) => {
    if (dateStr) {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const year = parts[0];
        const monthNum = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthName = months[monthNum - 1] || "";
        return `${monthName} ${day}, ${year}`;
      }
    }
    return new Date(createdAtStr).toLocaleDateString("en-US", { dateStyle: "medium" });
  };

  const autoGenerateMissedReports = async () => {
    try {
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() - 45);
      const limitStr = getLocalDateString(limitDate);
      
      const { data: existingReports, error: rError } = await supabase
        .from("day_end_reports")
        .select("date")
        .gte("date", limitStr);
        
      if (rError) throw rError;
      
      const existingDates = new Set((existingReports || []).map(r => r.date));
      
      const todayStr = getLocalDateString();
      const datesToCheck = [];
      for (let i = 1; i <= 45; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = getLocalDateString(d);
        
        if (!existingDates.has(dStr)) {
          datesToCheck.push(dStr);
        }
      }
      
      if (datesToCheck.length === 0) return;
      
      for (const missingDate of datesToCheck) {
        const startIso = `${missingDate}T00:00:00.000`;
        const endIso = `${missingDate}T23:59:59.999`;
        
        const { data: dayOrders, error: oError } = await supabase
          .from("orders")
          .select("total_amount, paid_amount, balance_amount, status")
          .gte("created_at", new Date(startIso).toISOString())
          .lte("created_at", new Date(endIso).toISOString());
          
        if (oError) {
          console.error("Error fetching orders for missing date:", missingDate, oError);
          continue;
        }
        
        const activeOrders = (dayOrders || []).filter(o => o.status !== "voided");
        let totalSales = 0;
        let totalCashPayments = 0;
        let totalOutstanding = 0;
        
        activeOrders.forEach(o => {
          totalSales += Number(o.total_amount || 0);
          totalCashPayments += Number(o.paid_amount || 0);
          totalOutstanding += Number(o.balance_amount || 0);
        });
        
        const { error: insertError } = await supabase
          .from("day_end_reports")
          .insert({
            date: missingDate,
            copy_count: 0,
            expense_amount: 0,
            expense_reason: "Auto generated due to missed staff entry",
            expense_staff: "System",
            total_sales: totalSales,
            total_cash_payments: totalCashPayments,
            total_outstanding: totalOutstanding,
            net_drawer_cash: totalCashPayments,
            manual_billing_amount: -1,
            created_by: "System (Auto)",
          });
          
        if (insertError && insertError.code !== "23505") {
          console.error("Error inserting missed day end report:", insertError);
        }
      }
    } catch (err) {
      console.error("Failed to auto-generate missed reports:", err);
    }
  };

  const fetchBalancingLogs = async () => {
    setBalancingLoading(true);
    try {
      // Auto generate any missed reports first
      await autoGenerateMissedReports();

      const { data: dayData, error: dayErr } = await supabase
        .from("day_end_reports")
        .select("*")
        .order("date", { ascending: false });

      if (dayErr) throw dayErr;
      setDayEndReports(dayData || []);

      const { data: weekData, error: weekErr } = await supabase
        .from("weekend_reports")
        .select("*")
        .order("date", { ascending: false });

      if (weekErr) throw weekErr;
      setWeekendReports(weekData || []);
    } catch (err) {
      console.error("Error loading balancing reports:", err);
    } finally {
      setBalancingLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "balancing") {
      fetchBalancingLogs();
    }
  }, [activeTab]);

  // Date Filter States (default to first of this month to today)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Data Loading states
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerLastDeals, setCustomerLastDeals] = useState({});
  const [outstandingSearch, setOutstandingSearch] = useState("");
  
  // Customer Statement Selection
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerOrders, setCustomerOrders] = useState([]);
  const [customerQuotations, setCustomerQuotations] = useState([]);
  const [customerLoading, setCustomerLoading] = useState(false);

  useEffect(() => {
    fetchBaseData();
  }, [startDate, endDate]);

  useEffect(() => {
    if (selectedCustomerId) {
      fetchCustomerSpecificData();
    } else {
      setCustomerOrders([]);
      setCustomerQuotations([]);
    }
  }, [selectedCustomerId, startDate, endDate]);

  const fetchBaseData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Customers List for dropdown
      const { data: custData } = await supabase
        .from("customers")
        .select("id, name, phone, outstanding_balance")
        .order("name", { ascending: true });
      setCustomers(custData || []);

      // 2. Fetch Orders within date range
      let query = supabase.from("orders").select("*, customers(*)");
      
      if (startDate) {
        query = query.gte("created_at", new Date(startDate).toISOString());
      }
      if (endDate) {
        const endDay = new Date(endDate);
        endDay.setHours(23, 59, 59, 999);
        query = query.lte("created_at", endDay.toISOString());
      }

      const { data: ordData, error: ordError } = await query.order("created_at", { ascending: false });
      if (ordError) throw ordError;
      setOrders(ordData || []);

      // 3. Fetch all orders (without date range restriction) to determine the absolute "Last Deal Date" for each customer
      const { data: allDeals } = await supabase
        .from("orders")
        .select("customer_id, created_at")
        .order("created_at", { ascending: false });

      const lastDealsMap = {};
      if (allDeals) {
        allDeals.forEach(deal => {
          if (deal.customer_id && !lastDealsMap[deal.customer_id]) {
            lastDealsMap[deal.customer_id] = deal.created_at;
          }
        });
      }
      setCustomerLastDeals(lastDealsMap);

    } catch (err) {
      console.error("Error loading reports data:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerSpecificData = async () => {
    setCustomerLoading(true);
    try {
      // 1. Fetch customer to get current balance
      const currentCust = customers.find(c => c.id === selectedCustomerId);
      const custDebt = Number(currentCust?.outstanding_balance || 0);

      // 2. Fetch all historical non-voided orders to compute running balance
      const { data: allOrds } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_id", selectedCustomerId)
        .neq("status", "voided")
        .order("created_at", { ascending: true });

      const rawOrders = allOrds || [];
      const totalNet = rawOrders.reduce((sum, o) => {
        return sum + (Number(o.total_amount || 0) - Number(o.paid_amount || 0));
      }, 0);
      const baseline = custDebt - totalNet;

      let running = baseline;
      const computed = rawOrders.map(o => {
        const net = Number(o.total_amount || 0) - Number(o.paid_amount || 0);
        running += net;
        return {
          ...o,
          running_balance: running
        };
      });

      // Filter by range
      let inRange = computed;
      if (startDate) {
        const sD = new Date(startDate);
        sD.setHours(0, 0, 0, 0);
        inRange = inRange.filter(o => new Date(o.created_at) >= sD);
      }
      if (endDate) {
        const eD = new Date(endDate);
        eD.setHours(23, 59, 59, 999);
        inRange = inRange.filter(o => new Date(o.created_at) <= eD);
      }

      setCustomerOrders([...inRange].reverse());

      // Fetch selected customer's quotations in this range
      let quoteQuery = supabase
        .from("quotations")
        .select("*")
        .eq("customer_id", selectedCustomerId);
      
      if (startDate) {
        quoteQuery = quoteQuery.gte("created_at", new Date(startDate).toISOString());
      }
      if (endDate) {
        const endDay = new Date(endDate);
        endDay.setHours(23, 59, 59, 999);
        quoteQuery = quoteQuery.lte("created_at", endDay.toISOString());
      }
      const { data: qts } = await quoteQuery.order("created_at", { ascending: false });
      setCustomerQuotations(qts || []);

    } catch (err) {
      console.error("Error loading customer-specific statements:", err);
    } finally {
      setCustomerLoading(false);
    }
  };

  // Helper to apply quick ranges
  const applyQuickRange = (rangeType) => {
    const today = new Date();
    let start = "";
    let end = today.toISOString().split("T")[0];

    switch (rangeType) {
      case "today":
        start = end;
        break;
      case "yesterday":
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        start = yesterday.toISOString().split("T")[0];
        end = start;
        break;
      case "week":
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);
        start = lastWeek.toISOString().split("T")[0];
        break;
      case "month":
        start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
        break;
      case "last_month":
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split("T")[0];
        end = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split("T")[0];
        break;
      case "year":
        start = new Date(today.getFullYear(), 0, 1).toISOString().split("T")[0];
        break;
      case "all":
        start = "";
        end = today.toISOString().split("T")[0];
        break;
      default:
        return;
    }
    setStartDate(start);
    setEndDate(end);
  };

  // Filter out voided orders for active calculations
  const activeOrders = orders.filter(o => o.status !== "voided");
  const voidedOrders = orders.filter(o => o.status === "voided");

  // Financial aggregates
  const totalRevenue = activeOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const totalCollected = activeOrders.reduce((sum, o) => sum + Number(o.paid_amount || 0), 0);
  const totalOutstanding = activeOrders.reduce((sum, o) => sum + Number(o.balance_amount || 0), 0);
  
  // Standard print shop margin assumptions: 
  // 55% Cost of Materials & operations, 45% Net Profit Margin
  const estCosts = totalRevenue * 0.55;
  const estProfit = totalRevenue * 0.45;

  // Daily summary logic
  const dailySummary = {};
  activeOrders.forEach(o => {
    const dateKey = o.created_at.split("T")[0];
    if (!dailySummary[dateKey]) {
      dailySummary[dateKey] = { date: dateKey, revenue: 0, collected: 0, pending: 0, ordersCount: 0 };
    }
    dailySummary[dateKey].revenue += Number(o.total_amount || 0);
    dailySummary[dateKey].collected += Number(o.paid_amount || 0);
    dailySummary[dateKey].pending += Number(o.balance_amount || 0);
    dailySummary[dateKey].ordersCount += 1;
  });
  const dailyLog = Object.values(dailySummary).sort((a, b) => b.date.localeCompare(a.date));

  // Item Sales logic
  const itemsSummary = {};
  activeOrders.forEach(o => {
    if (o.items && Array.isArray(o.items)) {
      o.items.forEach(item => {
        const name = item.name;
        const qty = Number(item.qty || 0);
        const total = Number(item.total || 0);
        if (!itemsSummary[name]) {
          itemsSummary[name] = { name, qty: 0, revenue: 0, transactionsCount: 0 };
        }
        itemsSummary[name].qty += qty;
        itemsSummary[name].revenue += total;
        itemsSummary[name].transactionsCount += 1;
      });
    }
  });
  const itemsList = Object.values(itemsSummary).sort((a, b) => b.revenue - a.revenue);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      minimumFractionDigits: 0
    }).format(val);
  };

  const getSelectedCustomerDetails = () => {
    return customers.find(c => c.id === selectedCustomerId);
  };

  const handlePrintCustomerStatement = () => {
    if (!selectedCustomerId) return;
    const url = `/customers/${selectedCustomerId}/print?start=${startDate}&end=${endDate}`;
    window.open(url, "_blank");
  };

  return (
    <div style={styles.container}>
      {/* Upper header */}
      <div>
        <h1 style={styles.title}>Reports & Operations Center</h1>
        <p style={styles.subtitle}>Analyze profitability, audit client statement timelines, and review print catalog performance</p>
      </div>

      {/* Date Filters Controller */}
      <section className="glass-panel" style={styles.filterCard}>
        <div style={styles.filterHeader}>
          <Calendar size={18} style={{ color: "var(--primary)" }} />
          <h2 style={styles.filterTitle}>Select Report Duration</h2>
        </div>
        
        <div style={styles.filterRow}>
          <div style={styles.dateInputs}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Start Date</label>
              <input 
                type="date" 
                className="input-field" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>End Date</label>
              <input 
                type="date" 
                className="input-field" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div style={styles.quickRanges}>
            <button onClick={() => applyQuickRange("today")} style={styles.rangeBtn}>Today</button>
            <button onClick={() => applyQuickRange("yesterday")} style={styles.rangeBtn}>Yesterday</button>
            <button onClick={() => applyQuickRange("week")} style={styles.rangeBtn}>Last 7 Days</button>
            <button onClick={() => applyQuickRange("month")} style={styles.rangeBtn}>This Month</button>
            <button onClick={() => applyQuickRange("last_month")} style={styles.rangeBtn}>Last Month</button>
            <button onClick={() => applyQuickRange("year")} style={styles.rangeBtn}>This Year</button>
            <button onClick={() => applyQuickRange("all")} style={styles.rangeBtn}>All Time</button>
          </div>
        </div>
      </section>

      {/* Reports Navigation Tabs */}
      <div style={styles.tabBar} className="reports-tab-bar no-print">
        <button 
          onClick={() => setActiveTab("profit")}
          style={{
            ...styles.tabBtn,
            ...(activeTab === "profit" ? styles.tabBtnActive : {})
          }}
        >
          <TrendingUp size={16} />
          <span>Profit & Financials</span>
        </button>
        
        <button 
          onClick={() => setActiveTab("customer")}
          style={{
            ...styles.tabBtn,
            ...(activeTab === "customer" ? styles.tabBtnActive : {})
          }}
        >
          <Users size={16} />
          <span>Customer Statements</span>
        </button>

        <button 
          onClick={() => setActiveTab("items")}
          style={{
            ...styles.tabBtn,
            ...(activeTab === "items" ? styles.tabBtnActive : {})
          }}
        >
          <Package size={16} />
          <span>Print Item Sales</span>
        </button>

        {(profile?.role === "owner" || profile?.role === "manager") && (
          <>
            <button 
              onClick={() => setActiveTab("balancing")}
              style={{
                ...styles.tabBtn,
                ...(activeTab === "balancing" ? styles.tabBtnActive : {})
              }}
            >
              <Calendar size={16} />
              <span>Day/Week Balancing Logs</span>
            </button>
            <button 
              onClick={() => setActiveTab("outstanding")}
              style={{
                ...styles.tabBtn,
                ...(activeTab === "outstanding" ? styles.tabBtnActive : {})
              }}
            >
              <DollarSign size={16} />
              <span>Outstanding Balances</span>
            </button>
            {profile?.role === "owner" && (
              <button 
                onClick={() => setActiveTab("avoided")}
                style={{
                  ...styles.tabBtn,
                  ...(activeTab === "avoided" ? { ...styles.tabBtnActive, background: "rgba(239, 68, 68, 0.08)", color: "var(--accent-red)" } : {})
                }}
              >
                <AlertTriangle size={16} />
                <span>Avoided Bills</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Loading state indicator */}
      {loading ? (
        <div style={styles.loaderContainer}>
          <div style={styles.spinner}></div>
        </div>
      ) : (
        <div style={styles.reportContent}>
          
          {/* TAB 1: PROFIT AND FINANCIAL REPORT */}
          {activeTab === "profit" && (
            <div className="animate-fade-in" style={styles.tabContentGrid}>
              
              {/* Aggregate Statistics Row */}
              <div style={styles.statsRow}>
                <div className="glass-panel" style={styles.statBox}>
                  <span style={styles.statLabel}>Gross Sales Revenue</span>
                  <span style={{ ...styles.statVal, color: "var(--text-main)" }}>{formatCurrency(totalRevenue)}</span>
                  <span style={styles.statDesc}>Total invoice value logged</span>
                </div>

                <div className="glass-panel" style={styles.statBox}>
                  <span style={styles.statLabel}>Revenue Collected</span>
                  <span style={{ ...styles.statVal, color: "var(--accent-green)" }}>{formatCurrency(totalCollected)}</span>
                  <span style={styles.statDesc}>Total payments cleared</span>
                </div>

                <div className="glass-panel" style={styles.statBox}>
                  <span style={styles.statLabel}>Outstanding Credits</span>
                  <span style={{ ...styles.statVal, color: totalOutstanding > 0 ? "var(--accent-orange)" : "var(--text-main)" }}>
                    {formatCurrency(totalOutstanding)}
                  </span>
                  <span style={styles.statDesc}>Uncollected pending payments</span>
                </div>

                <div className="glass-panel" style={{ ...styles.statBox, borderLeft: "4px solid var(--primary)" }}>
                  <span style={styles.statLabel}>Est. Net Profit (45%)</span>
                  <span style={{ ...styles.statVal, color: "var(--secondary)" }}>{formatCurrency(estProfit)}</span>
                  <span style={styles.statDesc}>Assumed material costs: {formatCurrency(estCosts)}</span>
                </div>
              </div>

              {/* Daily Sales Breakdown Table */}
              <div className="glass-panel" style={styles.detailCard}>
                <h3 style={styles.cardTitle}>Daily Summary Log</h3>
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Date</th>
                        <th style={styles.th}>Orders Count</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Daily Sales</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Daily Collections</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Daily Pending Debt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyLog.length === 0 ? (
                        <tr>
                          <td colSpan="5" style={styles.emptyRow}>No sales logged in this duration.</td>
                        </tr>
                      ) : (
                        dailyLog.map((log) => (
                          <tr key={log.date} style={styles.tr}>
                            <td style={{ ...styles.td, fontWeight: "700" }}>{new Date(log.date).toLocaleDateString("en-US", { dateStyle: "medium" })}</td>
                            <td style={styles.td}>{log.ordersCount} transactions</td>
                            <td style={{ ...styles.td, textAlign: "right", fontWeight: "600" }}>{formatCurrency(log.revenue)}</td>
                            <td style={{ ...styles.td, textAlign: "right", color: "var(--accent-green)" }}>{formatCurrency(log.collected)}</td>
                            <td style={{ ...styles.td, textAlign: "right", color: log.pending > 0 ? "var(--accent-orange)" : "var(--text-subtle)" }}>
                              {formatCurrency(log.pending)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: INDIVIDUAL CUSTOMER DURATION REPORTS */}
          {activeTab === "customer" && (
            <div className="animate-fade-in" style={styles.tabContentGrid}>
              
              {/* Customer Selector Block */}
              <div className="glass-panel" style={styles.selectorCard}>
                <div style={styles.selectorRow}>
                  <div style={{ flex: 1 }}>
                    <label style={styles.selectorLabel}>Choose Customer Profile</label>
                    <select
                      className="input-field"
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      style={styles.dropdownSelect}
                    >
                      <option value="">-- Choose client profile from directory --</option>
                      {customers.map(cust => (
                        <option key={cust.id} value={cust.id}>
                          {cust.name} ({cust.phone})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedCustomerId && (
                    <button 
                      onClick={handlePrintCustomerStatement}
                      className="btn btn-primary"
                      style={styles.printReportBtn}
                    >
                      <Printer size={16} />
                      <span>Print Statement Range</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Customer Summary & List */}
              {!selectedCustomerId ? (
                <div className="glass-panel" style={styles.placeholderCard}>
                  <Users size={36} style={{ color: "var(--text-subtle)", opacity: 0.4, marginBottom: "10px" }} />
                  <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                    Select a customer profile above to compute their custom billing and quotation statement for the filtered range.
                  </p>
                </div>
              ) : customerLoading ? (
                <div style={styles.loaderContainer}>
                  <div style={styles.spinner}></div>
                </div>
              ) : (
                <div style={styles.statementDetails}>
                  
                  {/* Aggregates for customer */}
                  <div style={styles.statsRow}>
                    <div className="glass-panel" style={styles.statBox}>
                      <span style={styles.statLabel}>Period Order Volume</span>
                      <span style={styles.statVal}>
                        {formatCurrency(customerOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0))}
                      </span>
                      <span style={styles.statDesc}>{customerOrders.length} orders in duration</span>
                    </div>

                    <div className="glass-panel" style={styles.statBox}>
                      <span style={styles.statLabel}>Period Collected</span>
                      <span style={{ ...styles.statVal, color: "var(--accent-green)" }}>
                        {formatCurrency(customerOrders.reduce((sum, o) => sum + Number(o.paid_amount || 0), 0))}
                      </span>
                      <span style={styles.statDesc}>Payments cleared in range</span>
                    </div>

                    <div className="glass-panel" style={styles.statBox}>
                      <span style={styles.statLabel}>Period Pending Balance</span>
                      <span style={{ ...styles.statVal, color: "var(--accent-orange)" }}>
                        {formatCurrency(customerOrders.reduce((sum, o) => sum + Number(o.balance_amount || 0), 0))}
                      </span>
                      <span style={styles.statDesc}>Debt accumulated in range</span>
                    </div>
                  </div>

                  {/* Customer Orders in range */}
                  <div className="glass-panel" style={styles.detailCard}>
                    <h3 style={styles.cardTitle}>Invoices & Payments List (Period)</h3>
                    <div style={styles.tableWrapper}>
                      <table style={styles.table}>
                        <thead>
                          <tr>
                            <th style={{ ...styles.th, width: "35px", textAlign: "center" }}>#</th>
                            <th style={{ ...styles.th, width: "85px", whiteSpace: "nowrap" }}>Date</th>
                            <th style={{ ...styles.th, whiteSpace: "nowrap" }}>Reference No</th>
                            <th style={{ ...styles.th, textAlign: "right", whiteSpace: "nowrap" }}>Total Amount</th>
                            <th style={{ ...styles.th, textAlign: "right", whiteSpace: "nowrap" }}>Paid Amount</th>
                            <th style={{ ...styles.th, textAlign: "right", whiteSpace: "nowrap" }}>Remaining Balance</th>
                            <th style={{ ...styles.th, textAlign: "center", whiteSpace: "nowrap" }}>Status</th>
                            <th style={{ ...styles.th, textAlign: "right", width: "115px", whiteSpace: "nowrap" }}>Total Outstanding</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customerOrders.length === 0 ? (
                            <tr>
                              <td colSpan="8" style={styles.emptyRow}>No invoices logged for this client during this period.</td>
                            </tr>
                          ) : (
                            customerOrders.map((order, idx) => (
                              <tr key={order.id} style={styles.tr}>
                                <td style={{ ...styles.td, textAlign: "center", color: "var(--text-muted)" }}>{idx + 1}</td>
                                <td style={{ ...styles.td, whiteSpace: "nowrap" }}>{new Date(order.created_at).toLocaleDateString()}</td>
                                <td style={{ ...styles.td, fontWeight: "600", color: "var(--secondary)", whiteSpace: "nowrap" }}>{order.order_number}</td>
                                <td style={{ ...styles.td, textAlign: "right", whiteSpace: "nowrap" }}>{formatCurrency(order.total_amount)}</td>
                                <td style={{ ...styles.td, textAlign: "right", color: "var(--accent-green)", whiteSpace: "nowrap" }}>{formatCurrency(order.paid_amount)}</td>
                                <td style={{ ...styles.td, textAlign: "right", fontWeight: "600", color: order.balance_amount > 0 ? "var(--accent-orange)" : "var(--text-main)", whiteSpace: "nowrap" }}>
                                  {formatCurrency(order.balance_amount)}
                                </td>
                                <td style={{ ...styles.td, textAlign: "center", whiteSpace: "nowrap" }}>
                                  <span className={`badge ${
                                    order.status === "paid" ? "badge-paid" : order.status === "partially_paid" ? "badge-partial" : "badge-pending"
                                  }`}>
                                    {order.status?.replace("_", " ")}
                                  </span>
                                </td>
                                <td style={{ ...styles.td, textAlign: "right", fontWeight: "700", color: Number(order.running_balance) > 0 ? "var(--accent-orange)" : Number(order.running_balance) < 0 ? "var(--accent-green)" : "var(--text-main)", whiteSpace: "nowrap" }}>
                                  {Number(order.running_balance) < 0 
                                    ? `${formatCurrency(Math.abs(order.running_balance))} CR` 
                                    : formatCurrency(order.running_balance || 0)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Customer Quotations in range */}
                  {customerQuotations.length > 0 && (
                    <div className="glass-panel" style={{ ...styles.detailCard, marginTop: "20px" }}>
                      <h3 style={styles.cardTitle}>Saved Price Quotations (Period)</h3>
                      <div style={styles.tableWrapper}>
                        <table style={styles.table}>
                          <thead>
                            <tr>
                              <th style={styles.th}>Date</th>
                              <th style={styles.th}>Quotation No</th>
                              <th style={{ ...styles.th, textAlign: "right" }}>Estimated Value</th>
                              <th style={styles.th}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customerQuotations.map(quote => (
                              <tr key={quote.id} style={styles.tr}>
                                <td>{new Date(quote.created_at).toLocaleDateString()}</td>
                                <td style={{ fontWeight: "600", color: "var(--primary)" }}>{quote.quotation_number}</td>
                                <td style={{ textAlign: "right", fontWeight: "600" }}>{formatCurrency(quote.total_amount)}</td>
                                <td>
                                  <span className={`badge ${quote.converted_to_order ? "badge-paid" : "badge-pending"}`}>
                                    {quote.converted_to_order ? "Converted" : "Active"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>
          )}

          {/* TAB 3: PRODUCT SALES REPORT */}
          {activeTab === "items" && (
            <div className="animate-fade-in" style={styles.tabContentGrid}>
              
              <div className="glass-panel" style={styles.detailCard}>
                <h3 style={styles.cardTitle}>Print Services Catalog Sales Performance</h3>
                <p style={styles.cardDesc}>Quantities sold and revenue generated grouped by print catalog item</p>
                
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ ...styles.th, width: "50px" }}>#</th>
                        <th style={styles.th}>Print Service Item</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Transactions logged</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Total Units Sold</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Total Revenue Generated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsList.length === 0 ? (
                        <tr>
                          <td colSpan="5" style={styles.emptyRow}>No print items sold in this duration.</td>
                        </tr>
                      ) : (
                        itemsList.map((item, idx) => (
                          <tr key={item.name} style={styles.tr}>
                            <td style={{ ...styles.td, color: "var(--text-subtle)", fontWeight: "bold" }}>{idx + 1}</td>
                            <td style={{ ...styles.td, fontWeight: "700" }}>{item.name}</td>
                            <td style={{ ...styles.td, textAlign: "right" }}>{item.transactionsCount} bills</td>
                            <td style={{ ...styles.td, textAlign: "right", fontWeight: "600", color: "var(--secondary)" }}>{item.qty} units</td>
                            <td style={{ ...styles.td, textAlign: "right", fontWeight: "700" }}>{formatCurrency(item.revenue)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: DAY/WEEK BALANCING LOGS */}
          {activeTab === "balancing" && (profile?.role === "owner" || profile?.role === "manager") && (
            <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              
              {/* Day End reports section */}
              <div className="glass-panel" style={styles.detailCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <div>
                    <h3 style={styles.cardTitle}>Day End Shift Reports</h3>
                    <p style={styles.cardDesc}>Summary of daily cash sales, copy count meter readings, and drawer cash reconciliation.</p>
                  </div>
                  {balancingLoading && <div style={styles.spinnerSmall}></div>}
                </div>

                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Date</th>
                        <th style={styles.th}>Logged By</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Copy Count</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Sales Total (Auto)</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Collections (Auto Cash)</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Billing Price (Manual Cash)</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Discrepancy (Cash)</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Pending Today (Auto)</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Expenses / Withdrawals</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Net Drawer Cash</th>
                        <th style={{ ...styles.th, textAlign: "center" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayEndReports.length === 0 ? (
                        <tr>
                          <td colSpan="11" style={styles.emptyRow}>No Day End reports submitted yet.</td>
                        </tr>
                      ) : (
                        dayEndReports.map((report) => (
                          <tr key={report.id} style={styles.tr}>
                            <td style={{ ...styles.td, fontWeight: "700" }}>{formatReportDate(report.date, report.created_at)}</td>
                            <td style={styles.td}>
                              {report.created_by === "System (Auto)" ? (
                                <span style={{ color: "var(--text-subtle)", fontStyle: "italic" }}>System (Auto)</span>
                              ) : (
                                report.created_by
                              )}
                            </td>
                            <td style={{ ...styles.td, textAlign: "right", fontWeight: "600", color: "var(--secondary)" }}>
                              {report.created_by === "System (Auto)" ? (
                                <span style={{ color: "var(--text-subtle)", fontStyle: "italic" }}>-</span>
                              ) : (
                                report.copy_count
                              )}
                            </td>
                            <td style={{ ...styles.td, textAlign: "right" }}>{formatCurrency(report.total_sales || 0)}</td>
                            <td style={{ ...styles.td, textAlign: "right", color: "var(--accent-green)" }}>{formatCurrency(report.total_cash_payments || 0)}</td>
                            <td style={{ ...styles.td, textAlign: "right", fontWeight: "600" }}>
                              {report.manual_billing_amount === -1 || report.manual_billing_amount === null || report.manual_billing_amount === undefined ? (
                                <span style={{ color: "var(--accent-red)", fontStyle: "italic", fontWeight: "700" }}>Missed</span>
                              ) : (
                                formatCurrency(report.manual_billing_amount)
                              )}
                            </td>
                            <td style={{ ...styles.td, textAlign: "right" }}>
                              {report.manual_billing_amount === -1 || report.manual_billing_amount === null || report.manual_billing_amount === undefined ? (
                                <span style={{ color: "var(--accent-red)", fontStyle: "italic", fontWeight: "700" }}>Review Needed</span>
                              ) : (() => {
                                const diff = Number(report.manual_billing_amount) - Number(report.total_cash_payments || 0);
                                if (diff === 0) {
                                  return <span style={{ color: "var(--accent-green)", fontWeight: "700" }}>✅ Match</span>;
                                } else if (diff > 0) {
                                  return <span style={{ color: "var(--accent-green)", fontWeight: "700" }}>+{formatCurrency(diff)}</span>;
                                } else {
                                  return <span style={{ color: "var(--accent-red)", fontWeight: "700" }}>{formatCurrency(diff)}</span>;
                                }
                              })()}
                            </td>
                            <td style={{ ...styles.td, textAlign: "right", color: "var(--accent-orange)", fontWeight: "600" }}>{formatCurrency(report.total_outstanding || 0)}</td>
                            <td style={{ ...styles.td, textAlign: "right" }}>
                              {report.expense_amount > 0 ? (
                                <div style={{ color: "var(--accent-red)" }}>
                                  <div>{formatCurrency(report.expense_amount)}</div>
                                  <div style={{ fontSize: "11px", color: "var(--text-subtle)", fontStyle: "italic" }}>
                                    {report.expense_reason} ({report.expense_staff || "Staff"})
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: "var(--text-subtle)" }}>
                                  {report.created_by === "System (Auto)" ? (
                                    <span style={{ color: "var(--text-subtle)", fontStyle: "italic" }}>-</span>
                                  ) : (
                                    "None"
                                  )}
                                </span>
                              )}
                            </td>
                            <td style={{ ...styles.td, textAlign: "right", fontWeight: "700", color: "var(--primary)" }}>
                              {formatCurrency(report.net_drawer_cash || 0)}
                            </td>
                            <td style={{ ...styles.td, textAlign: "center" }}>
                              <button
                                onClick={() => handleOpenEditModal(report)}
                                className="btn btn-secondary"
                                style={{ height: "28px", padding: "0 8px", fontSize: "12px", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                              >
                                ✏️ Edit
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Week End reports section */}
              <div className="glass-panel" style={styles.detailCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <div>
                    <h3 style={styles.cardTitle}>Week End Sunday Audits</h3>
                    <p style={styles.cardDesc}>Summary of Sunday weekend audits validating monthly totals against actual weekly collections under-the-hood.</p>
                  </div>
                </div>

                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Audit Date</th>
                        <th style={styles.th}>Audited By</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Entered Monthly Total</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Calculated Weekly Income</th>
                        <th style={styles.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weekendReports.length === 0 ? (
                        <tr>
                          <td colSpan="5" style={styles.emptyRow}>No Week End Sunday audits performed yet.</td>
                        </tr>
                      ) : (
                        weekendReports.map((report) => (
                          <tr key={report.id} style={styles.tr}>
                            <td style={{ ...styles.td, fontWeight: "700" }}>{new Date(report.date || report.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}</td>
                            <td style={styles.td}>{report.created_by}</td>
                            <td style={{ ...styles.td, textAlign: "right", fontWeight: "600", color: "var(--accent-green)" }}>{formatCurrency(report.entered_monthly_total || 0)}</td>
                            <td style={{ ...styles.td, textAlign: "right", color: "var(--text-muted)" }}>{formatCurrency(report.calculated_weekly_revenue || 0)}</td>
                            <td style={styles.td}>
                              {Number(report.entered_monthly_total) === Number(report.calculated_weekly_revenue) ? (
                                <span className="badge badge-paid" style={{ background: "rgba(34, 197, 94, 0.1)", color: "var(--accent-green)", borderColor: "rgba(34, 197, 94, 0.2)" }}>
                                  Verified & Match
                                </span>
                              ) : (
                                <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--accent-red)", borderColor: "rgba(239, 68, 68, 0.3)" }}>
                                  Discrepancy (Review)
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}
 
          {/* TAB 5: OUTSTANDING BALANCES LIST FOR OWNERS / MANAGERS */}
          {activeTab === "outstanding" && (profile?.role === "owner" || profile?.role === "manager") && (() => {
            // Filter customers who have outstanding balance > 0 (or all customers if they search, but default to those in debt)
            const debtCustomers = customers.filter(c => {
              const matchesSearch = c.name.toLowerCase().includes(outstandingSearch.toLowerCase()) || 
                                    c.phone.includes(outstandingSearch);
              // If they searched, show matches. If not, show only those with positive outstanding balance
              if (outstandingSearch) {
                return matchesSearch;
              }
              return Number(c.outstanding_balance || 0) > 0;
            });

            // Calculate aggregates
            const totalOutstandingDebt = customers.reduce((sum, c) => sum + Number(c.outstanding_balance || 0), 0);
            const countInDebt = customers.filter(c => Number(c.outstanding_balance || 0) > 0).length;

            return (
              <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {/* Aggregate Summary Box */}
                <div style={styles.statsRow}>
                  <div className="glass-panel" style={styles.statBox}>
                    <span style={styles.statLabel}>Total Outstanding Debt</span>
                    <span style={{ ...styles.statVal, color: "var(--accent-orange)" }}>{formatCurrency(totalOutstandingDebt)}</span>
                    <span style={styles.statDesc}>Cumulative unpaid balances from all profiles</span>
                  </div>
                  <div className="glass-panel" style={styles.statBox}>
                    <span style={styles.statLabel}>Active Clients in Debt</span>
                    <span style={{ ...styles.statVal, color: "var(--text-main)" }}>{countInDebt}</span>
                    <span style={styles.statDesc}>Registered teacher/student ledger files</span>
                  </div>
                </div>

                {/* Main Table view */}
                <div className="glass-panel" style={styles.detailCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
                    <div>
                      <h3 style={styles.cardTitle}>Teacher Outstanding Ledger</h3>
                      <p style={styles.cardDesc}>Review current debt statements and the last print deal date for each teacher profile.</p>
                    </div>
                    {/* Search bar inside the card */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0 10px", width: "100%", maxWidth: "300px" }}>
                      <Search size={16} style={{ color: "var(--text-muted)" }} />
                      <input
                        type="text"
                        placeholder="Search teacher by name or phone..."
                        className="input-field"
                        style={{ background: "none", border: "none", height: "36px", fontSize: "13px", color: "var(--text-main)", outline: "none", width: "100%" }}
                        value={outstandingSearch}
                        onChange={(e) => setOutstandingSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={styles.tableWrapper}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Teacher / Client Name</th>
                          <th style={styles.th}>Phone Number</th>
                          <th style={{ ...styles.th, textAlign: "right" }}>Outstanding Balance</th>
                          <th style={styles.th}>Last Deal Date</th>
                          <th style={{ ...styles.th, textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {debtCustomers.length === 0 ? (
                          <tr>
                            <td colSpan="5" style={styles.emptyRow}>
                              {outstandingSearch ? "No profiles matched your search." : "No teachers have any outstanding debt."}
                            </td>
                          </tr>
                        ) : (
                          debtCustomers.map((cust) => {
                            const lastDeal = customerLastDeals[cust.id];
                            return (
                              <tr key={cust.id} style={styles.tr}>
                                <td style={{ ...styles.td, fontWeight: "700" }}>{cust.name}</td>
                                <td style={styles.td}>{cust.phone}</td>
                                <td style={{ ...styles.td, textAlign: "right", fontWeight: "700", color: Number(cust.outstanding_balance) > 0 ? "var(--accent-orange)" : "var(--accent-green)" }}>
                                  {formatCurrency(cust.outstanding_balance || 0)}
                                </td>
                                <td style={styles.td}>
                                  {lastDeal ? (
                                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                      <Clock size={12} style={{ color: "var(--text-muted)" }} />
                                      {new Date(lastDeal).toLocaleDateString("en-US", { dateStyle: "medium" })}
                                    </span>
                                  ) : (
                                    <span style={{ color: "var(--text-subtle)", fontStyle: "italic" }}>No orders logged</span>
                                  )}
                                </td>
                                <td style={{ ...styles.td, textAlign: "right" }}>
                                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                                    <button
                                      onClick={() => {
                                        setSelectedCustomerId(cust.id);
                                        setActiveTab("customer");
                                      }}
                                      className="btn btn-secondary"
                                      style={{ padding: "4px 10px", fontSize: "12px", height: "30px" }}
                                    >
                                      View Statement
                                    </button>
                                    <button
                                      onClick={() => {
                                        window.open(`/customers/${cust.id}/print?start=${startDate}&end=${endDate}`, "_blank");
                                      }}
                                      className="btn btn-primary"
                                      style={{ padding: "4px 10px", fontSize: "12px", height: "30px", background: "var(--secondary)", borderColor: "var(--secondary)" }}
                                    >
                                      Print
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* TAB 6: AVOIDED BILLS LIST FOR OWNERS */}
          {activeTab === "avoided" && profile?.role === "owner" && (() => {
            const voidedList = voidedOrders.filter(o => {
              const custName = o.customers?.name || "Walk-in";
              const matchesSearch = o.order_number.toLowerCase().includes(outstandingSearch.toLowerCase()) || 
                                    custName.toLowerCase().includes(outstandingSearch.toLowerCase());
              return matchesSearch;
            });

            const totalVoidedVal = voidedOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
            const countVoided = voidedOrders.length;

            return (
              <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {/* Aggregate Summary Box */}
                <div style={styles.statsRow}>
                  <div className="glass-panel" style={styles.statBox}>
                    <span style={styles.statLabel}>Total Avoided Value</span>
                    <span style={{ ...styles.statVal, color: "var(--accent-red)" }}>{formatCurrency(totalVoidedVal)}</span>
                    <span style={styles.statDesc}>Cumulative value of canceled invoices</span>
                  </div>
                  <div className="glass-panel" style={styles.statBox}>
                    <span style={styles.statLabel}>Avoided Transactions Count</span>
                    <span style={{ ...styles.statVal, color: "var(--text-main)" }}>{countVoided}</span>
                    <span style={styles.statDesc}>Total void transactions logged in this duration</span>
                  </div>
                </div>

                {/* Main Table view */}
                <div className="glass-panel" style={styles.detailCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
                    <div>
                      <h3 style={styles.cardTitle}>Avoided Bills Audit Log</h3>
                      <p style={styles.cardDesc}>Audit all cancelled print ledger files, reasons, and responsible staff members.</p>
                    </div>
                    {/* Reuse search bar */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0 10px", width: "100%", maxWidth: "300px" }}>
                      <Search size={16} style={{ color: "var(--text-muted)" }} />
                      <input
                        type="text"
                        placeholder="Search order or client..."
                        className="input-field"
                        style={{ background: "none", border: "none", height: "36px", fontSize: "13px", color: "var(--text-main)", outline: "none", width: "100%" }}
                        value={outstandingSearch}
                        onChange={(e) => setOutstandingSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={styles.tableWrapper}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Order Number</th>
                          <th style={styles.th}>Teacher / Client Name</th>
                          <th style={styles.th}>Voided By</th>
                          <th style={styles.th}>Date Avoided</th>
                          <th style={styles.th}>Reason</th>
                          <th style={{ ...styles.th, textAlign: "right" }}>Original Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {voidedList.length === 0 ? (
                          <tr>
                            <td colSpan="6" style={styles.emptyRow}>
                              {outstandingSearch ? "No profiles matched your search." : "No bills have been voided."}
                            </td>
                          </tr>
                        ) : (
                          voidedList.map((o) => (
                            <tr key={o.id} style={styles.tr}>
                              <td style={{ ...styles.td, fontWeight: "700", color: "var(--accent-red)" }}>{o.order_number}</td>
                              <td style={styles.td}>{o.customers?.name || "Walk-in"}</td>
                              <td style={styles.td}>{o.voided_by || "Unknown"}</td>
                              <td style={styles.td}>
                                {o.voided_at ? new Date(o.voided_at).toLocaleDateString("en-US", { dateStyle: "medium" }) : "N/A"}
                              </td>
                              <td style={{ ...styles.td, color: "var(--text-muted)", fontStyle: "italic", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.voided_reason}>
                                {o.voided_reason || "No reason specified"}
                              </td>
                              <td style={{ ...styles.td, textAlign: "right", fontWeight: "700" }}>
                                {formatCurrency(o.total_amount)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}


        </div>
      )}

      {/* Edit Day End Report Modal */}
      {showEditModal && selectedReport && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel modal-content" style={styles.modalContent}>
            <h3 style={styles.modalTitle}>Edit Day End Report</h3>
            <p style={styles.modalSubtitle}>
              Update balancing audit for date: <strong style={{ color: "var(--primary)" }}>{formatReportDate(selectedReport.date, selectedReport.created_at)}</strong>
            </p>

            {editError && (
              <div style={styles.errorAlert}>
                <AlertTriangle size={16} />
                <span>{editError}</span>
              </div>
            )}

            {editSuccess && (
              <div style={styles.successAlert}>
                <CheckCircle size={16} />
                <span>{editSuccess}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} style={styles.modalForm}>
              <div style={styles.formRow}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Copy Count</label>
                  <input
                    type="number"
                    className="input-field"
                    value={editCopyCount}
                    onChange={(e) => setEditCopyCount(e.target.value)}
                    style={styles.modalInput}
                    required
                    min="0"
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Manually Counted Cash (LKR)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={editManualBilling}
                    placeholder="Enter counted cash amount"
                    onChange={(e) => setEditManualBilling(e.target.value)}
                    style={styles.modalInput}
                    required
                    min="0"
                  />
                </div>
              </div>

              <div style={styles.formRow}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Expense Amount (LKR)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={editExpenseAmount}
                    onChange={(e) => setEditExpenseAmount(e.target.value)}
                    style={styles.modalInput}
                    min="0"
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Expense/Withdrawal Reason</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editExpenseReason}
                    onChange={(e) => setEditExpenseReason(e.target.value)}
                    style={styles.modalInput}
                    placeholder="e.g. Tea cost, Petty cash"
                  />
                </div>
              </div>

              <div style={{ marginTop: "8px", padding: "12px", borderRadius: "var(--radius-sm)", background: "rgba(15, 23, 42, 0.3)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Collections (Auto Cash):</span>
                  <strong style={{ color: "var(--accent-green)" }}>{formatCurrency(selectedReport.total_cash_payments || 0)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Calculated Net Cash:</span>
                  <strong style={{ color: "var(--primary)" }}>{formatCurrency(Number(selectedReport.total_cash_payments || 0) - Number(editExpenseAmount || 0))}</strong>
                </div>
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedReport(null);
                  }}
                  className="btn btn-secondary"
                  style={{ height: "40px" }}
                  disabled={submittingEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ height: "40px" }}
                  disabled={submittingEdit}
                >
                  {submittingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    paddingTop: "20px",
  },
  title: {
    fontSize: "32px",
    fontWeight: "800",
  },
  subtitle: {
    color: "var(--text-muted)",
    fontSize: "14px",
    marginTop: "4px",
  },
  filterCard: {
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  filterHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    borderBottom: "1px solid var(--border)",
    paddingBottom: "10px",
  },
  filterTitle: {
    fontSize: "16px",
    fontWeight: "700",
  },
  filterRow: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  dateInputs: {
    display: "flex",
    gap: "20px",
    flexWrap: "wrap",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: "200px",
  },
  label: {
    fontSize: "12px",
    color: "var(--text-muted)",
    fontWeight: "600",
  },
  quickRanges: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    borderTop: "1px dashed var(--border)",
    paddingTop: "12px",
  },
  rangeBtn: {
    background: "var(--bg-surface-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    padding: "6px 12px",
    fontSize: "12px",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    fontWeight: "600",
    transition: "var(--transition-fast)",
  },
  tabBar: {
    display: "flex",
    gap: "12px",
    borderBottom: "1px solid var(--border)",
    paddingBottom: "10px",
    marginTop: "10px",
  },
  tabBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    borderRadius: "var(--radius-sm)",
    transition: "var(--transition-fast)",
  },
  tabBtnActive: {
    color: "var(--text-main)",
    background: "var(--primary-glow)",
  },
  loaderContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "250px",
  },
  spinner: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: "3px solid var(--border)",
    borderTopColor: "var(--primary)",
    animation: "spin 1s linear infinite",
  },
  spinnerSmall: {
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    border: "2px solid var(--border)",
    borderTopColor: "var(--primary)",
    animation: "spin 1s linear infinite",
  },
  reportContent: {
    marginTop: "10px",
  },
  tabContentGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "20px",
  },
  statBox: {
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  statLabel: {
    fontSize: "11px",
    fontWeight: "700",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  statVal: {
    fontSize: "24px",
    fontWeight: "800",
    letterSpacing: "-0.01em",
  },
  statDesc: {
    fontSize: "11px",
    color: "var(--text-subtle)",
  },
  detailCard: {
    padding: "24px",
  },
  cardTitle: {
    fontSize: "18px",
    fontWeight: "700",
    marginBottom: "16px",
  },
  cardDesc: {
    fontSize: "13px",
    color: "var(--text-muted)",
    marginBottom: "16px",
    marginTop: "-12px",
  },
  tableWrapper: {
    width: "100%",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  th: {
    padding: "12px 16px",
    fontSize: "12px",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    fontWeight: "600",
    borderBottom: "1px solid var(--border)",
  },
  tr: {
    borderBottom: "1px solid var(--border)",
  },
  td: {
    padding: "16px",
    fontSize: "14px",
  },
  emptyRow: {
    padding: "40px 0",
    textAlign: "center",
    color: "var(--text-subtle)",
  },
  selectorCard: {
    padding: "20px 24px",
  },
  selectorRow: {
    display: "flex",
    gap: "20px",
    alignItems: "flex-end",
    flexWrap: "wrap",
  },
  selectorLabel: {
    fontSize: "13px",
    fontWeight: "600",
    color: "var(--text-muted)",
    marginBottom: "8px",
    display: "block",
  },
  dropdownSelect: {
    height: "44px",
    fontSize: "14px",
  },
  printReportBtn: {
    height: "44px",
    padding: "0 20px",
    fontSize: "14px",
  },
  placeholderCard: {
    padding: "60px 40px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  statementDetails: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    backdropFilter: "blur(4px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    width: "100%",
    maxWidth: "500px",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    background: "var(--bg-surface-elevated)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
  },
  modalTitle: {
    fontSize: "20px",
    fontWeight: "700",
    color: "var(--text-main)",
  },
  modalSubtitle: {
    fontSize: "14px",
    color: "var(--text-muted)",
    marginTop: "-8px",
  },
  modalForm: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  modalInput: {
    background: "rgba(15, 23, 42, 0.4)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    height: "40px",
    padding: "0 12px",
    fontSize: "14px",
    color: "var(--text-main)",
    width: "100%",
    outline: "none",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
    marginTop: "8px",
  },
  errorAlert: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px",
    borderRadius: "var(--radius-sm)",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid var(--accent-red)",
    color: "var(--accent-red)",
    fontSize: "13px",
  },
  successAlert: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px",
    borderRadius: "var(--radius-sm)",
    background: "rgba(34, 197, 94, 0.1)",
    border: "1px solid var(--accent-green)",
    color: "var(--accent-green)",
    fontSize: "13px",
  },
};
