"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getNextPaymentNumber } from "@/lib/orderSequence";
import { useAuth } from "@/components/AuthGuard";
import { 
  Search, 
  UserPlus, 
  Calendar, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  DollarSign, 
  Receipt,
  FileText,
  AlertTriangle,
  Plus,
  Printer,
  Lock,
  Trash2,
  Pencil,
  Check,
  X,
  Wallet
} from "lucide-react";

export default function CustomersPage() {
  const { profile } = useAuth();
  const isAuthorized = profile?.role === "owner" || profile?.role === "manager";

  const [customers, setCustomers] = useState([]);
  const [selectedCust, setSelectedCust] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // History states
  const [custOrders, setCustOrders] = useState([]);
  const [custQuotes, setCustQuotes] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // New Customer Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [passcode, setPasscode] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Passcode Edit States
  const [isEditingPasscode, setIsEditingPasscode] = useState(false);
  const [newPasscode, setNewPasscode] = useState("");

  // Profile Edit States
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Advance Payment States
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceNote, setAdvanceNote] = useState("");
  const [savingAdvance, setSavingAdvance] = useState(false);

  // Outstanding Payment States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Order/Quote details popup states
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [selectedQuoteDetails, setSelectedQuoteDetails] = useState(null);
  const [showOrderDetailsModal, setShowOrderDetailsModal] = useState(false);
  const [showQuoteDetailsModal, setShowQuoteDetailsModal] = useState(false);

  // Print Statement Modal States
  const [showPrintStatementModal, setShowPrintStatementModal] = useState(false);
  const [printStartDate, setPrintStartDate] = useState("");
  const [printEndDate, setPrintEndDate] = useState("");
  const [printQuickRange, setPrintQuickRange] = useState("all");

  const handleApplyPrintPreset = (rangeType) => {
    setPrintQuickRange(rangeType);
    const today = new Date();
    const endStr = today.toISOString().split("T")[0];

    if (rangeType === "all") {
      setPrintStartDate("");
      setPrintEndDate("");
    } else if (rangeType === "today") {
      setPrintStartDate(endStr);
      setPrintEndDate(endStr);
    } else if (rangeType === "this_month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setPrintStartDate(firstDay.toISOString().split("T")[0]);
      setPrintEndDate(endStr);
    } else if (rangeType === "last_month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      setPrintStartDate(firstDay.toISOString().split("T")[0]);
      setPrintEndDate(lastDay.toISOString().split("T")[0]);
    } else if (rangeType === "last_30") {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      setPrintStartDate(d.toISOString().split("T")[0]);
      setPrintEndDate(endStr);
    } else if (rangeType === "this_year") {
      setPrintStartDate(`${today.getFullYear()}-01-01`);
      setPrintEndDate(endStr);
    }
  };

  const handleLaunchPrintStatement = () => {
    if (!selectedCust) return;
    let url = `/customers/${selectedCust.id}/print`;
    const params = new URLSearchParams();
    if (printStartDate) params.set("start", printStartDate);
    if (printEndDate) params.set("end", printEndDate);
    const query = params.toString();
    if (query) url += `?${query}`;
    window.open(url, "_blank");
    setShowPrintStatementModal(false);
  };

  const handleOpenOrderDetails = (order) => {
    setSelectedOrderDetails(order);
    setShowOrderDetailsModal(true);
  };

  const handleOpenQuoteDetails = (quote) => {
    setSelectedQuoteDetails(quote);
    setShowQuoteDetailsModal(true);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (selectedCust) {
      fetchCustomerHistory(selectedCust.id);
    }
  }, [selectedCust]);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setCustomers(data || []);
      
      // Auto-select first customer if none is selected
      if (data && data.length > 0 && !selectedCust) {
        setSelectedCust(data[0]);
      }
    } catch (err) {
      console.error("Error fetching customers:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerHistory = async (custId) => {
    setLoadingHistory(true);
    try {
      // 1. Fetch Orders
      const { data: orders, error: oError } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_id", custId)
        .order("created_at", { ascending: false });

      if (oError) throw oError;
      setCustOrders(orders || []);

      // 2. Fetch Quotations
      const { data: quotes, error: qError } = await supabase
        .from("quotations")
        .select("*")
        .eq("customer_id", custId)
        .order("created_at", { ascending: false });

      if (qError) throw qError;
      setCustQuotes(quotes || []);

    } catch (err) {
      console.error("Error loading customer history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setErrorMsg("Name and Phone number are required fields.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const finalPasscode = passcode.trim() || "1234";

      const { data, error } = await supabase
        .from("customers")
        .insert({
          name: name.trim(),
          phone: phone.replace(/[\s-()]/g, ""),
          email: email.trim() || null,
          address: address.trim() || null,
          outstanding_balance: 0,
          portal_passcode: finalPasscode,
          portal_duration_limit: "2m",
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Sync customer registration to Google Sheets
      try {
        fetch("/api/sync-sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_number: "REGISTRATION",
            customer_name: data.name,
            customer_phone: data.phone,
            total_amount: 0,
            paid_amount: 0,
            balance_amount: 0,
            items: [],
            date: new Date().toISOString(),
          }),
        });
      } catch (syncErr) {
        console.error("Sheets registration sync failed:", syncErr);
      }

      setSuccessMsg("Client profile logged successfully!");
      setName("");
      setPhone("");
      setEmail("");
      setAddress("");
      setPasscode("");
      setShowAddForm(false);
      
      // Refetch and select the newly created customer
      const { data: updatedList } = await supabase
        .from("customers")
        .select("*")
        .order("name", { ascending: true });
      
      setCustomers(updatedList || []);
      
      const newCustObj = updatedList.find(c => c.id === data.id);
      if (newCustObj) setSelectedCust(newCustObj);
      
    } catch (err) {
      setErrorMsg(err.message || "Failed to create client profile.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePasscode = async () => {
    if (!newPasscode.trim()) {
      setErrorMsg("Passcode PIN cannot be empty.");
      return;
    }
    try {
      const { error } = await supabase
        .from("customers")
        .update({ portal_passcode: newPasscode.trim() })
        .eq("id", selectedCust.id);

      if (error) throw error;

      // Update state locally
      const updatedCust = { ...selectedCust, portal_passcode: newPasscode.trim() };
      setSelectedCust(updatedCust);
      setCustomers(prev => prev.map(c => c.id === selectedCust.id ? updatedCust : c));
      setIsEditingPasscode(false);
      setSuccessMsg("Teacher portal passcode updated successfully!");
    } catch (err) {
      setErrorMsg(err.message || "Failed to update passcode PIN.");
    }
  };

  const handleResetPasscode = async () => {
    if (!selectedCust) return;
    if (!window.confirm(`Are you sure you want to reset ${selectedCust.name}'s passcode back to the default '1234'?`)) {
      return;
    }
    try {
      const { error } = await supabase
        .from("customers")
        .update({ portal_passcode: "1234" })
        .eq("id", selectedCust.id);

      if (error) throw error;

      // Update state locally
      const updatedCust = { ...selectedCust, portal_passcode: "1234" };
      setSelectedCust(updatedCust);
      setCustomers(prev => prev.map(c => c.id === selectedCust.id ? updatedCust : c));
      setSuccessMsg(`Passcode reset to '1234' for ${selectedCust.name}!`);
    } catch (err) {
      setErrorMsg(err.message || "Failed to reset passcode.");
    }
  };

  const handleStartEditProfile = () => {
    setEditName(selectedCust.name);
    setEditPhone(selectedCust.phone);
    setEditEmail(selectedCust.email || "");
    setEditAddress(selectedCust.address || "");
    setIsEditingProfile(true);
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleSaveProfile = async () => {
    if (!editName.trim() || !editPhone.trim()) {
      setErrorMsg("Name and phone number are required.");
      return;
    }
    setSavingProfile(true);
    setErrorMsg("");
    try {
      const cleanedEditPhone = editPhone.replace(/[\s-()]/g, "");
      const { error } = await supabase
        .from("customers")
        .update({
          name: editName.trim(),
          phone: cleanedEditPhone,
          email: editEmail.trim() || null,
          address: editAddress.trim() || null,
        })
        .eq("id", selectedCust.id);

      if (error) throw error;

      const updatedCust = {
        ...selectedCust,
        name: editName.trim(),
        phone: cleanedEditPhone,
        email: editEmail.trim() || null,
        address: editAddress.trim() || null,
      };
      setSelectedCust(updatedCust);
      setCustomers(prev => prev.map(c => c.id === selectedCust.id ? updatedCust : c));
      setIsEditingProfile(false);
      setSuccessMsg("Client profile updated successfully!");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
      setErrorMsg(err.message || "Failed to update client profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRecordAdvance = async () => {
    const amount = parseFloat(advanceAmount);
    if (!amount || amount <= 0) {
      setErrorMsg("Please enter a valid advance amount greater than zero.");
      return;
    }
    setSavingAdvance(true);
    setErrorMsg("");
    try {
      const year = new Date().getFullYear();

      // 1. Generate unique PAY- number
      const { paymentNum } = await getNextPaymentNumber(supabase, year);

      // 2. Insert Advance Payment order (total = 0, paid = amount)
      const { data: paymentOrder, error: oError } = await supabase
        .from("orders")
        .insert({
          order_number: paymentNum,
          customer_id: selectedCust.id,
          total_amount: 0,
          paid_amount: amount,
          balance_amount: 0,
          payment_method: "cash",
          status: "paid",
          items: [{ name: advanceNote.trim() || "Advance Payment / Account Credit", qty: 1, price: 0, total: 0 }],
          created_by: profile?.username || "Unknown",
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (oError) throw oError;

      // 3. Recalculate customer's outstanding balance: (Sum of Pending Sales) - (Sum of PAY- Receipts)
      const { data: freshOrders, error: freshErr } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_id", selectedCust.id);

      if (freshErr) throw freshErr;

      const nonVoided = (freshOrders || []).filter(o => o.status !== "voided");
      const totalPendingBills = nonVoided
        .filter(o => !o.order_number?.startsWith("PAY-") && (o.status === "pending" || o.payment_method === "pending"))
        .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      const totalPayments = nonVoided
        .filter(o => o.order_number?.startsWith("PAY-") || Number(o.total_amount || 0) === 0)
        .reduce((sum, o) => sum + Number(o.paid_amount || 0), 0);
      const newBalance = totalPendingBills - totalPayments;

      const { error: cError } = await supabase
        .from("customers")
        .update({ outstanding_balance: newBalance })
        .eq("id", selectedCust.id);
      if (cError) throw cError;

      // 4. Sheets Sync
      try {
        await fetch("/api/sync-sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...paymentOrder,
            customer_name: selectedCust.name,
            customer_phone: selectedCust.phone
          })
        });
      } catch (sheetErr) {
        console.error("Sheets sync failed:", sheetErr);
      }

      // 5. Update local state
      const updatedCust = { ...selectedCust, outstanding_balance: newBalance };
      setSelectedCust(updatedCust);
      setCustomers(prev => prev.map(c => c.id === selectedCust.id ? updatedCust : c));
      setCustOrders(nonVoided.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));

      setShowAdvanceModal(false);
      setAdvanceAmount("");
      setAdvanceNote("");
      setSuccessMsg(`Advance payment of ${formatCurrency(amount)} recorded successfully!`);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to record advance payment.");
    } finally {
      setSavingAdvance(false);
    }
  };

  const handleRecordPayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      setErrorMsg("Please enter a valid payment amount greater than zero.");
      return;
    }

    setSavingPayment(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const year = new Date().getFullYear();

      // 1. Generate unique order/payment receipt number based on max existing PAY- number
      const { paymentNum } = await getNextPaymentNumber(supabase, year);

      // 2. Insert Payment Transaction in Orders table as a dedicated Payment Order
      // Sales bills remain untouched (pending stays pending forever)
      const { data: paymentOrder, error: oError } = await supabase
        .from("orders")
        .insert({
          order_number: paymentNum,
          customer_id: selectedCust.id,
          total_amount: 0,
          paid_amount: amount,
          balance_amount: 0,
          payment_method: "cash",
          status: "paid",
          items: [{ name: paymentNote.trim() || "Payment Order (Balance Settlement)", qty: 1, price: 0, total: 0 }],
          created_by: profile?.username || "Unknown",
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (oError) throw oError;

      // 3. Recalculate customer's outstanding balance: (Sum of Pending Sales) - (Sum of PAY- Receipts)
      const { data: freshOrders, error: freshErr } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_id", selectedCust.id);

      if (freshErr) throw freshErr;

      const nonVoided = (freshOrders || []).filter(o => o.status !== "voided");
      const totalPendingBills = nonVoided
        .filter(o => !o.order_number?.startsWith("PAY-") && (o.status === "pending" || o.payment_method === "pending"))
        .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      const totalPayments = nonVoided
        .filter(o => o.order_number?.startsWith("PAY-") || Number(o.total_amount || 0) === 0)
        .reduce((sum, o) => sum + Number(o.paid_amount || 0), 0);
      const newBalance = totalPendingBills - totalPayments;

      const { error: cError } = await supabase
        .from("customers")
        .update({ outstanding_balance: newBalance })
        .eq("id", selectedCust.id);
      if (cError) throw cError;

      // 4. Sheets Sync for the Payment receipt itself
      try {
        await fetch("/api/sync-sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...paymentOrder,
            customer_name: selectedCust.name,
            customer_phone: selectedCust.phone
          })
        });
      } catch (sheetErr) {
        console.error("Sheets sync failed:", sheetErr);
      }

      // 5. Update local state
      const updatedCust = { ...selectedCust, outstanding_balance: newBalance };
      setSelectedCust(updatedCust);
      setCustomers(prev => prev.map(c => c.id === selectedCust.id ? updatedCust : c));
      setCustOrders(nonVoided.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));

      setShowPaymentModal(false);
      setPaymentAmount("");
      setPaymentNote("");
      setSuccessMsg(`Payment of ${formatCurrency(amount)} recorded successfully! Outstanding balance updated.`);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to record payment.");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleUpdateDurationLimit = async (duration) => {
    if (!selectedCust) return;
    try {
      const { error } = await supabase
        .from("customers")
        .update({ portal_duration_limit: duration })
        .eq("id", selectedCust.id);

      if (error) throw error;

      // Update state locally
      const updatedCust = { ...selectedCust, portal_duration_limit: duration };
      setSelectedCust(updatedCust);
      setCustomers(prev => prev.map(c => c.id === selectedCust.id ? updatedCust : c));
      setSuccessMsg(`Portal statement duration updated to ${duration === "all" ? "All Time" : duration === "1m" ? "1 Month" : duration === "2m" ? "2 Months" : "6 Months"}!`);
    } catch (err) {
      setErrorMsg(err.message || "Failed to update statement duration limit.");
    }
  };

  const handleDeleteCustomer = async () => {
    if (!selectedCust) return;
    
    // Check if they have outstanding balance
    if (selectedCust.outstanding_balance > 0) {
      const confirm1 = window.confirm(
        `⚠️ WARNING: ${selectedCust.name} has an outstanding balance of ${formatCurrency(selectedCust.outstanding_balance)}.\n` +
        `If you delete this customer, you will lose track of this debt.\n\n` +
        `Are you sure you want to delete this customer?`
      );
      if (!confirm1) return;
    } else {
      const confirm2 = window.confirm(`Are you sure you want to delete customer "${selectedCust.name}"?`);
      if (!confirm2) return;
    }

    const confirmKeyword = window.prompt(`To confirm deletion, type the customer's name exactly ("${selectedCust.name}"):`);
    if (confirmKeyword !== selectedCust.name) {
      alert("Deletion cancelled. Name verification did not match.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", selectedCust.id);

      if (error) throw error;

      setSuccessMsg(`Customer "${selectedCust.name}" deleted successfully.`);
      
      // Refresh customer list
      const { data: updatedList } = await supabase
        .from("customers")
        .select("*")
        .order("name", { ascending: true });
      
      setCustomers(updatedList || []);
      
      // Select the first customer in the list if available, otherwise null
      if (updatedList && updatedList.length > 0) {
        setSelectedCust(updatedList[0]);
      } else {
        setSelectedCust(null);
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to delete customer.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      minimumFractionDigits: 0
    }).format(val);
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case "paid": return "badge-paid";
      case "pending": return "badge-pending";
      case "partially_paid": return "badge-partial";
      default: return "";
    }
  };

  // Search filter
  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.phone.includes(searchQuery)
  );

  // Deal statistics aggregates for selected customer
  const activeCustOrders = custOrders.filter(o => o.status !== "voided");
  const salesOrders = activeCustOrders.filter(o => !o.order_number?.startsWith("PAY-") && Number(o.total_amount || 0) > 0);
  const payOrders = activeCustOrders.filter(o => o.order_number?.startsWith("PAY-") || Number(o.total_amount || 0) === 0);

  const totalDealVolume = salesOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const totalOutstanding = selectedCust ? Number(selectedCust.outstanding_balance || 0) : 0;
  const totalCollected = salesOrders.filter(o => o.status === "paid" && o.payment_method !== "pending").reduce((sum, o) => sum + Number(o.total_amount || 0), 0) + payOrders.reduce((sum, o) => sum + Number(o.paid_amount || 0), 0);
  const totalOrdersCount = activeCustOrders.length;
  const totalQuotesCount = custQuotes.length;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Client Registry</h1>
          <p style={styles.subtitle}>Manage customer profiles, purchase history, and outstanding balances</p>
        </div>
        <button 
          onClick={() => { setShowAddForm(!showAddForm); setErrorMsg(""); setSuccessMsg(""); }} 
          className="btn btn-primary"
          style={styles.addBtn}
        >
          {showAddForm ? "Show Registry" : <><UserPlus size={16} /><span>Register Customer</span></>}
        </button>
      </div>

      {successMsg && (
        <div style={styles.successBanner} className="animate-fade-in">
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div style={styles.errorBanner} className="animate-fade-in">
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div style={styles.loaderContainer}>
          <div style={styles.spinner}></div>
        </div>
      ) : showAddForm ? (
        /* Create Customer Form Page */
        <div className="glass-panel animate-fade-in" style={styles.formCard}>
          <h2 style={styles.formTitle}>Register Client Profile</h2>
          <form onSubmit={handleAddCustomer} style={styles.form}>
            <div className="form-row" style={styles.formRow}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Phone Number *</label>
                <input
                  type="text"
                  placeholder="e.g. 0771234567"
                  className="input-field"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row" style={styles.formRow}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. john@example.com"
                  className="input-field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Billing Address</label>
                <input
                  type="text"
                  placeholder="e.g. 123 Main St, Colombo"
                  className="input-field"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row" style={styles.formRow}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Portal Passcode PIN (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 1234 (Leave blank to auto-generate a secure PIN)"
                  className="input-field"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                />
              </div>
              <div style={styles.inputGroup}>
                {/* empty spacer field for layout alignment */}
                <div style={{ flex: 1 }}></div>
              </div>
            </div>

            <div style={styles.formActions}>
              <button 
                type="button" 
                onClick={() => setShowAddForm(false)} 
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting ? "Registering..." : "Save Client Profile"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Registry View split screen */
        <div className="layout-grid" style={styles.layoutGrid}>
          {/* Left panel: List & Search */}
          <div style={styles.leftPane}>
            <div className="glass-panel" style={styles.searchCard}>
              <div style={styles.searchGroup}>
                <Search size={16} style={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Filter name or phone..."
                  className="input-field"
                  style={styles.searchInput}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="glass-panel" style={styles.listCard}>
              {filteredCustomers.length === 0 ? (
                <div style={styles.emptyList}>No customers match search.</div>
              ) : (
                <div style={styles.custItemsList}>
                  {filteredCustomers.map(cust => (
                    <div 
                      key={cust.id} 
                      onClick={() => { setSelectedCust(cust); setErrorMsg(""); setSuccessMsg(""); }}
                      style={{
                        ...styles.custRow,
                        ...(selectedCust?.id === cust.id ? styles.custRowActive : {})
                      }}
                    >
                      <div style={styles.custRowHeader}>
                        <span style={styles.custRowName}>{cust.name}</span>
                        {cust.outstanding_balance > 0 && (
                          <span style={styles.custRowBalanceBadge}>{cust.outstanding_balance} LKR</span>
                        )}
                        {cust.outstanding_balance < 0 && (
                          <span style={{ ...styles.custRowBalanceBadge, background: "rgba(34,197,94,0.15)", color: "var(--accent-green)", borderColor: "rgba(34,197,94,0.3)" }}>💚 {Math.abs(cust.outstanding_balance)} CR</span>
                        )}
                      </div>
                      <div style={styles.custRowPhone}>{cust.phone}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Profile Details & History */}
          <div className="glass-panel" style={styles.rightPane}>
            {selectedCust ? (
              <div style={styles.detailsContainer} className="animate-fade-in">
                {/* Profile Header */}
                <div style={styles.detailsHeader}>
                  <div style={styles.avatarSection}>
                    <div style={styles.avatarBig}>
                      <User size={28} />
                    </div>
                    <div>
                      <h2 style={styles.detailsTitle}>{selectedCust.name}</h2>
                      <div style={styles.detailsSub}>
                        <Calendar size={12} />
                        <span>Registered: {new Date(selectedCust.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      onClick={() => {
                        handleApplyPrintPreset("all");
                        setShowPrintStatementModal(true);
                      }}
                      className="btn btn-secondary"
                      style={{ height: "36px", padding: "0 14px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
                    >
                      <Printer size={14} />
                      <span>Print Statement</span>
                    </button>

                    <button
                      onClick={handleStartEditProfile}
                      className="btn btn-secondary"
                      style={{ height: "36px", padding: "0 14px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", borderColor: "rgba(99,102,241,0.4)", color: "var(--primary)", background: "rgba(99,102,241,0.06)" }}
                    >
                      <Pencil size={14} />
                      <span>Edit Profile</span>
                    </button>

                    <button
                      onClick={() => { setShowAdvanceModal(!showAdvanceModal); setAdvanceAmount(""); setAdvanceNote(""); setErrorMsg(""); }}
                      className="btn btn-secondary"
                      style={{ height: "36px", padding: "0 14px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", borderColor: "rgba(34,197,94,0.4)", color: "var(--accent-green)", background: "rgba(34,197,94,0.06)" }}
                    >
                      <Wallet size={14} />
                      <span>Advance</span>
                    </button>

                    <button
                      onClick={() => { setShowPaymentModal(!showPaymentModal); setPaymentAmount(""); setPaymentNote(""); setErrorMsg(""); }}
                      className="btn btn-secondary"
                      style={{ height: "36px", padding: "0 14px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", borderColor: "rgba(249,115,22,0.4)", color: "var(--accent-orange)", background: "rgba(249,115,22,0.06)" }}
                    >
                      <Check size={14} />
                      <span>Payments</span>
                    </button>

                    {isAuthorized && (
                      <button
                        onClick={handleDeleteCustomer}
                        className="btn btn-secondary"
                        style={{ 
                          height: "36px", 
                          padding: "0 14px", 
                          fontSize: "12px", 
                          display: "flex", 
                          alignItems: "center", 
                          gap: "6px", 
                          borderColor: "#ef4444", 
                          color: "#ef4444",
                          background: "rgba(239, 68, 68, 0.05)"
                        }}
                        disabled={submitting}
                        title="Permanently Delete Customer"
                      >
                        <Trash2 size={14} />
                        <span>Delete Profile</span>
                      </button>
                    )}
                  </div>
                </div>
                  {/* Outstanding Warning / Credit Banner */}
                  {selectedCust.outstanding_balance > 0 && (
                    <div style={styles.alertCard}>
                      <AlertTriangle size={16} />
                      <div>Outstanding balance of {formatCurrency(selectedCust.outstanding_balance)} pending collection.</div>
                    </div>
                  )}
                  {selectedCust.outstanding_balance < 0 && (
                    <div style={{ ...styles.alertCard, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", color: "var(--accent-green)" }}>
                      <span style={{ fontSize: "16px" }}>💚</span>
                      <div>This customer has an <strong>account credit of {formatCurrency(Math.abs(selectedCust.outstanding_balance))}</strong> — will be offset against their next bill.</div>
                    </div>
                  )}

                {/* Advance Payment Modal */}
                {showAdvanceModal && (
                  <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "10px", padding: "16px", marginBottom: "12px" }} className="animate-fade-in">
                    <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--accent-green)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Wallet size={14} /> Record Advance / Credit Payment
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
                      This records money paid by the customer in advance — no invoice needed. The amount will be saved as account credit and automatically offset against future bills.
                    </div>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div style={{ flex: 1, minWidth: "120px" }}>
                        <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>Amount (LKR) *</label>
                        <input
                          type="number"
                          className="input-field"
                          placeholder="e.g. 2000"
                          min={1}
                          value={advanceAmount}
                          onChange={(e) => setAdvanceAmount(e.target.value)}
                          style={{ width: "100%" }}
                          autoFocus
                        />
                      </div>
                      <div style={{ flex: 2, minWidth: "160px" }}>
                        <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>Note (optional)</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="e.g. Advance for next order"
                          value={advanceNote}
                          onChange={(e) => setAdvanceNote(e.target.value)}
                          style={{ width: "100%" }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={handleRecordAdvance}
                          disabled={savingAdvance || !advanceAmount}
                          className="btn btn-primary"
                          style={{ padding: "8px 16px", fontSize: "12px", height: "auto", display: "flex", alignItems: "center", gap: "4px", background: "var(--accent-green)", borderColor: "var(--accent-green)" }}
                        >
                          <Check size={13} />{savingAdvance ? "Saving..." : "Save Credit"}
                        </button>
                        <button
                          onClick={() => setShowAdvanceModal(false)}
                          className="btn btn-secondary"
                          style={{ padding: "8px 12px", fontSize: "12px", height: "auto" }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Outstanding Payment Modal */}
                {showPaymentModal && (
                  <div style={{ background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.25)", borderRadius: "10px", padding: "16px", marginBottom: "12px" }} className="animate-fade-in">
                    <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--accent-orange)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Check size={14} /> Record Outstanding Balance Payment
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
                      This records a payment made by the customer to pay off or settle their pending outstanding balance debt. It will immediately reduce their debt and record today's cash collections.
                    </div>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div style={{ flex: 1, minWidth: "120px" }}>
                        <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>Payment Amount (LKR) *</label>
                        <input
                          type="number"
                          className="input-field"
                          placeholder={`Max ${selectedCust.outstanding_balance}`}
                          min={1}
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          style={{ width: "100%" }}
                          autoFocus
                        />
                      </div>
                      <div style={{ flex: 2, minWidth: "160px" }}>
                        <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>Note (optional)</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="e.g. Paid off January bill"
                          value={paymentNote}
                          onChange={(e) => setPaymentNote(e.target.value)}
                          style={{ width: "100%" }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={handleRecordPayment}
                          disabled={savingPayment || !paymentAmount}
                          className="btn btn-primary"
                          style={{ padding: "8px 16px", fontSize: "12px", height: "auto", display: "flex", alignItems: "center", gap: "4px", background: "var(--accent-orange)", borderColor: "var(--accent-orange)" }}
                        >
                          <Check size={13} />{savingPayment ? "Saving..." : "Record Payment"}
                        </button>
                        <button
                          onClick={() => setShowPaymentModal(false)}
                          className="btn btn-secondary"
                          style={{ padding: "8px 12px", fontSize: "12px", height: "auto" }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lifetime Deal Statistics */}
                <div style={styles.statsGrid}>
                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>Total Deal Volume</span>
                    <span style={styles.statValue}>{formatCurrency(totalDealVolume)}</span>
                    <span style={styles.statSub}>Lifetime orders value</span>
                  </div>
                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>Total Collected</span>
                    <span style={{ ...styles.statValue, color: "var(--accent-green)" }}>{formatCurrency(totalCollected)}</span>
                    <span style={styles.statSub}>Total paid to date</span>
                  </div>
                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>{totalOutstanding < 0 ? "Account Credit" : "Outstanding Balance"}</span>
                    <span style={{ ...styles.statValue, color: totalOutstanding < 0 ? "var(--accent-green)" : totalOutstanding > 0 ? "var(--accent-orange)" : "var(--text-main)" }}>
                      {totalOutstanding < 0 ? `${formatCurrency(Math.abs(totalOutstanding))} CR` : formatCurrency(totalOutstanding)}
                    </span>
                    <span style={styles.statSub}>{totalOutstanding < 0 ? "Credit on account" : "Pending collection"}</span>
                  </div>
                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>Transactions</span>
                    <span style={styles.statValue}>{totalOrdersCount} Orders</span>
                    <span style={styles.statSub}>{totalQuotesCount} Quotations logged</span>
                  </div>
                </div>

                {/* Contact & Billing Data */}
                <div style={styles.sectionCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <h3 style={{ ...styles.sectionTitle, marginBottom: 0 }}>Contact &amp; Billing Data</h3>
                    {!isEditingProfile ? (
                      <button
                        onClick={handleStartEditProfile}
                        style={{ background: "none", border: "none", color: "var(--primary)", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px" }}
                      >
                        <Pencil size={12} /> Edit
                      </button>
                    ) : (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={handleSaveProfile}
                          disabled={savingProfile}
                          className="btn btn-primary"
                          style={{ padding: "4px 12px", fontSize: "12px", height: "auto", display: "flex", alignItems: "center", gap: "4px" }}
                        >
                          <Check size={12} />{savingProfile ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => setIsEditingProfile(false)}
                          className="btn btn-secondary"
                          style={{ padding: "4px 10px", fontSize: "12px", height: "auto", display: "flex", alignItems: "center", gap: "4px" }}
                        >
                          <X size={12} /> Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditingProfile ? (
                    /* Edit Mode */
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                          <label style={{ ...styles.infoLabel, marginBottom: "4px", display: "block" }}>Full Name *</label>
                          <input
                            type="text"
                            className="input-field"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Full Name"
                            style={{ width: "100%" }}
                          />
                        </div>
                        <div>
                          <label style={{ ...styles.infoLabel, marginBottom: "4px", display: "block" }}>Phone Number *</label>
                          <input
                            type="text"
                            className="input-field"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            placeholder="e.g. 0771234567"
                            style={{ width: "100%" }}
                          />
                        </div>
                        <div>
                          <label style={{ ...styles.infoLabel, marginBottom: "4px", display: "block" }}>Email Address</label>
                          <input
                            type="email"
                            className="input-field"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            placeholder="e.g. john@example.com"
                            style={{ width: "100%" }}
                          />
                        </div>
                        <div>
                          <label style={{ ...styles.infoLabel, marginBottom: "4px", display: "block" }}>Billing Address</label>
                          <input
                            type="text"
                            className="input-field"
                            value={editAddress}
                            onChange={(e) => setEditAddress(e.target.value)}
                            placeholder="e.g. 123 Main St, Colombo"
                            style={{ width: "100%" }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* View Mode */
                    <div style={styles.infoGrid}>
                      <div style={styles.infoItem}>
                        <Phone size={14} style={styles.infoIcon} />
                        <div>
                          <div style={styles.infoLabel}>Phone Number</div>
                          <div style={styles.infoValue}>{selectedCust.phone}</div>
                        </div>
                      </div>

                      <div style={styles.infoItem}>
                        <Mail size={14} style={styles.infoIcon} />
                        <div>
                          <div style={styles.infoLabel}>Email Address</div>
                          <div style={styles.infoValue}>{selectedCust.email || "No Email Logged"}</div>
                        </div>
                      </div>

                      <div style={styles.infoItem}>
                        <MapPin size={14} style={styles.infoIcon} />
                        <div>
                          <div style={styles.infoLabel}>Location Address</div>
                          <div style={styles.infoValue}>{selectedCust.address || "No Address Logged"}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Portal Access Credentials */}
                <div style={styles.sectionCard}>
                  <h3 style={styles.sectionTitle}>Portal Access Credentials</h3>
                  <div style={styles.infoGrid}>
                    <div style={styles.infoItem}>
                      <Lock size={14} style={styles.infoIcon} />
                      <div style={{ flex: 1 }}>
                        <div style={styles.infoLabel}>Teacher Portal Passcode (PIN)</div>
                        {isEditingPasscode ? (
                          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                            <input
                              type="text"
                              value={newPasscode}
                              onChange={(e) => setNewPasscode(e.target.value)}
                              placeholder="e.g. 1234"
                              style={{ 
                                padding: "4px 8px", 
                                fontSize: "12px", 
                                width: "120px", 
                                border: "1px solid var(--border)", 
                                borderRadius: "4px", 
                                background: "rgba(255,255,255,0.05)", 
                                color: "var(--text-main)" 
                              }}
                            />
                            <button 
                              onClick={handleSavePasscode} 
                              className="btn btn-primary" 
                              style={{ padding: "4px 8px", fontSize: "11px", height: "auto" }}
                            >
                              Save
                            </button>
                            <button 
                              onClick={() => setIsEditingPasscode(false)} 
                              className="btn btn-secondary" 
                              style={{ padding: "4px 8px", fontSize: "11px", height: "auto" }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{ ...styles.infoValue, fontWeight: "bold", letterSpacing: "1px", color: "var(--accent-orange)" }}>
                              {selectedCust.portal_passcode || "No Passcode Set (1234)"}
                            </span>
                            <button 
                              onClick={() => { setIsEditingPasscode(true); setNewPasscode(selectedCust.portal_passcode || "1234"); }}
                              style={{ background: "none", border: "none", color: "var(--primary)", fontSize: "11px", cursor: "pointer", padding: 0 }}
                            >
                              Change PIN
                            </button>
                            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "11px" }}>|</span>
                            <button 
                              onClick={handleResetPasscode}
                              style={{ background: "none", border: "none", color: "#ef4444", fontSize: "11px", cursor: "pointer", padding: 0 }}
                            >
                              Reset PIN
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ ...styles.infoItem, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "12px", marginTop: "4px" }}>
                      <Calendar size={14} style={styles.infoIcon} />
                      <div style={{ flex: 1 }}>
                        <div style={styles.infoLabel}>Portal Statement Duration Limit</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                          <select
                            value={selectedCust.portal_duration_limit || "2m"}
                            onChange={(e) => handleUpdateDurationLimit(e.target.value)}
                            style={{
                              padding: "4px 8px",
                              fontSize: "12px",
                              borderRadius: "4px",
                              border: "1px solid var(--border)",
                              background: "rgba(255,255,255,0.05)",
                              color: "var(--text-main)",
                              cursor: "pointer",
                              outline: "none"
                            }}
                          >
                            <option value="1m">Last 1 Month</option>
                            <option value="2m">Last 2 Months (Default)</option>
                            <option value="6m">Last 6 Months</option>
                            <option value="all">All Time</option>
                          </select>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            Limit of statements shown in portal.
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* History Tabs (Orders and Quotations) */}
                <div style={styles.historySection}>
                  <h3 style={styles.sectionTitle}>Billing History</h3>
                  
                  {loadingHistory ? (
                    <div style={styles.smallLoader}>
                      <div style={styles.spinner}></div>
                    </div>
                  ) : (
                    <div style={styles.historyGrid}>
                      {/* Past Orders */}
                      <div style={styles.historyCard}>
                        <div style={styles.historyCardHeader}>
                          <Receipt size={16} />
                          <span>Orders & Invoices ({custOrders.length})</span>
                        </div>
                        <div style={styles.historyList}>
                          {custOrders.length === 0 ? (
                            <div style={styles.emptyHistoryMsg}>No invoices found.</div>
                          ) : (
                            custOrders.map(order => (
                              <div key={order.id} style={styles.historyRow}>
                                <div>
                                  <div 
                                    onClick={() => handleOpenOrderDetails(order)}
                                    style={{ 
                                      ...styles.historyRowTitle, 
                                      cursor: "pointer", 
                                      color: "var(--primary)",
                                      textDecoration: "underline" 
                                    }}
                                  >
                                    {order.order_number}
                                  </div>
                                  <div style={styles.historyRowDate}>
                                    {new Date(order.created_at).toLocaleDateString()}
                                  </div>
                                </div>
                                <div style={styles.historyRowRight}>
                                  <div style={styles.historyRowAmount}>{formatCurrency(order.total_amount)}</div>
                                  <span className={`badge ${getStatusBadgeClass(order.status)}`} style={{ transform: "scale(0.85)", transformOrigin: "right" }}>
                                    {order.status?.replace("_", " ")}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Past Quotations */}
                      <div style={styles.historyCard}>
                        <div style={styles.historyCardHeader}>
                          <FileText size={16} />
                          <span>Price Quotations ({custQuotes.length})</span>
                        </div>
                        <div style={styles.historyList}>
                          {custQuotes.length === 0 ? (
                            <div style={styles.emptyHistoryMsg}>No quotations found.</div>
                          ) : (
                            custQuotes.map(quote => (
                              <div key={quote.id} style={styles.historyRow}>
                                <div>
                                  <div 
                                    onClick={() => handleOpenQuoteDetails(quote)}
                                    style={{ 
                                      ...styles.historyRowTitle, 
                                      cursor: "pointer", 
                                      color: "var(--primary)",
                                      textDecoration: "underline" 
                                    }}
                                  >
                                    {quote.quotation_number}
                                  </div>
                                  <div style={styles.historyRowDate}>
                                    {new Date(quote.created_at).toLocaleDateString()}
                                  </div>
                                </div>
                                <div style={styles.historyRowRight}>
                                  <div style={styles.historyRowAmount}>{formatCurrency(quote.total_amount)}</div>
                                  <span className={`badge ${quote.converted_to_order ? "badge-paid" : "badge-pending"}`} style={{ transform: "scale(0.85)", transformOrigin: "right" }}>
                                    {quote.converted_to_order ? "Converted" : "Active"}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={styles.placeholderContainer}>
                <User size={48} style={styles.placeholderIcon} />
                <h3 style={styles.placeholderTitle}>Select Client Profile</h3>
                <p style={styles.placeholderDesc}>Click any customer name on the left to review contact cards and historical invoice sync details.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {showOrderDetailsModal && selectedOrderDetails && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel modal-content" style={styles.modalContent}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "12px", marginBottom: "16px" }}>
              <div>
                <h3 style={styles.modalTitle}>Order Details</h3>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Invoice Number: <strong style={{ color: "var(--primary)" }}>{selectedOrderDetails.order_number}</strong>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowOrderDetailsModal(false);
                  setSelectedOrderDetails(null);
                }}
                style={styles.closeBtn}
              >
                <X size={18} />
              </button>
            </div>

            <div style={styles.detailGrid}>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Client Name</span>
                <span style={styles.detailVal}>{selectedCust.name}</span>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Phone Number</span>
                <span style={styles.detailVal}>{selectedCust.phone}</span>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Date Billed</span>
                <span style={styles.detailVal}>
                  {new Date(selectedOrderDetails.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Handled By</span>
                <span style={styles.detailVal}>{selectedOrderDetails.created_by || "Unknown"}</span>
              </div>
            </div>

            <div style={{ margin: "16px 0", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "10px", color: "var(--text-main)" }}>Job Items</h4>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Job Item Description</th>
                      <th style={{ ...styles.th, textAlign: "right" }}>Price</th>
                      <th style={{ ...styles.th, textAlign: "center" }}>Qty</th>
                      <th style={{ ...styles.th, textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!selectedOrderDetails.items || selectedOrderDetails.items.length === 0) ? (
                      <tr>
                        <td colSpan="4" style={styles.emptyRow}>No items logged.</td>
                      </tr>
                    ) : (
                      selectedOrderDetails.items.map((item, idx) => (
                        <tr key={idx} style={styles.tr}>
                          <td style={styles.td}>{item.name}</td>
                          <td style={{ ...styles.td, textAlign: "right" }}>{formatCurrency(item.price)}</td>
                          <td style={{ ...styles.td, textAlign: "center" }}>{item.qty}</td>
                          <td style={{ ...styles.td, textAlign: "right", fontWeight: "600" }}>{formatCurrency(item.total)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderTop: "1px solid var(--border)", paddingTop: "16px", marginTop: "8px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  Payment Method: <strong style={{ color: "var(--text-main)" }}>{selectedOrderDetails.payment_method?.replace("_", " ").toUpperCase()}</strong>
                </div>
                <div>
                  <span className={`badge ${getStatusBadgeClass(selectedOrderDetails.status)}`}>
                    {selectedOrderDetails.status?.replace("_", " ").toUpperCase()}
                  </span>
                </div>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", textAlign: "right", minWidth: "180px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Subtotal:</span>
                  <strong style={{ color: "var(--text-main)" }}>{formatCurrency(selectedOrderDetails.total_amount)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Amount Paid:</span>
                  <strong style={{ color: "var(--accent-green)" }}>{formatCurrency(selectedOrderDetails.paid_amount)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", borderTop: "1px dashed var(--border)", paddingTop: "4px", marginTop: "4px" }}>
                  <span style={{ color: "var(--text-muted)", fontWeight: "600" }}>Outstanding Balance:</span>
                  <strong style={{ color: "var(--accent-orange)" }}>{formatCurrency(selectedOrderDetails.balance_amount)}</strong>
                </div>
              </div>
            </div>

            {selectedOrderDetails.special_note && (
              <div style={{ marginTop: "12px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                  📝 Special Note
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-main)", whiteSpace: "pre-wrap" }}>
                  {selectedOrderDetails.special_note}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
              <button 
                onClick={() => {
                  window.open(`/orders/${selectedOrderDetails.id}/print`, "_blank");
                }}
                className="btn btn-primary"
                style={{ height: "40px", background: "var(--secondary)", borderColor: "var(--secondary)" }}
              >
                Print Slip
              </button>
              <button 
                onClick={() => {
                  setShowOrderDetailsModal(false);
                  setSelectedOrderDetails(null);
                }}
                className="btn btn-secondary"
                style={{ height: "40px" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quotation Details Modal */}
      {showQuoteDetailsModal && selectedQuoteDetails && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel modal-content" style={styles.modalContent}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "12px", marginBottom: "16px" }}>
              <div>
                <h3 style={styles.modalTitle}>Quotation Details</h3>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Quotation Number: <strong style={{ color: "var(--primary)" }}>{selectedQuoteDetails.quotation_number}</strong>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowQuoteDetailsModal(false);
                  setSelectedQuoteDetails(null);
                }}
                style={styles.closeBtn}
              >
                <X size={18} />
              </button>
            </div>

            <div style={styles.detailGrid}>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Client Name</span>
                <span style={styles.detailVal}>{selectedCust.name}</span>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Phone Number</span>
                <span style={styles.detailVal}>{selectedCust.phone}</span>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Date Created</span>
                <span style={styles.detailVal}>
                  {new Date(selectedQuoteDetails.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Created By</span>
                <span style={styles.detailVal}>{selectedQuoteDetails.created_by || "Unknown"}</span>
              </div>
            </div>

            <div style={{ margin: "16px 0", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "10px", color: "var(--text-main)" }}>Estimated Items</h4>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Item Description</th>
                      <th style={{ ...styles.th, textAlign: "right" }}>Price</th>
                      <th style={{ ...styles.th, textAlign: "center" }}>Qty</th>
                      <th style={{ ...styles.th, textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!selectedQuoteDetails.items || selectedQuoteDetails.items.length === 0) ? (
                      <tr>
                        <td colSpan="4" style={styles.emptyRow}>No items logged.</td>
                      </tr>
                    ) : (
                      selectedQuoteDetails.items.map((item, idx) => (
                        <tr key={idx} style={styles.tr}>
                          <td style={styles.td}>{item.name}</td>
                          <td style={{ ...styles.td, textAlign: "right" }}>{formatCurrency(item.price)}</td>
                          <td style={{ ...styles.td, textAlign: "center" }}>{item.qty}</td>
                          <td style={{ ...styles.td, textAlign: "right", fontWeight: "600" }}>{formatCurrency(item.total)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderTop: "1px solid var(--border)", paddingTop: "16px", marginTop: "8px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  Status: <strong style={{ color: selectedQuoteDetails.converted_to_order ? "var(--accent-green)" : "var(--accent-orange)" }}>
                    {selectedQuoteDetails.converted_to_order ? "CONVERTED TO BILL" : "ACTIVE DRAFT"}
                  </strong>
                </div>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", textAlign: "right", minWidth: "180px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: "700" }}>
                  <span style={{ color: "var(--text-muted)" }}>Estimated Total:</span>
                  <strong style={{ color: "var(--primary)" }}>{formatCurrency(selectedQuoteDetails.total_amount)}</strong>
                </div>
              </div>
            </div>

            {selectedQuoteDetails.special_note && (
              <div style={{ marginTop: "12px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                  📝 Special Note
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-main)", whiteSpace: "pre-wrap" }}>
                  {selectedQuoteDetails.special_note}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
              <button 
                onClick={() => {
                  setShowQuoteDetailsModal(false);
                  setSelectedQuoteDetails(null);
                }}
                className="btn btn-secondary"
                style={{ height: "40px" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Print Statement Date Range Modal */}
      {showPrintStatementModal && selectedCust && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel modal-content" style={{ ...styles.modalContent, maxWidth: "520px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "12px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)" }}>
                  <Printer size={18} />
                </div>
                <div>
                  <h3 style={styles.modalTitle}>Print Customer Statement</h3>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Select statement date range &amp; filter options
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setShowPrintStatementModal(false)}
                style={styles.closeBtn}
              >
                <X size={18} />
              </button>
            </div>

            {/* Customer Summary Banner */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px 14px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-main)" }}>{selectedCust.name}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{selectedCust.phone}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Total Balance</div>
                <div style={{ fontSize: "15px", fontWeight: 800, color: Number(selectedCust.outstanding_balance || 0) > 0 ? "var(--accent-orange)" : Number(selectedCust.outstanding_balance || 0) < 0 ? "var(--accent-green)" : "var(--text-main)" }}>
                  {Number(selectedCust.outstanding_balance || 0) < 0 
                    ? `${formatCurrency(Math.abs(selectedCust.outstanding_balance))} CR` 
                    : formatCurrency(selectedCust.outstanding_balance || 0)}
                </div>
              </div>
            </div>

            {/* Quick Presets */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Quick Date Range Presets
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {[
                  { id: "all", label: "All Time" },
                  { id: "today", label: "Today" },
                  { id: "this_month", label: "This Month" },
                  { id: "last_month", label: "Last Month" },
                  { id: "last_30", label: "Last 30 Days" },
                  { id: "this_year", label: "This Year" }
                ].map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPrintPreset(preset.id)}
                    className="btn btn-secondary"
                    style={{
                      height: "30px",
                      padding: "0 10px",
                      fontSize: "11px",
                      borderRadius: "6px",
                      borderColor: printQuickRange === preset.id ? "var(--primary)" : "var(--border)",
                      background: printQuickRange === preset.id ? "rgba(99,102,241,0.15)" : "transparent",
                      color: printQuickRange === preset.id ? "var(--primary)" : "var(--text-main)",
                      fontWeight: printQuickRange === preset.id ? 700 : 500
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Range Inputs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
              <div>
                <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Start Date
                </label>
                <input
                  type="date"
                  className="input-field"
                  value={printStartDate}
                  onChange={(e) => {
                    setPrintStartDate(e.target.value);
                    setPrintQuickRange("custom");
                  }}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  End Date
                </label>
                <input
                  type="date"
                  className="input-field"
                  value={printEndDate}
                  onChange={(e) => {
                    setPrintEndDate(e.target.value);
                    setPrintQuickRange("custom");
                  }}
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            {/* Summary info */}
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "20px", background: "rgba(99,102,241,0.04)", padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(99,102,241,0.15)" }}>
              ℹ️ Statement includes chronological transactions, invoices, settlements, and a dedicated <strong>Total Outstanding Balance</strong> column for each day.
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button 
                onClick={() => setShowPrintStatementModal(false)}
                className="btn btn-secondary"
                style={{ height: "38px", padding: "0 14px" }}
              >
                Cancel
              </button>
              <button 
                onClick={handleLaunchPrintStatement}
                className="btn btn-primary"
                style={{ height: "38px", padding: "0 18px", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Printer size={15} />
                <span>Generate &amp; Print Statement</span>
              </button>
            </div>
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
  headerRow: {
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
  addBtn: {
    height: "40px",
    padding: "0 18px",
    gap: "6px",
  },
  successBanner: {
    background: "var(--accent-green-glow)",
    color: "var(--accent-green)",
    border: "1px solid rgba(74, 222, 128, 0.2)",
    padding: "12px 20px",
    borderRadius: "var(--radius-sm)",
    fontSize: "14px",
    fontWeight: "600",
  },
  errorBanner: {
    background: "var(--accent-red-glow)",
    color: "var(--accent-red)",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    padding: "12px 20px",
    borderRadius: "var(--radius-sm)",
    fontSize: "14px",
    fontWeight: "600",
  },
  loaderContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "400px",
  },
  spinner: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: "3px solid var(--border)",
    borderTopColor: "var(--primary)",
    animation: "spin 1s linear infinite",
  },
  smallLoader: {
    display: "flex",
    justifyContent: "center",
    padding: "40px 0",
  },
  formCard: {
    padding: "30px",
    maxWidth: "800px",
    margin: "0 auto",
    width: "100%",
  },
  formTitle: {
    fontSize: "20px",
    fontWeight: "700",
    marginBottom: "24px",
    borderBottom: "1px solid var(--border)",
    paddingBottom: "10px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  formRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    "@media (maxWidth: 768px)": {
      gridTemplateColumns: "1fr",
    }
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: "12px",
    fontWeight: "600",
    color: "var(--text-muted)",
  },
  formActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "10px",
  },
  layoutGrid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 2fr",
    gap: "20px",
    height: "calc(100vh - 160px)",
    minHeight: "550px",
    "@media (maxWidth: 991px)": {
      gridTemplateColumns: "1fr",
      height: "auto",
    }
  },
  leftPane: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    height: "100%",
  },
  searchCard: {
    padding: "16px",
  },
  searchGroup: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  searchIcon: {
    position: "absolute",
    left: "14px",
    color: "var(--text-subtle)",
  },
  searchInput: {
    paddingLeft: "40px",
    height: "40px",
  },
  listCard: {
    flex: 1,
    padding: "16px",
    overflowY: "auto",
  },
  emptyList: {
    textAlign: "center",
    color: "var(--text-subtle)",
    padding: "40px 0",
    fontSize: "14px",
  },
  custItemsList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  custRow: {
    padding: "14px 16px",
    borderRadius: "var(--radius-sm)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--border)",
    background: "rgba(255,255,255,0.01)",
    cursor: "pointer",
    transition: "var(--transition-fast)",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  custRowActive: {
    background: "var(--primary-glow)",
    borderColor: "var(--primary)",
  },
  custRowHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  custRowName: {
    fontWeight: "700",
    fontSize: "15px",
  },
  custRowBalanceBadge: {
    background: "var(--accent-orange-glow)",
    color: "var(--accent-orange)",
    padding: "2px 8px",
    fontSize: "11px",
    fontWeight: "700",
    borderRadius: "var(--radius-full)",
    border: "1px solid rgba(251, 146, 60, 0.2)",
  },
  custRowPhone: {
    fontSize: "12px",
    color: "var(--text-subtle)",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "12px",
    marginBottom: "24px",
    width: "100%",
  },
  statCard: {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid var(--border)",
    padding: "12px 14px",
    borderRadius: "var(--radius-md)",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  statLabel: {
    fontSize: "10px",
    fontWeight: "600",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    letterSpacing: "0.05em",
  },
  statValue: {
    fontSize: "16px",
    fontWeight: "800",
    color: "var(--text-main)",
  },
  statSub: {
    fontSize: "10px",
    color: "var(--text-subtle)",
  },
  rightPane: {
    padding: "24px",
    overflowY: "auto",
    height: "100%",
  },
  placeholderContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    padding: "40px",
    textAlign: "center",
    gap: "16px",
  },
  placeholderIcon: {
    color: "var(--text-subtle)",
    opacity: 0.5,
  },
  placeholderTitle: {
    fontSize: "18px",
    fontWeight: "700",
  },
  placeholderDesc: {
    fontSize: "14px",
    color: "var(--text-muted)",
    maxWidth: "360px",
  },
  detailsContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  detailsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1px solid var(--border)",
    paddingBottom: "20px",
    flexWrap: "wrap",
    gap: "16px",
  },
  avatarSection: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  avatarBig: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    background: "var(--primary-glow)",
    border: "1px solid var(--primary)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--primary)",
  },
  detailsTitle: {
    fontSize: "24px",
    fontWeight: "800",
  },
  detailsSub: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "var(--text-muted)",
    marginTop: "4px",
  },
  alertCard: {
    background: "var(--accent-orange-glow)",
    border: "1px solid rgba(251, 146, 60, 0.2)",
    color: "var(--accent-orange)",
    padding: "12px 18px",
    borderRadius: "var(--radius-sm)",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "13px",
    fontWeight: "600",
    maxWidth: "340px",
  },
  sectionCard: {
    background: "rgba(15,23,42,0.2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  sectionTitle: {
    fontSize: "13px",
    fontWeight: "700",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    letterSpacing: "0.05em",
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
  },
  infoItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
  },
  infoIcon: {
    color: "var(--primary)",
    marginTop: "2px",
  },
  infoLabel: {
    fontSize: "11px",
    color: "var(--text-subtle)",
    textTransform: "uppercase",
    fontWeight: "600",
  },
  infoValue: {
    fontSize: "14px",
    fontWeight: "600",
  },
  historySection: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  historyGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    "@media (maxWidth: 768px)": {
      gridTemplateColumns: "1fr",
    }
  },
  historyCard: {
    background: "rgba(15,23,42,0.1)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "16px",
    height: "300px",
    display: "flex",
    flexDirection: "column",
  },
  historyCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    fontWeight: "700",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
    paddingBottom: "8px",
    marginBottom: "12px",
  },
  historyList: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  emptyHistoryMsg: {
    textAlign: "center",
    color: "var(--text-subtle)",
    fontSize: "13px",
    padding: "40px 0",
  },
  historyRow: {
    padding: "10px 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.01)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyRowTitle: {
    fontWeight: "600",
    fontSize: "13px",
  },
  historyRowDate: {
    fontSize: "11px",
    color: "var(--text-subtle)",
    marginTop: "2px",
  },
  historyRowRight: {
    textAlign: "right",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
  },
  historyRowAmount: {
    fontSize: "13px",
    fontWeight: "600",
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
    maxWidth: "600px",
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
    fontSize: "13px",
    color: "var(--text-muted)",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: "4px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "var(--transition-fast)",
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: "16px",
    background: "rgba(255, 255, 255, 0.01)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "16px",
  },
  detailItem: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  detailLabel: {
    fontSize: "11px",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    fontWeight: "600",
    letterSpacing: "0.05em",
  },
  detailVal: {
    fontSize: "14px",
    fontWeight: "600",
    color: "var(--text-main)",
  },
  tableWrapper: {
    width: "100%",
    overflowX: "auto",
    maxHeight: "180px",
    overflowY: "auto",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  th: {
    padding: "8px 12px",
    fontSize: "11px",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    fontWeight: "600",
    borderBottom: "1px solid var(--border)",
    background: "rgba(15, 23, 42, 0.4)",
  },
  tr: {
    borderBottom: "1px solid var(--border)",
  },
  td: {
    padding: "10px 12px",
    fontSize: "13px",
    color: "var(--text-main)",
  },
  emptyRow: {
    padding: "20px 0",
    textAlign: "center",
    color: "var(--text-subtle)",
    fontSize: "13px",
  },
};
