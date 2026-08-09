"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/AuthGuard";
import { 
  TrendingUp, 
  ShoppingBag, 
  Clock, 
  Users, 
  ArrowUpRight, 
  DollarSign, 
  RefreshCw,
  ShoppingCart,
  Receipt,
  AlertTriangle,
  Calendar,
  Lock,
  AlertCircle,
  CheckCircle,
  WifiOff
} from "lucide-react";

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function DashboardPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    todaySales: 0,
    todayOrdersCount: 0,
    pendingPayments: 0,
    customersCount: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Day End State Variables
  const [showDayEndModal, setShowDayEndModal] = useState(false);
  const [copyCount, setCopyCount] = useState("");
  const [manualBillingAmount, setManualBillingAmount] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseReason, setExpenseReason] = useState("");
  const [expenseStaff, setExpenseStaff] = useState("");
  const [submittingDayEnd, setSubmittingDayEnd] = useState(false);
  const [dayEndError, setDayEndError] = useState("");
  const [dayEndSuccess, setDayEndSuccess] = useState("");

  // Week End State Variables
  const [showWeekEndModal, setShowWeekEndModal] = useState(false);
  const [monthlyTotal, setMonthlyTotal] = useState("");
  const [submittingWeekEnd, setSubmittingWeekEnd] = useState(false);
  const [weekEndError, setWeekEndError] = useState("");
  const [weekEndSuccess, setWeekEndSuccess] = useState("");
  const [showWeekEndConfirm, setShowWeekEndConfirm] = useState(false);
  const [weekEndWarning, setWeekEndWarning] = useState("");
  const [calculatedWeeklyIncome, setCalculatedWeeklyIncome] = useState(0);

  const handleDayEndSubmit = async (e) => {
    e.preventDefault();
    if (!copyCount) {
      setDayEndError("Please enter the copy count meter reading.");
      return;
    }
    if (!manualBillingAmount) {
      setDayEndError("Please enter the manually counted billing price.");
      return;
    }
    setSubmittingDayEnd(true);
    setDayEndError("");
    setDayEndSuccess("");

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetch today's orders to calculate stats
      const { data: todayOrders, error: oError } = await supabase
        .from("orders")
        .select("total_amount, paid_amount, balance_amount, status")
        .gte("created_at", today.toISOString());

      if (oError) throw oError;

      // Filter out voided orders
      const activeOrders = (todayOrders || []).filter(o => o.status !== "voided");

      let totalSales = 0;
      let totalCashPayments = 0;
      let totalOutstanding = 0;

      activeOrders.forEach(o => {
        totalSales += Number(o.total_amount || 0);
        totalCashPayments += Number(o.paid_amount || 0);
        totalOutstanding += Number(o.balance_amount || 0);
      });

      const netDrawerCash = totalCashPayments - Number(expenseAmount || 0);

      const { error: insertError } = await supabase
        .from("day_end_reports")
        .insert({
          date: getLocalDateString(today),
          copy_count: Number(copyCount),
          expense_amount: Number(expenseAmount || 0),
          expense_reason: expenseReason || "",
          expense_staff: expenseStaff || "",
          total_sales: totalSales,
          total_cash_payments: totalCashPayments,
          total_outstanding: totalOutstanding,
          net_drawer_cash: netDrawerCash,
          manual_billing_amount: Number(manualBillingAmount),
          created_by: profile?.username || "Unknown",
        });

      if (insertError) throw insertError;

      // Sheets sync for Day End Balancing
      try {
        fetch("/api/sync-sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "DAY_END",
            date: getLocalDateString(today),
            copy_count: Number(copyCount),
            expense_amount: Number(expenseAmount || 0),
            expense_reason: expenseReason || "",
            expense_staff: expenseStaff || "",
            total_sales: totalSales,
            total_cash_payments: totalCashPayments,
            total_outstanding: totalOutstanding,
            net_drawer_cash: netDrawerCash,
            manual_billing_amount: Number(manualBillingAmount),
            staff_name: profile?.full_name || profile?.username || "Unknown",
            username: profile?.username || "Unknown",
            status: "DAY_END"
          })
        });
      } catch (syncErr) {
        console.error("Sheets Day End sync failed:", syncErr);
      }

      setDayEndSuccess("Day End balancing report submitted successfully!");
      setTimeout(() => {
        setShowDayEndModal(false);
        setCopyCount("");
        setManualBillingAmount("");
        setExpenseAmount("");
        setExpenseReason("");
        setExpenseStaff("");
        setDayEndSuccess("");
      }, 2000);
    } catch (err) {
      setDayEndError(err.message || "Failed to submit Day End report.");
    } finally {
      setSubmittingDayEnd(false);
    }
  };

  const handleWeekEndSubmit = async (e) => {
    e.preventDefault();
    setWeekEndError("");
    setWeekEndSuccess("");
    setSubmittingWeekEnd(true);

    try {
      // Calculate date 7 days ago
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      // Fetch orders in the last 7 days
      const { data: weeklyOrders, error: oError } = await supabase
        .from("orders")
        .select("paid_amount, status")
        .gte("created_at", sevenDaysAgo.toISOString());

      if (oError) throw oError;

      // Filter out voided orders and calculate actual weekly collections (paid_amount sum)
      const activeOrders = (weeklyOrders || []).filter(o => o.status !== "voided");
      let weeklyIncome = 0;
      activeOrders.forEach(o => {
        weeklyIncome += Number(o.paid_amount || 0);
      });

      const enteredTotal = Number(monthlyTotal);
      setCalculatedWeeklyIncome(weeklyIncome);

      // Determine warning message based on comparison
      if (enteredTotal > weeklyIncome) {
        setWeekEndWarning("Value to match but acceptable. Are you sure you want to enter?");
      } else if (enteredTotal < weeklyIncome) {
        setWeekEndWarning("Audit needed, money lost. Are you sure you want to enter?");
      } else {
        setWeekEndWarning("Values match. Are you sure you want to enter?");
      }

      setShowWeekEndConfirm(true);
    } catch (err) {
      setWeekEndError(err.message || "Failed to validate Week End report.");
    } finally {
      setSubmittingWeekEnd(false);
    }
  };

  const confirmWeekEndSubmit = async () => {
    setWeekEndError("");
    setWeekEndSuccess("");
    setSubmittingWeekEnd(true);

    try {
      // Save report
      const { error: insertError } = await supabase
        .from("weekend_reports")
        .insert({
          date: getLocalDateString(),
          entered_monthly_total: Number(monthlyTotal),
          calculated_weekly_revenue: calculatedWeeklyIncome,
          created_by: profile?.username || "Unknown",
        });

      if (insertError) throw insertError;

      // Sheets sync for Week End Balancing
      try {
        await fetch("/api/sync-sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "WEEK_END",
            date: getLocalDateString(),
            entered_monthly_total: Number(monthlyTotal),
            calculated_weekly_revenue: calculatedWeeklyIncome,
            staff_name: profile?.full_name || profile?.username || "Unknown",
            username: profile?.username || "Unknown",
            status: "WEEK_END"
          })
        });
      } catch (syncErr) {
        console.error("Sheets Week End sync failed:", syncErr);
      }

      setWeekEndSuccess("Week End Sunday balancing report submitted successfully!");
      setTimeout(() => {
        setShowWeekEndModal(false);
        setShowWeekEndConfirm(false);
        setMonthlyTotal("");
        setCalculatedWeeklyIncome(0);
        setWeekEndSuccess("");
        setWeekEndWarning("");
      }, 2000);
    } catch (err) {
      setWeekEndError(err.message || "Failed to submit Week End report.");
    } finally {
      setSubmittingWeekEnd(false);
    }
  };

  const fetchDashboardData = async (attempt = 0) => {
    try {
      setFetchError(false);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 1. Fetch Today's Orders
      const { data: todayOrders, error: todayError } = await supabase
        .from("orders")
        .select("total_amount, paid_amount, balance_amount, status")
        .gte("created_at", today.toISOString());

      if (todayError) throw todayError;

      // 2. Fetch Outstanding Balance (Pending Payments)
      const { data: unpaidOrders, error: unpaidError } = await supabase
        .from("orders")
        .select("balance_amount")
        .gt("balance_amount", 0)
        .neq("status", "voided");

      if (unpaidError) throw unpaidError;

      // 3. Fetch Customer Count
      const { count: customersCount, error: custError } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true });

      if (custError) throw custError;

      // 4. Fetch 5 Recent Orders with Customer Details
      const { data: recent, error: recentError } = await supabase
        .from("orders")
        .select(`
          id,
          order_number,
          total_amount,
          status,
          created_at,
          customers (name, phone)
        `)
        .order("created_at", { ascending: false })
        .limit(5);

      if (recentError) throw recentError;

      // Calculations
      const activeTodayOrders = (todayOrders || []).filter(o => o.status !== "voided");
      let salesSum = 0;
      let ordersCount = activeTodayOrders.length;
      activeTodayOrders.forEach(order => {
        salesSum += Number(order.total_amount || 0);
      });

      let pendingSum = 0;
      unpaidOrders?.forEach(order => {
        pendingSum += Number(order.balance_amount || 0);
      });

      setStats({
        todaySales: salesSum,
        todayOrdersCount: ordersCount,
        pendingPayments: pendingSum,
        customersCount: customersCount || 0,
      });
      setRecentOrders(recent || []);
      setFetchError(false);
    } catch (err) {
      console.error("Dashboard Loading Error:", err.message);
      // Auto-retry up to 3 times with 2s delay for network errors
      if (attempt < 3 && (err.message?.includes("fetch") || err.message?.includes("network") || err.message?.includes("Failed"))) {
        setTimeout(() => {
          setRetryCount(attempt + 1);
          fetchDashboardData(attempt + 1);
        }, 2000);
      } else {
        setFetchError(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Set up real-time subscription for orders
    const ordersChannel = supabase
      .channel("dashboard-orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          setRefreshing(true);
          fetchDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case "paid": return "badge-paid";
      case "pending": return "badge-pending";
      case "partially_paid": return "badge-partial";
      default: return "";
    }
  };

  const isSunday = new Date().getDay() === 0;

  return (
    <div style={styles.container}>
      {/* Default Passcode Warning Banner */}
      {profile?.passcode === "1234" && (
        <div style={{
          background: "var(--accent-red-glow)",
          color: "var(--accent-red)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          padding: "12px 16px",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "13px",
          fontWeight: "600",
          marginBottom: "-10px",
        }}>
          <AlertTriangle size={16} />
          <span>Security Warning: You are using the default staff passcode PIN "1234". Please go to <Link href="/settings" style={{ color: "#ffffff", textDecoration: "underline" }}>Settings</Link> to change it.</span>
        </div>
      )}

      {/* Sunday balancing Audit Reminder */}
      {isSunday && (
        <div style={{
          background: "var(--accent-orange-glow)",
          color: "var(--accent-orange)",
          border: "1px solid rgba(251, 146, 60, 0.2)",
          padding: "12px 16px",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "13px",
          fontWeight: "600",
          marginBottom: "-10px",
        }}>
          <AlertTriangle size={16} />
          <span><strong>Balancing Reminder:</strong> Today is Sunday! Please perform the <strong>Week End</strong> balancing audit to reconcile this week's income.</span>
        </div>
      )}

      {/* Upper header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Dashboard</h1>
          <p style={styles.subtitle}>Real-time print operations & financial overview</p>
        </div>
        <button 
          onClick={() => { setRefreshing(true); fetchDashboardData(); }} 
          style={styles.refreshBtn}
          disabled={refreshing || loading}
        >
          <RefreshCw size={16} className={refreshing ? "spin" : ""} />
          <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
        </button>
      </div>

      {loading ? (
        <div style={styles.loaderContainer}>
          <div style={styles.spinner}></div>
        </div>
      ) : (
        <div style={styles.contentGrid}>
          {/* Card 1: Today's Sales */}
          <div className="glass-panel" style={styles.statCard}>
            <div style={styles.statCardHeader}>
              <div style={{ ...styles.iconWrapper, backgroundColor: "var(--primary-glow)", color: "var(--primary)" }}>
                <TrendingUp size={20} />
              </div>
              <span style={styles.cardHeaderTitle}>Sales Today</span>
            </div>
            <div style={styles.statValue}>
              {profile?.role === "owner" || profile?.role === "manager" 
                ? formatCurrency(stats.todaySales) 
                : "—"}
            </div>
            <div style={styles.cardFooterText}>
              {profile?.role === "owner" || profile?.role === "manager"
                ? `From ${stats.todayOrdersCount} print orders today`
                : "Authorized Access Only"}
            </div>
          </div>

          {/* Card 2: Today's Orders */}
          <div className="glass-panel" style={styles.statCard}>
            <div style={styles.statCardHeader}>
              <div style={{ ...styles.iconWrapper, backgroundColor: "rgba(6, 182, 212, 0.1)", color: "var(--secondary)" }}>
                <ShoppingBag size={20} />
              </div>
              <span style={styles.cardHeaderTitle}>Orders Today</span>
            </div>
            <div style={styles.statValue}>{stats.todayOrdersCount}</div>
            <div style={styles.cardFooterText}>Active queue processing</div>
          </div>

          {/* Card 3: Outstanding Receivables */}
          {profile?.role === "owner" || profile?.role === "manager" ? (
            <Link 
              href="/reports?tab=outstanding" 
              className="glass-panel" 
              style={{ ...styles.statCard, cursor: "pointer", textDecoration: "none", color: "inherit" }}
            >
              <div style={styles.statCardHeader}>
                <div style={{ ...styles.iconWrapper, backgroundColor: "var(--accent-orange-glow)", color: "var(--accent-orange)" }}>
                  <Clock size={20} />
                </div>
                <span style={styles.cardHeaderTitle}>Unpaid Balance</span>
              </div>
              <div style={{ ...styles.statValue, color: "var(--accent-orange)" }}>{formatCurrency(stats.pendingPayments)}</div>
              <div style={styles.cardFooterText}>Total outstanding from clients</div>
            </Link>
          ) : (
            <div className="glass-panel" style={styles.statCard}>
              <div style={styles.statCardHeader}>
                <div style={{ ...styles.iconWrapper, backgroundColor: "var(--accent-orange-glow)", color: "var(--accent-orange)" }}>
                  <Clock size={20} />
                </div>
                <span style={styles.cardHeaderTitle}>Unpaid Balance</span>
              </div>
              <div style={{ ...styles.statValue, color: "var(--accent-orange)" }}>{formatCurrency(stats.pendingPayments)}</div>
              <div style={styles.cardFooterText}>Total outstanding from clients</div>
            </div>
          )}

          {/* Card 4: Total Customers */}
          <div className="glass-panel" style={styles.statCard}>
            <div style={styles.statCardHeader}>
              <div style={{ ...styles.iconWrapper, backgroundColor: "var(--accent-green-glow)", color: "var(--accent-green)" }}>
                <Users size={20} />
              </div>
              <span style={styles.cardHeaderTitle}>Customers</span>
            </div>
            <div style={styles.statValue}>{stats.customersCount}</div>
            <div style={styles.cardFooterText}>Registered in directory</div>
          </div>

          {/* Lower Grid: Quick Actions and Recent Activity */}
          <div className="dashboard-lower-grid" style={styles.lowerGrid}>
            {/* Quick Actions */}
            <div className="glass-panel" style={styles.actionsPanel}>
              <h2 style={styles.panelTitle}>Quick Operations</h2>
              <div style={styles.actionButtons}>
                <Link href="/pos" className="btn btn-primary" style={styles.actionBtn}>
                  <ShoppingCart size={18} />
                  New POS Order
                </Link>
                <Link href="/customers" className="btn btn-secondary" style={styles.actionBtn}>
                  <Users size={18} />
                  Add Customer
                </Link>
                <Link href="/orders" className="btn btn-secondary" style={styles.actionBtn}>
                  <Receipt size={18} />
                  View All Orders
                </Link>
                <button 
                  onClick={() => {
                    setCopyCount("");
                    setExpenseAmount("");
                    setExpenseReason("");
                    setExpenseStaff(profile?.full_name || profile?.username || "");
                    setDayEndError("");
                    setDayEndSuccess("");
                    setShowDayEndModal(true);
                  }}
                  className="btn btn-secondary" 
                  style={{ ...styles.actionBtn, cursor: "pointer", border: "1px solid var(--accent-orange)", color: "var(--accent-orange)" }}
                >
                  <Calendar size={18} />
                  Day End Balancing
                </button>
                <button 
                  onClick={() => {
                    setMonthlyTotal("");
                    setWeekEndError("");
                    setWeekEndSuccess("");
                    setCalculatedWeeklyIncome(0);
                    setWeekEndWarning("");
                    setShowWeekEndConfirm(false);
                    setShowWeekEndModal(true);
                  }}
                  className="btn btn-secondary" 
                  style={{ ...styles.actionBtn, cursor: "pointer", border: "1px solid var(--accent-green)", color: "var(--accent-green)" }}
                >
                  <TrendingUp size={18} />
                  Week End Audit
                </button>
              </div>
            </div>

            {/* Recent Orders */}
            <div className="glass-panel" style={styles.ordersPanel}>
              <div style={styles.panelHeaderRow}>
                <h2 style={styles.panelTitle}>Recent Billing Queue</h2>
                <Link href="/orders" style={styles.viewAllLink}>
                  <span>View All Queue</span>
                  <ArrowUpRight size={16} />
                </Link>
              </div>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Order ID</th>
                      <th style={styles.th}>Customer</th>
                      <th style={styles.th}>Total</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={styles.emptyRow}>No orders found. Open the POS screen to create one.</td>
                      </tr>
                    ) : (
                      recentOrders.map((order) => (
                        <tr key={order.id} style={styles.tr}>
                          <td style={styles.td}>
                            <Link href={`/orders?id=${order.id}`} style={styles.orderLink}>
                              {order.order_number || "ORD-TEMP"}
                            </Link>
                          </td>
                          <td style={styles.td}>
                            <div>{order.customers?.name || "Walk-in Customer"}</div>
                            <div style={styles.custPhone}>{order.customers?.phone || "-"}</div>
                          </td>
                          <td style={styles.td}>{formatCurrency(order.total_amount)}</td>
                          <td style={styles.td}>
                            <span className={`badge ${getStatusBadgeClass(order.status)}`}>
                              {order.status?.replace("_", " ")}
                            </span>
                          </td>
                          <td style={styles.td}>
                            {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DAY END BALANCING MODAL */}
      {showDayEndModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel-elevated animate-fade-in" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={{ ...styles.modalTitle, color: "var(--accent-orange)", display: "flex", alignItems: "center", gap: "8px" }}>
                <Calendar size={20} />
                <span>Day End Balancing Shift</span>
              </h3>
            </div>

            <form onSubmit={handleDayEndSubmit} style={styles.modalForm}>
              {dayEndSuccess && (
                <div style={{
                  background: "rgba(34, 197, 94, 0.1)",
                  border: "1px solid var(--accent-green)",
                  color: "var(--accent-green)",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}>
                  <CheckCircle size={16} />
                  <span>{dayEndSuccess}</span>
                </div>
              )}

              {dayEndError && (
                <div style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid var(--accent-red)",
                  color: "var(--accent-red)",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}>
                  <AlertCircle size={16} />
                  <span>{dayEndError}</span>
                </div>
              )}

              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Total Copy Count *</label>
                <input
                  type="number"
                  placeholder="Enter final meter copy count reading"
                  className="input-field"
                  style={{ height: "40px", fontSize: "14px", width: "100%" }}
                  value={copyCount}
                  onChange={(e) => setCopyCount(e.target.value)}
                  required
                  disabled={submittingDayEnd}
                />
              </div>

              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Manually Counted Day Balance (LKR) *</label>
                <input
                  type="number"
                  placeholder="Enter manually counted day balance"
                  className="input-field"
                  style={{ height: "40px", fontSize: "14px", width: "100%" }}
                  value={manualBillingAmount}
                  onChange={(e) => setManualBillingAmount(e.target.value)}
                  required
                  disabled={submittingDayEnd}
                />
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px", marginTop: "4px" }}>
                <h4 style={{ fontSize: "13px", fontWeight: "700", marginBottom: "8px", color: "var(--text-muted)" }}>Cash Register Withdrawals / Expenses</h4>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={styles.modalInputGroup}>
                    <label style={styles.modalLabel}>Expense Amount (LKR)</label>
                    <input
                      type="number"
                      placeholder="0"
                      className="input-field"
                      style={{ height: "40px", fontSize: "14px", width: "100%" }}
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      disabled={submittingDayEnd}
                    />
                  </div>

                  <div style={styles.modalInputGroup}>
                    <label style={styles.modalLabel}>Withdrawal Reason</label>
                    <input
                      type="text"
                      placeholder="e.g. Lunch expense, printer repairs, drawer cash out"
                      className="input-field"
                      style={{ height: "40px", fontSize: "14px", width: "100%" }}
                      value={expenseReason}
                      onChange={(e) => setExpenseReason(e.target.value)}
                      disabled={submittingDayEnd}
                    />
                  </div>

                  <div style={styles.modalInputGroup}>
                    <label style={styles.modalLabel}>Staff Name (Logged in)</label>
                    <input
                      type="text"
                      placeholder="Name of staff requesting withdrawal"
                      className="input-field"
                      style={{ height: "40px", fontSize: "14px", width: "100%", opacity: 0.8, backgroundColor: "var(--bg-surface-elevated)" }}
                      value={expenseStaff}
                      readOnly
                      disabled={submittingDayEnd}
                    />
                  </div>
                </div>
              </div>

              <div style={styles.modalBtnRow}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowDayEndModal(false)}
                  disabled={submittingDayEnd}
                  style={{ height: "38px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ height: "38px" }}
                  disabled={submittingDayEnd}
                >
                  {submittingDayEnd ? "Submitting..." : "Submit Balancing"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WEEK END BALANCING AUDIT MODAL */}
      {showWeekEndModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel-elevated animate-fade-in" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={{ ...styles.modalTitle, color: "var(--accent-green)", display: "flex", alignItems: "center", gap: "8px" }}>
                <TrendingUp size={20} />
                <span>Week End Sunday Audit</span>
              </h3>
            </div>

            <form onSubmit={handleWeekEndSubmit} style={styles.modalForm}>
              {showWeekEndConfirm ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{
                    background: Number(monthlyTotal) < calculatedWeeklyIncome ? "var(--accent-red-glow)" : "var(--accent-green-glow)",
                    color: Number(monthlyTotal) < calculatedWeeklyIncome ? "var(--accent-red)" : "var(--accent-green)",
                    border: Number(monthlyTotal) < calculatedWeeklyIncome ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid rgba(34, 197, 94, 0.2)",
                    padding: "16px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "14px",
                    lineHeight: "1.5",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    fontWeight: "600",
                    textAlign: "center"
                  }}>
                    <AlertTriangle size={32} style={{ margin: "0 auto", color: Number(monthlyTotal) < calculatedWeeklyIncome ? "var(--accent-red)" : "var(--accent-green)" }} />
                    <span>{weekEndWarning}</span>
                  </div>

                  {weekEndSuccess && (
                    <div style={{
                      background: "rgba(34, 197, 94, 0.1)",
                      border: "1px solid var(--accent-green)",
                      color: "var(--accent-green)",
                      padding: "10px 14px",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}>
                      <CheckCircle size={16} />
                      <span>{weekEndSuccess}</span>
                    </div>
                  )}

                  {weekEndError && (
                    <div style={{
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid var(--accent-red)",
                      color: "var(--accent-red)",
                      padding: "10px 14px",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}>
                      <AlertCircle size={16} />
                      <span>{weekEndError}</span>
                    </div>
                  )}

                  <div style={styles.modalBtnRow}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowWeekEndConfirm(false);
                        setWeekEndWarning("");
                      }}
                      disabled={submittingWeekEnd}
                      style={{ height: "38px" }}
                    >
                      No (Edit)
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{
                        height: "38px",
                        backgroundColor: Number(monthlyTotal) < calculatedWeeklyIncome ? "var(--accent-red)" : "var(--accent-green)",
                        color: "#fff"
                      }}
                      onClick={confirmWeekEndSubmit}
                      disabled={submittingWeekEnd}
                    >
                      {submittingWeekEnd ? "Submitting..." : "Yes (Submit)"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {weekEndSuccess && (
                    <div style={{
                      background: "rgba(34, 197, 94, 0.1)",
                      border: "1px solid var(--accent-green)",
                      color: "var(--accent-green)",
                      padding: "10px 14px",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}>
                      <CheckCircle size={16} />
                      <span>{weekEndSuccess}</span>
                    </div>
                  )}

                  {weekEndError && (
                    <div style={{
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid var(--accent-red)",
                      color: "var(--accent-red)",
                      padding: "10px 14px",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}>
                      <AlertCircle size={16} />
                      <span>{weekEndError}</span>
                    </div>
                  )}

                  <div style={{
                    background: "rgba(34, 197, 94, 0.05)",
                    border: "1px solid rgba(34, 197, 94, 0.15)",
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                    color: "var(--accent-green)",
                    lineHeight: "1.4",
                    marginBottom: "8px"
                  }}>
                    <strong>Verification Policy:</strong> To lock weekly bookkeeping files, please enter the Total of the Month. The ledger will validate this input under-the-hood against recorded weekly income without disclosing the true value.
                  </div>

                  <div style={styles.modalInputGroup}>
                    <label style={styles.modalLabel}>Total of the Month (LKR) *</label>
                    <input
                      type="number"
                      placeholder="Enter the cumulative monthly total"
                      className="input-field"
                      style={{ height: "40px", fontSize: "14px", width: "100%" }}
                      value={monthlyTotal}
                      onChange={(e) => setMonthlyTotal(e.target.value)}
                      required
                      disabled={submittingWeekEnd}
                    />
                  </div>

                  <div style={styles.modalBtnRow}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowWeekEndModal(false)}
                      disabled={submittingWeekEnd}
                      style={{ height: "38px" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ height: "38px", backgroundColor: "var(--accent-green)" }}
                      disabled={submittingWeekEnd}
                    >
                      {submittingWeekEnd ? "Verifying..." : "Validate & Submit Audit"}
                    </button>
                  </div>
                </>
              )}
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
    gap: "30px",
    paddingTop: "20px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
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
  refreshBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "var(--bg-surface-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-main)",
    padding: "8px 16px",
    borderRadius: "var(--radius-sm)",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "var(--transition-fast)",
  },
  loaderContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "300px",
  },
  spinner: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: "3px solid var(--border)",
    borderTopColor: "var(--primary)",
    animation: "spin 1s linear infinite",
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "20px",
  },
  statCard: {
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  statCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  iconWrapper: {
    width: "40px",
    height: "40px",
    borderRadius: "var(--radius-sm)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderTitle: {
    fontSize: "14px",
    fontWeight: "600",
    color: "var(--text-muted)",
  },
  statValue: {
    fontSize: "28px",
    fontWeight: "800",
    letterSpacing: "-0.01em",
  },
  cardFooterText: {
    fontSize: "12px",
    color: "var(--text-subtle)",
  },
  lowerGrid: {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: "1fr 2fr",
    gap: "20px",
    marginTop: "10px",
    "@media (maxWidth: 991px)": {
      gridTemplateColumns: "1fr",
    }
  },
  actionsPanel: {
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    height: "fit-content",
  },
  panelTitle: {
    fontSize: "18px",
    fontWeight: "700",
    color: "var(--text-main)",
  },
  actionButtons: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  actionBtn: {
    width: "100%",
    height: "46px",
  },
  ordersPanel: {
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  panelHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  viewAllLink: {
    fontSize: "13px",
    color: "var(--primary)",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
    gap: "4px",
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
    fontWeight: "600",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    borderBottom: "1px solid var(--border)",
  },
  tr: {
    borderBottom: "1px solid var(--border)",
    transition: "var(--transition-fast)",
  },
  td: {
    padding: "16px",
    fontSize: "14px",
    color: "var(--text-main)",
  },
  orderLink: {
    color: "var(--secondary)",
    fontWeight: "600",
  },
  custPhone: {
    fontSize: "12px",
    color: "var(--text-subtle)",
  },
  emptyRow: {
    padding: "30px",
    textAlign: "center",
    color: "var(--text-subtle)",
    fontSize: "14px",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    backdropFilter: "blur(6px)",
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },
  modalCard: {
    width: "100%",
    maxWidth: "480px",
    padding: "30px",
    borderRadius: "var(--radius-sm)",
  },
  modalHeader: {
    marginBottom: "20px",
    borderBottom: "1px solid var(--border)",
    paddingBottom: "10px",
  },
  modalTitle: {
    fontSize: "20px",
    fontWeight: "700",
  },
  modalForm: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  modalInputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  modalLabel: {
    fontSize: "12px",
    fontWeight: "600",
    color: "var(--text-muted)",
  },
  modalBtnRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "10px",
  },
};
