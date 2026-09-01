"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/AuthGuard";
import { 
  Search, 
  Filter, 
  Printer, 
  CreditCard, 
  Calendar, 
  User, 
  Phone, 
  FileText,
  DollarSign,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Receipt,
  MessageCircle,
  Trash2,
  AlertTriangle,
  Lock,
  Edit3,
  Plus,
  Save,
  ShieldCheck
} from "lucide-react";

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  
  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // Payment update inputs
  const [addPaymentVal, setAddPaymentVal] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Void details states
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidPIN, setVoidPIN] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState("");
  const [submittingVoid, setSubmittingVoid] = useState(false);
  const [profiles, setProfiles] = useState([]);

  // Owner Edit Bill States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editItems, setEditItems] = useState([]);
  const [editSpecialNote, setEditSpecialNote] = useState("");
  const [editError, setEditError] = useState("");
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const urlOrderId = searchParams.get("id");
  const autoPrint = searchParams.get("print") === "true";

  const getDuplicateOrSuspiciousStatus = (currentOrder) => {
    if (!currentOrder || !currentOrder.customer_id) return null;
    const isWalkIn = currentOrder.customers?.name?.toLowerCase().includes("walk-in") || currentOrder.customers?.name?.toLowerCase().includes("unknown");
    if (isWalkIn) return null;

    // Filter all orders for this customer and sort them chronologically (oldest to newest)
    const custOrders = orders
      .filter(o => o.customer_id === currentOrder.customer_id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Find the index of the current order
    const currentIndex = custOrders.findIndex(o => o.id === currentOrder.id);
    if (currentIndex <= 0) return null; // No preceding order exists

    // The immediately preceding order is:
    const precedingOrder = custOrders[currentIndex - 1];

    // Check if the preceding order was voided
    if (precedingOrder.status === "voided") {
      // Compare items or totals
      const currentItemsStr = JSON.stringify(currentOrder.items || []);
      const precedingItemsStr = JSON.stringify(precedingOrder.items || []);
      
      const totalsMatch = Number(currentOrder.total_amount) === Number(precedingOrder.total_amount);
      const itemsMatch = currentItemsStr === precedingItemsStr;

      if (itemsMatch || totalsMatch) {
        return {
          status: "duplicate",
          message: `Duplicate Bill (Preceded by voided ${precedingOrder.order_number})`,
          details: `This order has the same total/items as the previously voided order ${precedingOrder.order_number} for this customer.`
        };
      } else {
        return {
          status: "suspicious",
          message: `Suspicious Invoice (Preceded by voided ${precedingOrder.order_number})`,
          details: `This customer had order ${precedingOrder.order_number} voided immediately before this transaction, but with different items/total.`
        };
      }
    }

    return null;
  };

  useEffect(() => {
    fetchOrders();
    fetchProfiles();

    // Setup orders subscription
    const ordersChannel = supabase
      .channel("orders-list-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          customers (*)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);

      // Handle deep-linking from POS redirect
      if (urlOrderId && data) {
        const order = data.find(o => o.id === urlOrderId);
        if (order) {
          setSelectedOrder(order);
          // If auto-print URL parameter is set, open print dialog immediately
          if (autoPrint) {
            handlePrint(order.id);
            // Remove the print param from URL to prevent double prints on refreshes
            router.replace("/orders?id=" + order.id);
          }
        }
      }
    } catch (err) {
      console.error("Error loading orders:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfiles = async () => {
    try {
      const { data } = await supabase.from("profiles").select("id, username");
      setProfiles(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const getHandlerName = (createdBy) => {
    const prof = profiles.find(p => p.id === createdBy);
    return prof ? prof.username : "System / Unknown";
  };

  const handleVoidOrderSubmit = async (e) => {
    e.preventDefault();
    setVoidError("");
    setSubmittingVoid(true);

    if (!selectedOrder) return;
    if (!voidReason.trim()) {
      setVoidError("Please specify a reason for voiding this invoice.");
      setSubmittingVoid(false);
      return;
    }

    try {
      // 2. Perform Order Status Update
      const { error: oError } = await supabase
        .from("orders")
        .update({
          status: "voided",
          voided_by: profile?.username || "Unknown",
          voided_reason: voidReason.trim(),
          voided_at: new Date().toISOString()
        })
        .eq("id", selectedOrder.id);

      if (oError) throw oError;

      // 3. Deduct Customer Outstanding Debt if registered customer and balance is non-zero
      if (selectedOrder.customers && Number(selectedOrder.balance_amount || 0) !== 0) {
        const isWalkIn = selectedOrder.customers.name.toLowerCase().includes("walk-in") || selectedOrder.customers.name.toLowerCase().includes("unknown");
        if (!isWalkIn) {
          const { data: latestCust } = await supabase
            .from("customers")
            .select("outstanding_balance")
            .eq("id", selectedOrder.customer_id)
            .single();
          const latestBalance = latestCust ? Number(latestCust.outstanding_balance || 0) : 0;
          const { error: cError } = await supabase
            .from("customers")
            .update({
              outstanding_balance: latestBalance - Number(selectedOrder.balance_amount || 0)
            })
            .eq("id", selectedOrder.customer_id);
          if (cError) console.error("Error updating customer outstanding balance:", cError);
        }
      }

      // 4. Sheets sync for voiding
      try {
        fetch("/api/sync-sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_number: selectedOrder.order_number,
            customer_name: selectedOrder.customers?.name || "Walk-in",
            customer_phone: selectedOrder.customers?.phone || "0000000000",
            total_amount: 0,
            paid_amount: 0,
            balance_amount: 0,
            items: [],
            date: new Date().toISOString(),
            status: "VOIDED"
          })
        });
      } catch (syncErr) {
        console.error("Sheets void sync failed:", syncErr);
      }

      setSuccessMsg(`Order ${selectedOrder.order_number} voided successfully.`);
      setShowVoidModal(false);
      setVoidPIN("");
      setVoidReason("");
      
      // Reload order details
      const { data: refreshedOrder } = await supabase
        .from("orders")
        .select(`*, customers(*)`)
        .eq("id", selectedOrder.id)
        .single();
      
      if (refreshedOrder) {
        setSelectedOrder(refreshedOrder);
      }
      fetchOrders();
      
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
      setVoidError(err.message || "Failed to void order.");
    } finally {
      setSubmittingVoid(false);
    }
  };

  const handleOpenEditModal = () => {
    if (profile?.role !== "owner") {
      alert("Unauthorized: Only the Owner account has access to modify invoices.");
      return;
    }
    if (!selectedOrder) return;
    
    const initialItems = (selectedOrder.items || []).map(item => ({
      name: item.name || "",
      qty: item.qty !== undefined ? item.qty : 1,
      price: item.price !== undefined ? item.price : 0,
      discount_type: item.discount_type || "none",
      discount_value: item.discount_value !== undefined ? item.discount_value : 0,
      total: item.total !== undefined ? item.total : ((Number(item.qty) || 1) * (Number(item.price) || 0))
    }));

    setEditItems(initialItems.length > 0 ? initialItems : [{ name: "", qty: 1, price: 0, discount_type: "none", discount_value: 0, total: 0 }]);
    setEditSpecialNote(selectedOrder.special_note || "");
    setEditError("");
    setShowEditModal(true);
  };

  const handleItemFieldChange = (index, field, value) => {
    setEditItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      
      const price = Number(field === "price" ? value : item.price) || 0;
      const qty = Number(field === "qty" ? value : item.qty) || 0;
      const dType = field === "discount_type" ? value : (item.discount_type || "none");
      const dVal = Number(field === "discount_value" ? value : (item.discount_value || 0));
      
      let total = price * qty;
      if (dType === "percentage") {
        total = total - (total * (dVal / 100));
      } else if (dType === "fixed") {
        total = Math.max(0, total - dVal);
      }
      item.total = Math.round(total * 100) / 100;
      
      updated[index] = item;
      return updated;
    });
  };

  const handleAddItemRow = () => {
    setEditItems(prev => [
      ...prev,
      { name: "", price: 0, qty: 1, discount_type: "none", discount_value: 0, total: 0 }
    ]);
  };

  const handleRemoveItemRow = (index) => {
    if (editItems.length <= 1) {
      setEditError("Invoice must contain at least one item line.");
      return;
    }
    setEditItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveEditInvoice = async (e) => {
    e.preventDefault();
    if (profile?.role !== "owner") {
      setEditError("Unauthorized: Only the Owner account has access to edit bills.");
      return;
    }
    if (!selectedOrder) return;

    // Check item names and quantities
    for (let i = 0; i < editItems.length; i++) {
      if (!editItems[i].name || !editItems[i].name.trim()) {
        setEditError(`Item line #${i + 1} description cannot be blank.`);
        return;
      }
      if (Number(editItems[i].qty) <= 0) {
        setEditError(`Item #${i + 1} quantity must be greater than 0.`);
        return;
      }
    }

    setSubmittingEdit(true);
    setEditError("");

    try {
      const newTotal = editItems.reduce((sum, it) => sum + Number(it.total || 0), 0);
      const paidAmt = Number(selectedOrder.paid_amount || 0);
      const newBalance = Math.max(0, newTotal - paidAmt);
      
      let newStatus = selectedOrder.status;
      if (selectedOrder.status !== "voided") {
        if (newBalance === 0) {
          newStatus = "paid";
        } else if (paidAmt > 0) {
          newStatus = "partially_paid";
        } else {
          newStatus = "pending";
        }
      }

      // 1. Update Order in Supabase
      const { data: updatedOrder, error: oError } = await supabase
        .from("orders")
        .update({
          items: editItems,
          total_amount: newTotal,
          balance_amount: newBalance,
          status: newStatus,
          special_note: editSpecialNote?.trim() || null,
        })
        .eq("id", selectedOrder.id)
        .select(`*, customers (*)`)
        .single();

      if (oError) throw oError;

      // 2. Adjust Customer Outstanding Balance if registered customer and balance changed
      const oldBalance = Number(selectedOrder.balance_amount || 0);
      const balanceDiff = newBalance - oldBalance;
      if (selectedOrder.customer_id && balanceDiff !== 0 && selectedOrder.status !== "voided") {
        const isWalkIn = selectedOrder.customers?.name?.toLowerCase().includes("walk-in") || selectedOrder.customers?.name?.toLowerCase().includes("unknown");
        if (!isWalkIn) {
          const { data: latestCust } = await supabase
            .from("customers")
            .select("outstanding_balance")
            .eq("id", selectedOrder.customer_id)
            .single();
          const currentCustBalance = latestCust ? Number(latestCust.outstanding_balance || 0) : 0;
          const { error: cError } = await supabase
            .from("customers")
            .update({
              outstanding_balance: Math.max(0, currentCustBalance + balanceDiff)
            })
            .eq("id", selectedOrder.customer_id);
          if (cError) console.error("Error updating customer outstanding balance after bill edit:", cError);
        }
      }

      // 3. Sync to Google Sheets
      try {
        fetch("/api/sync-sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: selectedOrder.id,
            order_number: selectedOrder.order_number,
            customer_name: selectedOrder.customers?.name || "Walk-in",
            customer_phone: selectedOrder.customers?.phone || "0000000000",
            total_amount: newTotal,
            paid_amount: paidAmt,
            balance_amount: newBalance,
            status: newStatus,
            items: editItems,
            date: new Date().toISOString(),
            is_update: true
          }),
        });
      } catch (syncErr) {
        console.error("Sheets update sync failed:", syncErr);
      }

      setSuccessMsg(`Invoice ${selectedOrder.order_number} details & item text updated successfully.`);
      setShowEditModal(false);
      setSelectedOrder(updatedOrder);
      fetchOrders();
      setTimeout(() => setSuccessMsg(""), 3500);
    } catch (err) {
      setEditError(err.message || "Failed to update invoice.");
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handlePrint = (orderId) => {
    if (!orderId) return;
    const printWindow = window.open(`/orders/${orderId}/print`, "_blank");
    if (printWindow) {
      printWindow.focus();
    }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    if (!selectedOrder || !addPaymentVal || Number(addPaymentVal) <= 0) return;

    const paymentAmount = Number(addPaymentVal);
    
    if (paymentAmount > selectedOrder.balance_amount) {
      setErrorMsg("Payment amount exceeds outstanding balance.");
      return;
    }

    setSubmittingPayment(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const newPaid = Number(selectedOrder.paid_amount || 0) + paymentAmount;
      const newBalance = Math.max(0, selectedOrder.balance_amount - paymentAmount);
      
      let newStatus = "pending";
      if (newBalance === 0) {
        newStatus = "paid";
      } else if (newPaid > 0) {
        newStatus = "partially_paid";
      }

      // 1. Update Order Table
      const { data: updatedOrder, error: oError } = await supabase
        .from("orders")
        .update({
          paid_amount: newPaid,
          balance_amount: newBalance,
          status: newStatus
        })
        .eq("id", selectedOrder.id)
        .select(`*, customers (*)`)
        .single();

      if (oError) throw oError;

      // 2. Adjust Customer's Outstanding Balance
      const { data: latestCust } = await supabase
        .from("customers")
        .select("outstanding_balance")
        .eq("id", selectedOrder.customer_id)
        .single();
      const latestBalance = latestCust ? Number(latestCust.outstanding_balance || 0) : 0;
      const { error: cError } = await supabase
        .from("customers")
        .update({
          outstanding_balance: Math.max(0, latestBalance - paymentAmount)
        })
        .eq("id", selectedOrder.customer_id);

      if (cError) throw cError;

      // 3. Trigger Google Sheets Sync (Optional Webhook call)
      try {
        fetch("/api/sync-sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: selectedOrder.id,
            order_number: selectedOrder.order_number,
            customer_name: selectedOrder.customers.name,
            customer_phone: selectedOrder.customers.phone,
            total_amount: selectedOrder.total_amount,
            paid_amount: newPaid,
            balance_amount: newBalance,
            status: newStatus,
            items: selectedOrder.items,
            date: new Date().toISOString(),
            is_update: true
          }),
        });
      } catch (syncErr) {
        console.error("Sheets update sync failed:", syncErr);
      }

      setSuccessMsg(`Logged payment of ${paymentAmount} LKR!`);
      setAddPaymentVal("");
      setSelectedOrder(updatedOrder);
      fetchOrders();
    } catch (err) {
      setErrorMsg(err.message || "Failed to post payment.");
    } finally {
      setSubmittingPayment(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case "paid": return "badge-paid";
      case "pending": return "badge-pending";
      case "partially_paid": return "badge-partial";
      default: return "";
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      minimumFractionDigits: 0
    }).format(val);
  };

  const selectedSecurityStatus = selectedOrder ? getDuplicateOrSuspiciousStatus(selectedOrder) : null;
  const handleSendWhatsApp = (order) => {
    if (!order || !order.customers) return;
    const cust = order.customers;
    const isWalkIn = cust.name.toLowerCase().includes("walk-in") || cust.name.toLowerCase().includes("unknown");
    if (isWalkIn) {
      alert("WhatsApp dispatch is not available for Walk-in clients.");
      return;
    }

    let phone = cust.phone.replace(/\D/g, "");
    if (phone.startsWith("0")) {
      phone = "94" + phone.substring(1);
    } else if (!phone.startsWith("94") && phone.length === 9) {
      phone = "94" + phone;
    }

    const itemsText = order.items
      .map(item => `• *${item.name}* (x${item.qty}) - ${Number(item.price).toFixed(0)} LKR`)
      .join("\n");

    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const receiptUrl = `${origin}/orders/${order.id}/print`;

    const message = `Hello *${cust.name}*,\n\n` +
      `Thank you for choosing *PRINT X*! 😊\n\n` +
      `Here are your billing details for Order *${order.order_number}*:\n` +
      `----------------------------------------\n` +
      `${itemsText}\n` +
      `----------------------------------------\n` +
      `*Total Amount:* ${Number(order.total_amount).toFixed(0)} LKR\n` +
      `*Amount Paid:* ${Number(order.paid_amount).toFixed(0)} LKR\n` +
      `*Remaining Balance:* ${Number(order.balance_amount).toFixed(0)} LKR\n\n` +
      `*Your Total Outstanding Debt:* ${Number(cust.outstanding_balance || 0).toFixed(0)} LKR\n\n` +
      `You can view your official receipt here:\n` +
      `${receiptUrl}\n\n` +
      `Thank you for your business! 🙏`;

    const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

    // Open WhatsApp FIRST (directly from user click — browser allows this)
    window.open(waUrl, "whatsapp_window");

    // Optionally open the print/invoice tab after a short delay
    setTimeout(() => {
      if (window.confirm("WhatsApp opened! \nDo you also want to open the invoice page to save it as PDF?")) {
        window.open(`/orders/${order.id}/print`, "_blank");
      }
    }, 600);
  };

  // Filters logic
  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) || 
      order.customers?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customers?.phone?.includes(searchQuery);

    const matchesStatus = statusFilter === "all" || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div style={styles.container}>
      {/* Upper header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={styles.title}>Orders Directory</h1>
          <p style={styles.subtitle}>Track order receipts, log partial payments, and print customer copy</p>
        </div>
        <button 
          onClick={() => router.push("/pos")}
          style={{
            background: "var(--primary)",
            color: "#ffffff",
            padding: "10px 18px",
            borderRadius: "var(--radius-sm)",
            fontWeight: "600",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            boxShadow: "0 4px 12px var(--primary-glow)",
            fontSize: "14px"
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to POS</span>
        </button>
      </div>

      {successMsg && (
        <div style={styles.successBanner} className="animate-fade-in">
          <CheckCircle size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div style={styles.errorBanner} className="animate-fade-in">
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div style={styles.loaderContainer}>
          <div style={styles.spinner}></div>
        </div>
      ) : (
        <div className="layout-grid" style={styles.ordersLayout}>
          {/* Left panel: Filter and list */}
          <div style={styles.leftPane}>
            <div className="glass-panel" style={styles.searchFilterCard}>
              <div style={styles.searchGroup}>
                <Search size={16} style={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Order ID, client name or phone..."
                  className="input-field"
                  style={styles.searchInput}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div style={styles.filterGroup}>
                <Filter size={14} style={{ color: "var(--text-subtle)" }} />
                <select 
                  className="input-field" 
                  style={styles.selectFilter}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Orders</option>
                  <option value="paid">Fully Paid</option>
                  <option value="partially_paid">Partially Paid</option>
                  <option value="pending">Pending Payments</option>
                </select>
              </div>
            </div>

            <div className="glass-panel" style={styles.listCard}>
              {filteredOrders.length === 0 ? (
                <div style={styles.emptyList}>No orders match search query.</div>
              ) : (
                <div style={styles.ordersList}>
                  {filteredOrders.map(order => {
                    const status = getDuplicateOrSuspiciousStatus(order);
                    return (
                      <div 
                        key={order.id} 
                        onClick={() => { setSelectedOrder(order); setErrorMsg(""); setSuccessMsg(""); }}
                        style={{
                          ...styles.orderItem,
                          ...(selectedOrder?.id === order.id ? styles.orderItemActive : {})
                        }}
                      >
                        <div style={styles.orderItemHeader}>
                          <span style={styles.orderIdText}>{order.order_number}</span>
                          <span className={`badge ${getStatusBadgeClass(order.status)}`}>
                            {order.status?.replace("_", " ")}
                          </span>
                        </div>
                        {status && (
                          <div style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            color: status.status === "duplicate" ? "var(--accent-orange)" : "var(--accent-red)",
                            background: status.status === "duplicate" ? "rgba(251, 146, 60, 0.08)" : "rgba(239, 68, 68, 0.08)",
                            border: "1px solid " + (status.status === "duplicate" ? "rgba(251, 146, 60, 0.15)" : "rgba(239, 68, 68, 0.15)"),
                            borderRadius: "4px",
                            padding: "2px 6px",
                            width: "fit-content",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px"
                          }}>
                            <AlertCircle size={10} />
                            <span>{status.status === "duplicate" ? "Duplicate Bill" : "Suspicious"}</span>
                          </div>
                        )}
                        <div style={styles.orderItemClient}>{order.customers?.name || "Walk-in"}</div>
                        <div style={styles.orderItemFooter}>
                          <span style={styles.orderItemDate}>
                            {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          <span style={styles.orderItemTotal}>{formatCurrency(order.total_amount)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          {/* Right panel: Details */}
          <div className="glass-panel" style={styles.rightPane}>
            {selectedOrder ? (
              <div style={styles.detailsContainer} className="animate-fade-in">
                {/* Security Alert Banner */}
                {selectedSecurityStatus && (
                  <div style={{
                    padding: "14px 16px",
                    borderRadius: "8px",
                    background: selectedSecurityStatus.status === "duplicate" ? "rgba(251, 146, 60, 0.08)" : "rgba(239, 68, 68, 0.08)",
                    border: "1px solid " + (selectedSecurityStatus.status === "duplicate" ? "rgba(251, 146, 60, 0.25)" : "rgba(239, 68, 68, 0.25)"),
                    color: selectedSecurityStatus.status === "duplicate" ? "var(--accent-orange)" : "var(--accent-red)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    marginBottom: "16px",
                    fontSize: "13px",
                    textAlign: "left"
                  }}>
                    <strong style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "700" }}>
                      <AlertCircle size={16} />
                      {selectedSecurityStatus.message}
                    </strong>
                    <span style={{ opacity: 0.95 }}>{selectedSecurityStatus.details}</span>
                  </div>
                )}

                {/* Voided Invoice Banner */}
                {selectedOrder.status === "voided" && (
                  <div style={{
                    background: "var(--accent-red-glow)",
                    color: "var(--accent-red)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    padding: "16px",
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    fontSize: "13px",
                    marginBottom: "16px",
                    textAlign: "left"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "800" }}>
                      <AlertTriangle size={18} />
                      <span style={{ fontSize: "14px" }}>VOIDED / CANCELLED INVOICE</span>
                    </div>
                    <div><strong>Voided By Staff:</strong> {selectedOrder.voided_by}</div>
                    <div><strong>Void Reason:</strong> {selectedOrder.voided_reason || "No reason specified."}</div>
                    <div><strong>Voided Date:</strong> {new Date(selectedOrder.voided_at).toLocaleString()}</div>
                  </div>
                )}

                {/* Details Header */}
                <div style={styles.detailsHeader}>
                  <div>
                    <h2 style={styles.detailsTitle}>{selectedOrder.order_number}</h2>
                    <div style={styles.detailsSub}>
                      <Calendar size={12} />
                      <span>{new Date(selectedOrder.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
                    </div>
                  </div>
                  <div style={styles.detailsHeaderActions}>
                    {profile?.role === "owner" && selectedOrder.status !== "voided" && (
                      <button
                        onClick={handleOpenEditModal}
                        className="btn btn-secondary"
                        style={{
                          height: "36px",
                          padding: "0 12px",
                          fontSize: "12px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          borderColor: "var(--primary)",
                          color: "var(--primary)",
                          background: "var(--primary-glow)"
                        }}
                        title="Owner Privileges: Correct letter errors in items or update bill details"
                      >
                        <Edit3 size={15} />
                        <span>Edit Bill</span>
                      </button>
                    )}
                    {selectedOrder.status !== "voided" && selectedOrder.customers && !(selectedOrder.customers.name.toLowerCase().includes("walk-in") || selectedOrder.customers.name.toLowerCase().includes("unknown")) && (
                      <button
                        onClick={() => handleSendWhatsApp(selectedOrder)}
                        className="btn btn-secondary"
                        style={{ height: "36px", padding: "0 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", borderColor: "rgba(34, 197, 94, 0.3)", color: "var(--accent-green)", background: "rgba(34, 197, 94, 0.05)" }}
                      >
                        <MessageCircle size={15} />
                        <span>Send WhatsApp</span>
                      </button>
                    )}
                    {selectedOrder.status !== "voided" && (
                      <button
                        onClick={() => {
                          setVoidPIN("");
                          setVoidReason("");
                          setVoidError("");
                          setShowVoidModal(true);
                        }}
                        className="btn btn-secondary"
                        style={{ height: "36px", padding: "0 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", borderColor: "rgba(239, 68, 68, 0.3)", color: "var(--accent-red)", background: "rgba(239, 68, 68, 0.05)" }}
                      >
                        <Trash2 size={15} />
                        <span>Void Invoice</span>
                      </button>
                    )}
                    <button 
                      onClick={() => handlePrint(selectedOrder.id)} 
                      className="btn btn-primary"
                      style={styles.printBtn}
                    >
                      <Printer size={16} />
                      <span>Print Slip</span>
                    </button>
                  </div>
                </div>

                {/* Customer Details */}
                <div style={styles.sectionCard}>
                  <h3 style={styles.sectionTitle}>Client Details</h3>
                  <div style={styles.clientDetailsRow}>
                    <div style={styles.detailItem}>
                      <User size={14} style={styles.detailIcon} />
                      <div>
                        <div style={styles.detailLabel}>Client Name</div>
                        <div style={styles.detailValue}>{selectedOrder.customers?.name || "Walk-in"}</div>
                      </div>
                    </div>

                    <div style={styles.detailItem}>
                      <Phone size={14} style={styles.detailIcon} />
                      <div>
                        <div style={styles.detailLabel}>Phone Number</div>
                        <div style={styles.detailValue}>{selectedOrder.customers?.phone || "-"}</div>
                      </div>
                    </div>

                    <div style={styles.detailItem}>
                      <FileText size={14} style={styles.detailIcon} />
                      <div>
                        <div style={styles.detailLabel}>Handled By</div>
                        <div style={styles.detailValue}>{getHandlerName(selectedOrder.created_by)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items details */}
                <div style={styles.sectionCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
                    <h3 style={{ ...styles.sectionTitle, marginBottom: 0, borderBottom: "none", paddingBottom: 0 }}>Print Job Specifications</h3>
                    {profile?.role === "owner" && selectedOrder.status !== "voided" && (
                      <button
                        onClick={handleOpenEditModal}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--primary)",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "2px 6px"
                        }}
                        title="Owner Access: Fix letter typos or item details"
                      >
                        <Edit3 size={13} />
                        <span>Edit Items (Owner)</span>
                      </button>
                    )}
                  </div>
                  <div style={styles.itemsTableWrapper}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.tableTh}>Job Item Description</th>
                          <th style={styles.tableTh}>Price</th>
                          <th style={styles.tableTh}>Qty</th>
                          <th style={{ ...styles.tableTh, textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.items?.map((item, idx) => (
                          <tr key={idx} style={styles.tableTr}>
                            <td style={styles.tableTd}>
                              <div>{item.name}</div>
                              {item.discount_type && item.discount_type !== "none" && (
                                <div style={{ fontSize: "11px", color: "var(--accent-orange)", marginTop: "2px" }}>
                                  Discount: {item.discount_type === "percentage" ? `${item.discount_value}%` : `${item.discount_value} LKR`} off
                                </div>
                              )}
                            </td>
                            <td style={styles.tableTd}>{item.price} LKR</td>
                            <td style={styles.tableTd}>{item.qty}</td>
                            <td style={{ ...styles.tableTd, textAlign: "right", fontWeight: "600" }}>{item.total} LKR</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Payment Breakdown */}
                <div style={styles.financeGrid}>
                  <div style={styles.sectionCard}>
                    <h3 style={styles.sectionTitle}>Invoice Breakdown</h3>
                    <div style={styles.financeDetails}>
                      <div style={styles.financeRow}>
                        <span>Subtotal:</span>
                        <span>{formatCurrency(selectedOrder.total_amount)}</span>
                      </div>
                      <div style={{ ...styles.financeRow, color: "var(--accent-green)" }}>
                        <span>Amount Paid:</span>
                        <span>{formatCurrency(selectedOrder.paid_amount)}</span>
                      </div>
                      <div style={{ ...styles.financeRow, borderTop: "1px solid var(--border)", paddingTop: "10px", fontWeight: "700", color: selectedOrder.status === "voided" ? "var(--accent-red)" : selectedOrder.balance_amount > 0 ? "var(--accent-orange)" : "var(--accent-green)" }}>
                        <span>Outstanding Balance:</span>
                        <span>{selectedOrder.status === "voided" ? "0 LKR (Voided)" : formatCurrency(selectedOrder.balance_amount)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment update options */}
                  {selectedOrder.status === "voided" ? (
                    <div style={{
                      ...styles.sectionCard,
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      background: "var(--accent-red-glow)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      padding: "24px",
                      borderRadius: "var(--radius-sm)"
                    }}>
                      <AlertTriangle size={32} style={{ color: "var(--accent-red)", marginBottom: "8px" }} />
                      <h4 style={{ fontSize: "15px", fontWeight: "700", color: "var(--accent-red)", marginBottom: "4px" }}>Invoice Voided</h4>
                      <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        This receipt is marked as voided/cancelled. Outstanding balances have been deducted and catalog logs closed.
                      </p>
                    </div>
                  ) : selectedOrder.balance_amount > 0 ? (
                    <div style={styles.sectionCard}>
                      <h3 style={styles.sectionTitle}>Add Partial Payment</h3>
                      <form onSubmit={handleAddPayment} style={styles.paymentForm}>
                        <div style={styles.payInputGroup}>
                          <DollarSign size={16} style={styles.payIcon} />
                          <input
                            type="number"
                            min="0.01"
                            max={selectedOrder.balance_amount}
                            step="0.01"
                            placeholder={`Max: ${selectedOrder.balance_amount} LKR`}
                            className="input-field"
                            style={styles.payInput}
                            value={addPaymentVal}
                            onChange={(e) => setAddPaymentVal(e.target.value)}
                            required
                            disabled={submittingPayment}
                          />
                        </div>
                        <button 
                          type="submit" 
                          className="btn btn-accent animate-pulse-glow" 
                          style={styles.paySubmitBtn}
                          disabled={submittingPayment}
                        >
                          <CreditCard size={16} />
                          <span>{submittingPayment ? "Updating..." : "Post Payment"}</span>
                        </button>
                      </form>
                    </div>
                  ) : (
                    <div style={styles.fullyPaidCard}>
                      <CheckCircle size={32} style={{ color: "var(--accent-green)" }} />
                      <div style={styles.fullyPaidTitle}>Fully Settled</div>
                      <div style={styles.fullyPaidDesc}>This receipt is closed. All funds have been collected.</div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={styles.placeholderContainer}>
                <Receipt size={48} style={styles.placeholderIcon} />
                <h3 style={styles.placeholderTitle}>Select Receipt Profile</h3>
                <p style={styles.placeholderDesc}>Click any invoice row on the left to track payments, review items, and generate prints.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VOID CONFIRMATION OVERLAY MODAL */}
      {showVoidModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel-elevated animate-fade-in" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={{ ...styles.modalTitle, color: "var(--accent-red)", display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertTriangle size={20} />
                <span>Void / Cancel Invoice</span>
              </h3>
            </div>
            
            <form onSubmit={handleVoidOrderSubmit} style={styles.modalForm}>
              <div style={{
                background: "rgba(239, 68, 68, 0.05)",
                border: "1px solid rgba(239, 68, 68, 0.15)",
                padding: "12px",
                borderRadius: "var(--radius-sm)",
                fontSize: "12px",
                color: "var(--accent-red)",
                lineHeight: "1.4",
                marginBottom: "8px"
              }}>
                <strong>Warning:</strong> Voiding this invoice will deduct its outstanding balance from customer ledger and close the catalog log. This action is irreversible.
              </div>

              {voidError && (
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
                  <span>{voidError}</span>
                </div>
              )}

              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Void Reason *</label>
                <textarea
                  placeholder="Explain why this invoice is being voided (e.g. staff error, double entry, customer cancellation)"
                  className="input-field"
                  style={{
                    width: "100%",
                    minHeight: "80px",
                    padding: "10px 12px",
                    fontSize: "14px",
                    resize: "vertical",
                    background: "rgba(255,255,255,0.01)",
                    border: "1px solid var(--border)",
                    color: "var(--text-main)",
                    borderRadius: "var(--radius-sm)"
                  }}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  required
                  disabled={submittingVoid}
                />
              </div>

              <div style={styles.modalBtnRow}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowVoidModal(false)}
                  disabled={submittingVoid}
                  style={{ height: "38px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  style={{
                    backgroundColor: "var(--accent-red)",
                    color: "#fff",
                    height: "38px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                  disabled={submittingVoid}
                >
                  {submittingVoid ? (
                    <span>Voiding...</span>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      <span>Accept Responsibility & Void</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OWNER EDIT INVOICE MODAL */}
      {showEditModal && selectedOrder && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel-elevated animate-fade-in" style={{ ...styles.modalCard, maxWidth: "680px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={styles.modalHeader}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ ...styles.modalTitle, color: "var(--primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                    <ShieldCheck size={22} />
                    <span>Edit Bill #{selectedOrder.order_number}</span>
                  </h3>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                    Owner Privileges: Correct letter errors, rename items, adjust rates, or fix job descriptions.
                  </p>
                </div>
                <span style={{
                  fontSize: "11px",
                  fontWeight: "700",
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: "var(--primary-glow)",
                  color: "var(--primary)",
                  border: "1px solid var(--primary)"
                }}>
                  Owner Only
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveEditInvoice} style={styles.modalForm}>
              {editError && (
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
                  <span>{editError}</span>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ ...styles.modalLabel, fontWeight: "700", color: "var(--text-main)" }}>Item Lines</label>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="btn btn-secondary"
                    style={{ height: "28px", padding: "0 10px", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
                  >
                    <Plus size={14} />
                    <span>Add Item</span>
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {editItems.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "12px",
                        borderRadius: "var(--radius-sm)",
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid var(--border)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px"
                      }}
                    >
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-muted)", width: "20px" }}>#{idx + 1}</span>
                        <input
                          type="text"
                          placeholder="Item Description / Name (Fix spelling or typos here)"
                          className="input-field"
                          style={{ flex: 1, height: "36px", fontSize: "13px" }}
                          value={item.name}
                          onChange={(e) => handleItemFieldChange(idx, "name", e.target.value)}
                          required
                          disabled={submittingEdit}
                        />
                        {editItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            style={{
                              background: "rgba(239, 68, 68, 0.1)",
                              border: "1px solid rgba(239, 68, 68, 0.2)",
                              color: "var(--accent-red)",
                              width: "34px",
                              height: "34px",
                              borderRadius: "var(--radius-sm)",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center"
                            }}
                            title="Remove this item"
                            disabled={submittingEdit}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr 1fr", gap: "8px", alignItems: "center" }}>
                        <div>
                          <label style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px", display: "block" }}>Price (LKR)</label>
                          <input
                            type="number"
                            step="any"
                            placeholder="0"
                            className="input-field"
                            style={{ height: "34px", fontSize: "13px", width: "100%" }}
                            value={item.price}
                            onChange={(e) => handleItemFieldChange(idx, "price", e.target.value)}
                            required
                            disabled={submittingEdit}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px", display: "block" }}>Qty</label>
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            placeholder="1"
                            className="input-field"
                            style={{ height: "34px", fontSize: "13px", width: "100%" }}
                            value={item.qty}
                            onChange={(e) => handleItemFieldChange(idx, "qty", e.target.value)}
                            required
                            disabled={submittingEdit}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px", display: "block" }}>Discount</label>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <select
                              className="input-field"
                              style={{ height: "34px", fontSize: "12px", padding: "0 6px", width: "70px" }}
                              value={item.discount_type || "none"}
                              onChange={(e) => handleItemFieldChange(idx, "discount_type", e.target.value)}
                              disabled={submittingEdit}
                            >
                              <option value="none">None</option>
                              <option value="percentage">%</option>
                              <option value="fixed">LKR</option>
                            </select>
                            {item.discount_type && item.discount_type !== "none" && (
                              <input
                                type="number"
                                step="any"
                                placeholder="Val"
                                className="input-field"
                                style={{ height: "34px", fontSize: "12px", width: "65px" }}
                                value={item.discount_value || ""}
                                onChange={(e) => handleItemFieldChange(idx, "discount_value", e.target.value)}
                                disabled={submittingEdit}
                              />
                            )}
                          </div>
                        </div>

                        <div>
                          <label style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px", display: "block", textAlign: "right" }}>Subtotal</label>
                          <div style={{ height: "34px", display: "flex", alignItems: "center", justifyContent: "flex-end", fontWeight: "700", fontSize: "13px", color: "var(--primary)" }}>
                            {formatCurrency(item.total || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Special Note / Job Remarks (Optional)</label>
                <textarea
                  placeholder="Additional order instructions or notes"
                  className="input-field"
                  style={{
                    width: "100%",
                    minHeight: "60px",
                    padding: "8px 12px",
                    fontSize: "13px",
                    resize: "vertical",
                    background: "rgba(255,255,255,0.01)",
                    border: "1px solid var(--border)",
                    color: "var(--text-main)",
                    borderRadius: "var(--radius-sm)"
                  }}
                  value={editSpecialNote}
                  onChange={(e) => setEditSpecialNote(e.target.value)}
                  disabled={submittingEdit}
                />
              </div>

              {/* Live Financial Summary */}
              {(() => {
                const calcNewTotal = editItems.reduce((sum, it) => sum + Number(it.total || 0), 0);
                const paidAmt = Number(selectedOrder.paid_amount || 0);
                const calcNewBalance = Math.max(0, calcNewTotal - paidAmt);
                return (
                  <div style={{
                    padding: "12px 16px",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(99, 102, 241, 0.06)",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "13px"
                  }}>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>New Bill Total: </span>
                      <strong style={{ color: "var(--text-main)", fontSize: "15px" }}>{formatCurrency(calcNewTotal)}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Paid: </span>
                      <strong style={{ color: "var(--accent-green)" }}>{formatCurrency(paidAmt)}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Updated Balance: </span>
                      <strong style={{ color: calcNewBalance > 0 ? "var(--accent-orange)" : "var(--accent-green)", fontSize: "15px" }}>
                        {formatCurrency(calcNewBalance)}
                      </strong>
                    </div>
                  </div>
                );
              })()}

              <div style={styles.modalBtnRow}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEditModal(false)}
                  disabled={submittingEdit}
                  style={{ height: "38px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    height: "38px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                  disabled={submittingEdit}
                >
                  {submittingEdit ? (
                    <span>Saving Changes...</span>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Save & Update Bill</span>
                    </>
                  )}
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
  successBanner: {
    background: "var(--accent-green-glow)",
    color: "var(--accent-green)",
    border: "1px solid rgba(74, 222, 128, 0.2)",
    padding: "12px 20px",
    borderRadius: "var(--radius-sm)",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "14px",
    fontWeight: "600",
  },
  errorBanner: {
    background: "var(--accent-red-glow)",
    color: "var(--accent-red)",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    padding: "12px 20px",
    borderRadius: "var(--radius-sm)",
    display: "flex",
    alignItems: "center",
    gap: "10px",
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
  ordersLayout: {
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
  searchFilterCard: {
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
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
  filterGroup: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  selectFilter: {
    height: "38px",
    padding: "0 12px",
    fontSize: "13px",
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
  ordersList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  orderItem: {
    padding: "16px",
    borderRadius: "var(--radius-sm)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--border)",
    background: "rgba(255,255,255,0.01)",
    cursor: "pointer",
    transition: "var(--transition-fast)",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  orderItemActive: {
    background: "var(--primary-glow)",
    borderColor: "var(--primary)",
  },
  orderItemHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderIdText: {
    fontWeight: "700",
    fontSize: "15px",
  },
  orderItemClient: {
    fontSize: "13px",
    fontWeight: "500",
    color: "var(--text-main)",
  },
  orderItemFooter: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "12px",
  },
  orderItemDate: {
    color: "var(--text-subtle)",
  },
  orderItemTotal: {
    fontWeight: "600",
    color: "var(--text-muted)",
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
    alignItems: "center",
    borderBottom: "1px solid var(--border)",
    paddingBottom: "16px",
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
  detailsHeaderActions: {
    display: "flex",
    gap: "10px",
  },
  printBtn: {
    height: "40px",
    padding: "0 18px",
    gap: "6px",
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
  clientDetailsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
  },
  detailItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
  },
  detailIcon: {
    color: "var(--primary)",
    marginTop: "2px",
  },
  detailLabel: {
    fontSize: "11px",
    color: "var(--text-subtle)",
    textTransform: "uppercase",
    fontWeight: "600",
  },
  detailValue: {
    fontSize: "14px",
    fontWeight: "600",
  },
  itemsTableWrapper: {
    width: "100%",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  tableTh: {
    padding: "10px 12px",
    fontSize: "11px",
    fontWeight: "700",
    color: "var(--text-subtle)",
    textTransform: "uppercase",
    borderBottom: "1px solid var(--border)",
  },
  tableTr: {
    borderBottom: "1px solid var(--border)",
  },
  tableTd: {
    padding: "12px",
    fontSize: "13px",
  },
  financeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    "@media (maxWidth: 768px)": {
      gridTemplateColumns: "1fr",
    }
  },
  financeDetails: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  financeRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "13px",
    fontWeight: "600",
  },
  paymentForm: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  payInputGroup: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  payIcon: {
    position: "absolute",
    left: "14px",
    color: "var(--text-subtle)",
  },
  payInput: {
    paddingLeft: "36px",
    height: "44px",
    fontSize: "15px",
    fontWeight: "700",
  },
  paySubmitBtn: {
    height: "44px",
    width: "100%",
  },
  fullyPaidCard: {
    background: "rgba(34, 197, 94, 0.05)",
    border: "1px solid rgba(34, 197, 94, 0.15)",
    borderRadius: "var(--radius-sm)",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    gap: "8px",
  },
  fullyPaidTitle: {
    color: "var(--accent-green)",
    fontWeight: "700",
    fontSize: "16px",
  },
  fullyPaidDesc: {
    fontSize: "12px",
    color: "var(--text-muted)",
    maxWidth: "240px",
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
