"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getNextOrderNumber, insertOrderWithRetry } from "@/lib/orderSequence";
import { useAuth } from "@/components/AuthGuard";
import { 
  Search, 
  Printer, 
  FileText, 
  Calendar, 
  User, 
  Phone, 
  CheckSquare, 
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ArrowLeft
} from "lucide-react";

export default function QuotationsPage() {
  const router = useRouter();
  const { profile } = useAuth();

  const [quotations, setQuotations] = useState([]);
  const [selectedQuotation, setSelectedQuotation] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    fetchQuotations();

    // Set up quotations subscription
    const quotesChannel = supabase
      .channel("quotes-list-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quotations" },
        () => {
          fetchQuotations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(quotesChannel);
    };
  }, []);

  const fetchQuotations = async () => {
    try {
      const { data, error } = await supabase
        .from("quotations")
        .select(`
          *,
          customers (*)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setQuotations(data || []);
    } catch (err) {
      console.error("Error fetching quotations:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = (quoteId) => {
    if (!quoteId) return;
    // We can open a print layout or use browser print directly
    const printWindow = window.open(`/orders/quote-${quoteId}/print`, "_blank");
    if (printWindow) {
      printWindow.focus();
    }
  };

  const handleConvertToOrder = async () => {
    if (!selectedQuotation) return;
    setConverting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const date = new Date();
      const year = date.getFullYear();

      let orderPrefix = "ORD";
      let orderStartNumber = 1;
      try {
        const s = JSON.parse(localStorage.getItem("printx_shop_settings") || "{}");
        if (s.orderPrefix) orderPrefix = s.orderPrefix;
        if (s.orderStartNumber) orderStartNumber = Math.max(1, parseInt(s.orderStartNumber) || 1);
      } catch (_) {}

      // 1. Generate Order ID using unified sequence
      const { orderNum: calculatedOrderNum } = await getNextOrderNumber(supabase, orderPrefix, year, orderStartNumber);

      // 2. Insert Order (Outstanding balance becomes full total as default since it was a quotation)
      const { order, orderNum } = await insertOrderWithRetry(
        supabase,
        {
          order_number: calculatedOrderNum,
          customer_id: selectedQuotation.customer_id,
          total_amount: selectedQuotation.total_amount,
          paid_amount: 0,
          balance_amount: selectedQuotation.total_amount,
          status: "pending",
          items: selectedQuotation.items,
          created_by: profile.id,
          created_at: new Date().toISOString(),
          quotation_id: selectedQuotation.id
        },
        { prefix: orderPrefix, year, startNumber: orderStartNumber }
      );

      // 3. Update customer outstanding balance
      const { data: latestCust } = await supabase
        .from("customers")
        .select("outstanding_balance")
        .eq("id", selectedQuotation.customer_id)
        .single();
      const latestBalance = latestCust ? Number(latestCust.outstanding_balance || 0) : 0;
      const { error: custError } = await supabase
        .from("customers")
        .update({
          outstanding_balance: latestBalance + selectedQuotation.total_amount
        })
        .eq("id", selectedQuotation.customer_id);

      if (custError) throw custError;

      // 4. Update Quotation status to converted
      const { error: qError } = await supabase
        .from("quotations")
        .update({
          converted_to_order: true
        })
        .eq("id", selectedQuotation.id);

      if (qError) throw qError;

      // 5. Trigger Google Sheets Sync
      try {
        fetch("/api/sync-sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: order.id,
            order_number: orderNum,
            customer_name: selectedQuotation.customers.name,
            customer_phone: selectedQuotation.customers.phone,
            total_amount: selectedQuotation.total_amount,
            paid_amount: 0,
            balance_amount: selectedQuotation.total_amount,
            status: "pending",
            items: selectedQuotation.items,
            date: date.toISOString(),
          }),
        });
      } catch (syncErr) {
        console.error("Sheets sync failed:", syncErr);
      }

      setSuccessMsg(`Quotation converted to Order ${orderNum}!`);
      
      // Fetch fresh quotes
      fetchQuotations();

      // Redirect to newly created order after 1.5s
      setTimeout(() => {
        router.push(`/orders?id=${order.id}&print=true`);
      }, 1500);

    } catch (err) {
      setErrorMsg(err.message || "Failed to convert quotation.");
    } finally {
      setConverting(false);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      minimumFractionDigits: 0
    }).format(val);
  };

  // Filter list
  const filteredQuotations = quotations.filter(q => 
    q.quotation_number.toLowerCase().includes(searchQuery.toLowerCase()) || 
    q.customers?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    q.customers?.phone?.includes(searchQuery)
  );

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={styles.title}>Quotations Directory</h1>
          <p style={styles.subtitle}>Manage customer price quotes and convert them to live printing orders</p>
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
        <div className="layout-grid" style={styles.layoutGrid}>
          {/* Left panel: list & search */}
          <div style={styles.leftPane}>
            <div className="glass-panel" style={styles.searchCard}>
              <div style={styles.searchGroup}>
                <Search size={16} style={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Quotation ID, client or phone..."
                  className="input-field"
                  style={styles.searchInput}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="glass-panel" style={styles.listCard}>
              {filteredQuotations.length === 0 ? (
                <div style={styles.emptyList}>No quotations found.</div>
              ) : (
                <div style={styles.quotesList}>
                  {filteredQuotations.map(quote => (
                    <div 
                      key={quote.id} 
                      onClick={() => { setSelectedQuotation(quote); setErrorMsg(""); setSuccessMsg(""); }}
                      style={{
                        ...styles.quoteItem,
                        ...(selectedQuotation?.id === quote.id ? styles.quoteItemActive : {})
                      }}
                    >
                      <div style={styles.quoteItemHeader}>
                        <span style={styles.quoteNumText}>{quote.quotation_number}</span>
                        <span className={`badge ${quote.converted_to_order ? "badge-paid" : "badge-pending"}`}>
                          {quote.converted_to_order ? "Converted" : "Active"}
                        </span>
                      </div>
                      <div style={styles.quoteItemClient}>{quote.customers?.name || "Walk-in"}</div>
                      <div style={styles.quoteItemFooter}>
                        <span style={styles.quoteItemDate}>
                          {new Date(quote.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        <span style={styles.quoteItemTotal}>{formatCurrency(quote.total_amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Details */}
          <div className="glass-panel" style={styles.rightPane}>
            {selectedQuotation ? (
              <div style={styles.detailsContainer} className="animate-fade-in">
                {/* Header */}
                <div style={styles.detailsHeader}>
                  <div>
                    <h2 style={styles.detailsTitle}>{selectedQuotation.quotation_number}</h2>
                    <div style={styles.detailsSub}>
                      <Calendar size={12} />
                      <span>{new Date(selectedQuotation.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
                    </div>
                  </div>
                  <div style={styles.detailsHeaderActions}>
                    <button 
                      onClick={() => handlePrint(selectedQuotation.id)} 
                      className="btn btn-secondary"
                      style={styles.printBtn}
                    >
                      <Printer size={16} />
                      <span>Print Quote</span>
                    </button>
                    
                    {!selectedQuotation.converted_to_order && (
                      <button 
                        onClick={handleConvertToOrder} 
                        className="btn btn-primary"
                        style={styles.convertBtn}
                        disabled={converting}
                      >
                        {converting ? <RefreshCw size={16} className="spin" /> : <CheckSquare size={16} />}
                        <span>{converting ? "Converting..." : "Convert to Order"}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Customer */}
                <div style={styles.sectionCard}>
                  <h3 style={styles.sectionTitle}>Client Details</h3>
                  <div style={styles.clientDetailsRow}>
                    <div style={styles.detailItem}>
                      <User size={14} style={styles.detailIcon} />
                      <div>
                        <div style={styles.detailLabel}>Client Name</div>
                        <div style={styles.detailValue}>{selectedQuotation.customers?.name || "Walk-in"}</div>
                      </div>
                    </div>

                    <div style={styles.detailItem}>
                      <Phone size={14} style={styles.detailIcon} />
                      <div>
                        <div style={styles.detailLabel}>Phone Number</div>
                        <div style={styles.detailValue}>{selectedQuotation.customers?.phone || "-"}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div style={styles.sectionCard}>
                  <h3 style={styles.sectionTitle}>Quoted Print Specifications</h3>
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
                        {selectedQuotation.items?.map((item, idx) => (
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

                {/* Summary */}
                <div style={styles.summaryCard}>
                  <div style={styles.summaryRow}>
                    <span style={styles.summaryLabel}>Total Quoted Amount:</span>
                    <span style={styles.summaryValue}>{formatCurrency(selectedQuotation.total_amount)}</span>
                  </div>
                  {selectedQuotation.converted_to_order && (
                    <div style={styles.convertedAlert}>
                      <CheckCircle size={16} />
                      <span>This quotation has already been converted to an active print job.</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={styles.placeholderContainer}>
                <FileText size={48} style={styles.placeholderIcon} />
                <h3 style={styles.placeholderTitle}>Select Price Quotation</h3>
                <p style={styles.placeholderDesc}>Click any active quotation on the left to verify details, print, or convert into a charging invoice.</p>
              </div>
            )}
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
  quotesList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  quoteItem: {
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
  quoteItemActive: {
    background: "var(--primary-glow)",
    borderColor: "var(--primary)",
  },
  quoteItemHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  quoteNumText: {
    fontWeight: "700",
    fontSize: "15px",
  },
  quoteItemClient: {
    fontSize: "13px",
    fontWeight: "500",
    color: "var(--text-main)",
  },
  quoteItemFooter: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "12px",
  },
  quoteItemDate: {
    color: "var(--text-subtle)",
  },
  quoteItemTotal: {
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
  convertBtn: {
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
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
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
  summaryCard: {
    background: "var(--bg-surface-elevated)",
    border: "1px solid var(--border)",
    padding: "20px",
    borderRadius: "var(--radius-sm)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    fontWeight: "700",
    fontSize: "18px",
  },
  summaryLabel: {
    color: "var(--text-muted)",
  },
  summaryValue: {
    color: "var(--text-main)",
  },
  convertedAlert: {
    background: "var(--accent-green-glow)",
    color: "var(--accent-green)",
    border: "1px solid rgba(74, 222, 128, 0.2)",
    padding: "10px 14px",
    borderRadius: "var(--radius-sm)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "13px",
    fontWeight: "600",
  },
};
