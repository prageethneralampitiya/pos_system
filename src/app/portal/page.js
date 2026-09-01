"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { 
  User, 
  Lock, 
  Phone, 
  LogOut, 
  DollarSign, 
  Receipt, 
  Calendar, 
  Printer, 
  AlertTriangle,
  ArrowRight,
  BookOpen
} from "lucide-react";

export default function PortalPage() {
  const [phoneInput, setPhoneInput] = useState("");
  const [passcodeInput, setPasscodeInput] = useState("");
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isInitializing, setIsInitializing] = useState(true);

  const getFilteredOrders = () => {
    if (!customer) return orders;
    const limit = customer.portal_duration_limit || "2m";
    if (limit === "all") return orders;
    
    const now = new Date();
    const cutoff = new Date();
    if (limit === "1m") {
      cutoff.setMonth(now.getMonth() - 1);
    } else if (limit === "2m") {
      cutoff.setMonth(now.getMonth() - 2);
    } else if (limit === "6m") {
      cutoff.setMonth(now.getMonth() - 6);
    }
    return orders.filter(o => new Date(o.created_at) >= cutoff);
  };

  // First Login Passcode Change States
  const [showChangePin, setShowChangePin] = useState(false);
  const [newPasscodeVal, setNewPasscodeVal] = useState("");
  const [confirmPasscodeVal, setConfirmPasscodeVal] = useState("");
  const [changePinError, setChangePinError] = useState("");
  const [submittingPasscode, setSubmittingPasscode] = useState(false);

  useEffect(() => {
    // Check if customer session exists in localStorage
    const savedCustId = localStorage.getItem("printx_portal_customer_id");
    if (savedCustId) {
      autoLogin(savedCustId);
    } else {
      setIsInitializing(false);
    }
  }, []);

  const autoLogin = async (custId) => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", custId)
        .single();

      if (error || !data) {
        // Stale session — customer no longer found. Clear and show login.
        localStorage.removeItem("printx_portal_customer_id");
        setIsInitializing(false);
        return;
      }

      setCustomer(data);
      if (data.portal_passcode === "1234") {
        setShowChangePin(true);
      } else {
        fetchOrders(data.id);
      }
    } catch (e) {
      // Silent fallback — clear stale session data
      localStorage.removeItem("printx_portal_customer_id");
    } finally {
      setIsInitializing(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!phoneInput.trim() || !passcodeInput.trim()) {
      setLoginError("Please enter both your phone number and passcode.");
      return;
    }

    setLoading(true);
    setLoginError("");

    const cleanedPhone = phoneInput.replace(/[\s-()]/g, "");

    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .or(`phone.eq.${phoneInput.trim()},phone.eq.${cleanedPhone}`)
        .eq("portal_passcode", passcodeInput.trim())
        .single();

      if (error || !data) {
        setLoginError("Invalid phone number or passcode PIN. Please verify details with PRINT X staff.");
        setLoading(false);
        return;
      }

      setCustomer(data);
      localStorage.setItem("printx_portal_customer_id", data.id);
      if (data.portal_passcode === "1234") {
        setShowChangePin(true);
      } else {
        fetchOrders(data.id);
      }
    } catch (err) {
      setLoginError("Invalid credentials or server connection issue.");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePasscode = async (e) => {
    e.preventDefault();
    if (!newPasscodeVal.trim() || !confirmPasscodeVal.trim()) {
      setChangePinError("Please fill in both fields.");
      return;
    }
    if (newPasscodeVal.trim() === "1234") {
      setChangePinError("For security, your new PIN cannot be the default '1234'.");
      return;
    }
    if (newPasscodeVal.trim() !== confirmPasscodeVal.trim()) {
      setChangePinError("The new PIN codes do not match.");
      return;
    }

    setSubmittingPasscode(true);
    setChangePinError("");

    try {
      const { error } = await supabase
        .from("customers")
        .update({ portal_passcode: newPasscodeVal.trim() })
        .eq("id", customer.id);

      if (error) throw error;

      // Update customer state locally
      const updatedCust = { ...customer, portal_passcode: newPasscodeVal.trim() };
      setCustomer(updatedCust);
      setShowChangePin(false);
      fetchOrders(updatedCust.id);
    } catch (err) {
      setChangePinError("Failed to update passcode. Please check connection.");
    } finally {
      setSubmittingPasscode(false);
    }
  };

  const fetchOrders = async (custId) => {
    setLoadingOrders(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_id", custId)
        .neq("status", "voided")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (e) {
      console.error("Failed to load portal billing history:", e);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("printx_portal_customer_id");
    setCustomer(null);
    setOrders([]);
    setPhoneInput("");
    setPasscodeInput("");
    setLoginError("");
    setShowChangePin(false);
    setNewPasscodeVal("");
    setConfirmPasscodeVal("");
    setChangePinError("");
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2
    }).format(val).replace("$", "Rs");
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "paid": return "Paid";
      case "pending": return "Unpaid";
      case "partially_paid": return "Partial";
      default: return status;
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case "paid": return "status-paid";
      case "pending": return "status-unpaid";
      case "partially_paid": return "status-partial";
      default: return "";
    }
  };

  if (isInitializing) {
    return (
      <div className="portal-loader-container">
        <style>{`
          .portal-loader-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
            color: #ffffff;
            font-family: system-ui, -apple-system, sans-serif;
          }
          .spinner {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: 3px solid rgba(255,255,255,0.1);
            border-top-color: #6366f1;
            animation: spin 1s linear infinite;
            margin-bottom: 16px;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
        <div className="spinner"></div>
        <p>Loading Account Statement...</p>
      </div>
    );
  }

  return (
    <div className="portal-layout">
      <style>{`
        /* Global CSS Rules for Portal styling */
        .portal-layout {
          min-height: 100vh;
          background: linear-gradient(135deg, #0f172a 0%, #18181b 100%);
          color: #f4f4f5;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          padding: 0;
          margin: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          box-sizing: border-box;
          -webkit-font-smoothing: antialiased;
        }

        /* Login Card */
        .login-card {
          background: rgba(24, 24, 27, 0.75);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          width: 100%;
          max-width: 400px;
          padding: 40px 32px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
          box-sizing: border-box;
          margin: 20px;
          animation: slideUp 0.5s ease-out;
        }

        .login-header {
          text-align: center;
          margin-bottom: 30px;
        }

        .login-logo {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 50px;
          height: 50px;
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          border-radius: 12px;
          color: #ffffff;
          margin-bottom: 16px;
          box-shadow: 0 8px 16px rgba(99, 102, 241, 0.3);
        }

        .login-title {
          font-size: 20px;
          font-weight: 800;
          margin: 0 0 6px 0;
          letter-spacing: 0.02em;
          color: #ffffff;
        }

        .login-subtitle {
          font-size: 13px;
          color: #a1a1aa;
          margin: 0;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-label {
          font-size: 12px;
          font-weight: 600;
          color: #d4d4d8;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 12px;
          color: #71717a;
        }

        .portal-input {
          width: 100%;
          padding: 11px 12px 11px 38px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #ffffff;
          font-size: 13.5px;
          box-sizing: border-box;
          transition: all 0.2s ease;
        }

        .portal-input:focus {
          border-color: #6366f1;
          outline: none;
          background: rgba(255, 255, 255, 0.08);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
        }

        .btn-submit {
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          color: #ffffff;
          border: none;
          padding: 12px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
          margin-top: 10px;
        }

        .btn-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(99, 102, 241, 0.35);
        }

        .btn-submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .error-message {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #ef4444;
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 12.5px;
          line-height: 1.4;
        }

        /* Dashboard view */
        .dashboard-container {
          width: 100%;
          max-width: 900px;
          padding: 40px 20px;
          box-sizing: border-box;
          animation: fadeIn 0.5s ease-out;
          align-self: flex-start;
          min-height: 100vh;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 25px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          padding-bottom: 18px;
        }

        .welcome-title {
          font-size: 22px;
          font-weight: 800;
          color: #ffffff;
          margin: 0 0 4px 0;
        }

        .welcome-sub {
          font-size: 13px;
          color: #a1a1aa;
          margin: 0;
        }

        .btn-logout {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #d4d4d8;
          padding: 8px 14px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease;
        }

        .btn-logout:hover {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.25);
          color: #ef4444;
        }

        .summary-card {
          background: linear-gradient(135deg, #1e1b4b 0%, #11102f 100%);
          border: 1px solid rgba(99, 102, 241, 0.15);
          border-radius: 12px;
          padding: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 25px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        }

        .summary-left {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .summary-label {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          color: #a5b4fc;
          letter-spacing: 0.05em;
        }

        .summary-value {
          font-size: 32px;
          font-weight: 900;
          color: #ffffff;
          letter-spacing: -0.02em;
        }

        .summary-sub {
          font-size: 12px;
          color: #818cf8;
        }

        .balance-alert {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.2);
          color: #f59e0b;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
        }

        .balance-settled {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: #10b981;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
        }

        /* Statement Grid List */
        .history-card {
          background: rgba(24, 24, 27, 0.75);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.25);
        }

        .card-title {
          font-size: 16px;
          font-weight: 700;
          margin: 0 0 16px 0;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #ffffff;
        }

        .table-responsive {
          width: 100%;
          overflow-x: auto;
        }

        .portal-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .portal-table th {
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding: 12px 10px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: #a1a1aa;
          letter-spacing: 0.05em;
        }

        .portal-table td {
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding: 12px 10px;
          font-size: 13px;
          color: #e4e4e7;
        }

        .badge-status {
          display: inline-block;
          padding: 3px 8px;
          font-size: 10.5px;
          font-weight: 700;
          border-radius: 99px;
          text-transform: uppercase;
        }

        .status-paid {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
        }

        .status-unpaid {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
        }

        .status-partial {
          background: rgba(99, 102, 241, 0.15);
          color: #818cf8;
        }

        .btn-action-print {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: #ffffff;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.2s ease;
        }

        .btn-action-print:hover {
          background: #6366f1;
          border-color: #6366f1;
          box-shadow: 0 4px 8px rgba(99,102,241,0.25);
        }

        .empty-history {
          padding: 40px 0;
          text-align: center;
          color: #71717a;
          font-size: 13.5px;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Mobile Responsive */
        @media (max-width: 600px) {
          .summary-card {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }
          .dashboard-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }
          .btn-logout {
            align-self: flex-start;
          }
        }
      `}</style>

      {!customer ? (
        /* Login Card View */
        <div className="login-card">
          <div className="login-header">
            <div className="login-logo">
              <BookOpen size={24} />
            </div>
            <h2 className="login-title">Teacher Portal</h2>
            <p className="login-subtitle">Check your statements and outstanding balances</p>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <div className="input-wrapper">
                <Phone size={14} className="input-icon" />
                <input 
                  type="text" 
                  placeholder="e.g. 0771234567" 
                  className="portal-input"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Portal Passcode PIN</label>
              <div className="input-wrapper">
                <Lock size={14} className="input-icon" />
                <input 
                  type="password" 
                  placeholder="PIN code (e.g. 1234)" 
                  className="portal-input"
                  value={passcodeInput}
                  onChange={(e) => setPasscodeInput(e.target.value)}
                  required
                />
              </div>
            </div>

            {loginError && (
              <div className="error-message">
                {loginError}
              </div>
            )}

            <button type="submit" className="btn-submit" disabled={loading}>
              <span>{loading ? "Logging in..." : "Enter Portal"}</span>
              <ArrowRight size={14} />
            </button>
          </form>
        </div>
      ) : showChangePin ? (
        /* Change PIN Card View */
        <div className="login-card">
          <div className="login-header">
            <div className="login-logo">
              <Lock size={24} />
            </div>
            <h2 className="login-title">Change Passcode PIN</h2>
            <p className="login-subtitle">For security, please change your default passcode PIN</p>
          </div>

          <form onSubmit={handleChangePasscode} className="login-form">
            <div className="form-group">
              <label className="form-label">New 4-to-6 Digit PIN</label>
              <div className="input-wrapper">
                <Lock size={14} className="input-icon" />
                <input 
                  type="password" 
                  placeholder="Enter new PIN" 
                  className="portal-input"
                  value={newPasscodeVal}
                  onChange={(e) => setNewPasscodeVal(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirm New PIN</label>
              <div className="input-wrapper">
                <Lock size={14} className="input-icon" />
                <input 
                  type="password" 
                  placeholder="Confirm new PIN" 
                  className="portal-input"
                  value={confirmPasscodeVal}
                  onChange={(e) => setConfirmPasscodeVal(e.target.value)}
                  required
                />
              </div>
            </div>

            {changePinError && (
              <div className="error-message">
                {changePinError}
              </div>
            )}

            <button type="submit" className="btn-submit" disabled={submittingPasscode}>
              <span>{submittingPasscode ? "Saving..." : "Change & Continue"}</span>
              <ArrowRight size={14} />
            </button>
          </form>
        </div>
      ) : (
        /* Logged In Dashboard View */
        <div className="dashboard-container">
          <div className="dashboard-header">
            <div>
              <h1 className="welcome-title">Welcome, {customer.name}</h1>
              <p className="welcome-sub">Teacher Profile Account Statement Summary</p>
            </div>
            
            <button onClick={handleLogout} className="btn-logout">
              <LogOut size={13} />
              <span>Log Out</span>
            </button>
          </div>

          {/* Account Summary Status */}
          <div className="summary-card">
            <div className="summary-left">
              <span className="summary-label">Outstanding Balance</span>
              <span className="summary-value">{formatCurrency(customer.outstanding_balance)}</span>
              <span className="summary-sub">Real-time outstanding account balance</span>
            </div>
            
            {customer.outstanding_balance > 0 ? (
              <div className="balance-alert">
                <AlertTriangle size={15} />
                <span>Pending Settlement</span>
              </div>
            ) : (
              <div className="balance-settled">
                <BookOpen size={15} />
                <span>Account Clear</span>
              </div>
            )}
          </div>

          {/* Orders History Card */}
          <div className="history-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
              <h2 className="card-title" style={{ margin: 0 }}>
                <Receipt size={16} />
                <span>Invoice & Payment History</span>
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ 
                  fontSize: "12px", 
                  color: "#a1a1aa", 
                  background: "rgba(255,255,255,0.05)", 
                  padding: "4px 10px", 
                  borderRadius: "6px", 
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontWeight: "500"
                }}>
                  Showing: {
                    (customer.portal_duration_limit || "2m") === "all" ? "All History" :
                    (customer.portal_duration_limit || "2m") === "1m" ? "Last 1 Month" :
                    (customer.portal_duration_limit || "2m") === "2m" ? "Last 2 Months" : "Last 6 Months"
                  }
                </span>
              </div>
            </div>

            {loadingOrders ? (
              <div style={{ padding: "40px 0", textSelf: "center", display: "flex", justifyContent: "center" }}>
                <div className="spinner" style={{ marginBottom: 0 }}></div>
              </div>
            ) : orders.length === 0 ? (
              <div className="empty-history">
                No billing history found for this account.
              </div>
            ) : getFilteredOrders().length === 0 ? (
              <div className="empty-history">
                No transactions found for the selected period.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Invoice No</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Total</th>
                      <th style={{ textAlign: "right" }}>Paid</th>
                      <th style={{ textAlign: "right" }}>Balance</th>
                      <th style={{ textAlign: "center" }}>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredOrders().map((o) => (
                      <tr key={o.id}>
                        <td>{new Date(o.created_at).toLocaleDateString()}</td>
                        <td style={{ fontWeight: "700" }}>{o.order_number}</td>
                        <td>
                          <span className={`badge-status ${getStatusClass(o.status)}`}>
                            {getStatusLabel(o.status)}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: "700" }}>{formatCurrency(o.total_amount)}</td>
                        <td style={{ textAlign: "right", color: "#10b981" }}>{formatCurrency(o.paid_amount)}</td>
                        <td style={{ textAlign: "right", color: o.balance_amount > 0 ? "#ef4444" : "inherit" }}>
                          {formatCurrency(o.balance_amount)}
                        </td>
                        <td style={{ display: "flex", justifyContent: "center" }}>
                          <button 
                            onClick={() => window.open(`/orders/${o.id}/print`, "_blank")}
                            className="btn-action-print"
                          >
                            <Printer size={12} />
                            <span>Print</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
