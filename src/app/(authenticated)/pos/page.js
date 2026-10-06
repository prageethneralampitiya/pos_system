"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getNextOrderNumber, getNextQuotationNumber, insertOrderWithRetry } from "@/lib/orderSequence";
import { useAuth } from "@/components/AuthGuard";
import { 
  Plus, 
  Minus, 
  Trash2, 
  UserPlus, 
  Search, 
  FileText, 
  Check, 
  AlertCircle,
  FolderOpen,
  Tag,
  Hash,
  Sparkles,
  User,
  RotateCcw,
  Clock,
  Printer,
  Send,
  DollarSign
} from "lucide-react";

export default function POSPage() {
  const router = useRouter();
  const { profile, signOut } = useAuth();

  // Cart state
  const [cart, setCart] = useState([]);
  const [selectedCartItemId, setSelectedCartItemId] = useState(null);

  // Customer state
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const selectedCustomerRef = useRef(selectedCustomer);
  useEffect(() => {
    selectedCustomerRef.current = selectedCustomer;
  }, [selectedCustomer]);
  const [showCustModal, setShowCustModal] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [showSelectCustModal, setShowSelectCustModal] = useState(true);
  const customerSearchInputRef = useRef(null);
  
  // Lock screen state
  const [isLocked, setIsLocked] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [lockError, setLockError] = useState("");
  const passcodeInputRef = useRef(null);

  useEffect(() => {
    if (isLocked) {
      setTimeout(() => {
        passcodeInputRef.current?.focus();
      }, 100);
    }
  }, [isLocked]);

  useEffect(() => {
    if (showSelectCustModal && !isLocked) {
      setTimeout(() => {
        customerSearchInputRef.current?.focus();
      }, 100);
    }
  }, [showSelectCustModal, isLocked]);
  
  // New Customer Form
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");

  // Payment state
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash"); // 'cash' | 'bank_transfer' | 'pending'
  const [applyOverpaymentToOutstanding, setApplyOverpaymentToOutstanding] = useState(false);
  const [useAdvanceCredit, setUseAdvanceCredit] = useState(false);
  
  // POS Advance Modal States
  const [showPOSAdvanceModal, setShowPOSAdvanceModal] = useState(false);
  const [posAdvanceAmount, setPosAdvanceAmount] = useState("");
  const [posAdvanceMethod, setPosAdvanceMethod] = useState("cash");
  const [savingPOSAdvance, setSavingPOSAdvance] = useState(false);
  const [mobileActiveTab, setMobileActiveTab] = useState("catalog"); // 'catalog' | 'cart'
  const [specialNote, setSpecialNote] = useState("");
  const [showSpecialNoteInput, setShowSpecialNoteInput] = useState(false);

  useEffect(() => {
    if (selectedCustomer && Number(selectedCustomer.outstanding_balance || 0) > 0) {
      setApplyOverpaymentToOutstanding(true);
    } else {
      setApplyOverpaymentToOutstanding(false);
    }
  }, [selectedCustomer]);

  useEffect(() => {
    if (selectedCustomer) {
      const balance = Number(selectedCustomer.outstanding_balance || 0);
      if (balance < 0) {
        const credit = Math.abs(balance);
        const confirmUse = window.confirm(`Customer ${selectedCustomer.name} has ${credit.toFixed(0)} LKR advance credit available. Would you like to apply it to this invoice?`);
        setUseAdvanceCredit(confirmUse);
      } else {
        setUseAdvanceCredit(false);
      }
    } else {
      setUseAdvanceCredit(false);
    }
  }, [selectedCustomer]);
  
  // Custom Product Builder Modal
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customDesc, setCustomDesc] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customQty, setCustomQty] = useState(1);
  // UI states
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [completedOrder, setCompletedOrder] = useState(null);

  // Discount Modal States
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountingItem, setDiscountingItem] = useState(null);
  const [discountType, setDiscountType] = useState("percentage"); // 'percentage' | 'fixed'
  const [discountValue, setDiscountValue] = useState("");

  // Cash Calculator Modal States
  const [showCashCalcModal, setShowCashCalcModal] = useState(false);
  const [cashReceived, setCashReceived] = useState("");

  // Credit / Overpaid amount
  const [creditAmount, setCreditAmount] = useState("");

  // Walk-in Customer Capture Modal
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInCheckoutData, setWalkInCheckoutData] = useState(null);

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const totalAmount = subtotal;
  const isRegisteredCust = selectedCustomer && 
    !selectedCustomer.name.toLowerCase().includes("walk-in") && 
    !selectedCustomer.name.toLowerCase().includes("unknown");

  // Advance credit offset calculations
  const availableCredit = isRegisteredCust && Number(selectedCustomer.outstanding_balance || 0) < 0
    ? Math.abs(Number(selectedCustomer.outstanding_balance))
    : 0;
  const appliedCredit = useAdvanceCredit ? Math.min(totalAmount, availableCredit) : 0;
  const remainingTotal = totalAmount - appliedCredit;

  // For overpaid: balance = -(creditAmount)
  // For cash/transfer with overpayment and checkbox unchecked: balance = 0 (the rest is change)
  // For others: balance = remainingTotal - paid
  const balanceAmount = paymentMethod === "overpaid"
    ? -(Number(creditAmount) || 0)
    : (isRegisteredCust && (paymentMethod === "cash" || paymentMethod === "bank_transfer") && Number(paidAmount || 0) > remainingTotal)
      ? (applyOverpaymentToOutstanding ? remainingTotal - Number(paidAmount || 0) : 0)
      : remainingTotal - Number(paidAmount || 0);

  // Sync paid amount based on payment method selection
  useEffect(() => {
    if (paymentMethod === "pending") {
      setPaidAmount("0");
      setCreditAmount("");
    } else if (paymentMethod === "overpaid") {
      setPaidAmount(remainingTotal.toFixed(0));
      setCreditAmount("");
    } else if (paymentMethod === "cash" || paymentMethod === "bank_transfer") {
      setPaidAmount(remainingTotal.toFixed(0));
      setCreditAmount("");
    }
  }, [paymentMethod, remainingTotal]);

  // Reset payment method if Walk-in customer is selected
  useEffect(() => {
    if (selectedCustomer) {
      const isWalkIn = selectedCustomer.name.toLowerCase().includes("walk-in") || selectedCustomer.name.toLowerCase().includes("unknown");
      if (isWalkIn && paymentMethod === "pending") {
        setPaymentMethod("cash");
      }
    }
  }, [selectedCustomer, paymentMethod]);

  const handleUnlock = async () => {
    if (!profile) return;
    try {
      const { data: dbProfile, error } = await supabase
        .from("profiles")
        .select("passcode")
        .eq("id", profile.id)
        .single();
      
      if (error || !dbProfile) {
        setLockError("Verification failed. Please try again.");
        return;
      }

      if (passcode === dbProfile.passcode) {
        setIsLocked(false);
        setPasscode("");
        setLockError("");
      } else {
        setLockError("Incorrect passcode. Try again.");
        setPasscode("");
      }
    } catch (err) {
      setLockError("Connection issue. Try again.");
    }
  };

  // Idle timeout passcode lock (2 minutes = 120,000ms)
  useEffect(() => {
    let idleTimer;
    
    const resetIdleTimer = () => {
      if (isLocked) return;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        setIsLocked(true);
      }, 120000); // 2 minutes
    };

    const activityEvents = ["mousemove", "keypress", "click", "scroll", "touchstart"];
    activityEvents.forEach(event => window.addEventListener(event, resetIdleTimer));
    
    resetIdleTimer();

    return () => {
      clearTimeout(idleTimer);
      activityEvents.forEach(event => window.removeEventListener(event, resetIdleTimer));
    };
  }, [isLocked]);

  // Global keydown handler to trigger Cash Calculator Modal when Enter is pressed
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Enter") {
        // Ignore keydown if user is currently inside an input/textarea of another active modal or search box
        const activeEl = document.activeElement;
        if (activeEl) {
          const tagName = activeEl.tagName;
          const isInputField = tagName === "INPUT" || tagName === "TEXTAREA" || activeEl.contentEditable === "true";
          
          // Allow Enter key inside cash calculator input or discount input
          if (activeEl.id === "cash-received-input" || activeEl.id === "item-discount-input") {
            return;
          }
          // Do not hijack Enter if user is typing in catalog search or customer search or lock PIN code
          if (
            activeEl.id === "catalog-search-input" || 
            activeEl.id === "customer-search-input" || 
            activeEl.id === "customer-modal-search" ||
            isLocked
          ) {
            return;
          }
          if (isInputField && (showCustModal || showCustomModal || showSelectCustModal || showDiscountModal || showCashCalcModal || showWalkInModal)) {
            return;
          }
        }

        if (cart.length > 0 && !showSelectCustModal && !isLocked && !showCustModal && !showCustomModal && !completedOrder && !showDiscountModal && !showCashCalcModal && !showWalkInModal) {
          e.preventDefault();
          handleCheckout(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, showSelectCustModal, isLocked, showCustModal, showCustomModal, completedOrder, showDiscountModal, showCashCalcModal, showWalkInModal, selectedCustomer, totalAmount]);

  const [products, setProducts] = useState([]);

  useEffect(() => {
    const defaultProducts = [
      { id: "p1", name: "Business Cards (x500)", price: 3500, category: "Cards" },
      { id: "p2", name: "Flex Banner (per sqft)", price: 150, category: "Banners" },
      { id: "p3", name: "Sticker Sheet (A3)", price: 250, category: "Stickers" },
      { id: "p4", name: "Brochure (A4 Tri-fold)", price: 80, category: "Documents" },
      { id: "p5", name: "A4 Document Print (B&W)", price: 15, category: "Documents" },
      { id: "p6", name: "A4 Color Document Print", price: 40, category: "Documents" },
      { id: "p7", name: "ID Card Print & Lanyard", price: 350, category: "Cards" },
      { id: "p8", name: "Letterhead Printing (x100)", price: 1800, category: "Documents" },
    ];

    const loadProducts = async () => {
      try {
        const { data, error } = await supabase
          .from("catalog_items")
          .select("*")
          .order("created_at", { ascending: true });

        if (!error && Array.isArray(data) && data.length > 0) {
          const loadedProducts = data.map(item => ({
            id: item.id,
            name: item.name,
            price: Number(item.price),
            category: item.category || "Uncategorized"
          }));
          setProducts(loadedProducts);
          localStorage.setItem("printx_pos_products", JSON.stringify(loadedProducts));
          return;
        }
      } catch (err) {
        console.error("Failed to load POS catalog items from DB:", err);
      }

      try {
        const savedProducts = localStorage.getItem("printx_pos_products");
        if (savedProducts) {
          setProducts(JSON.parse(savedProducts));
        } else {
          setProducts(defaultProducts);
          localStorage.setItem("printx_pos_products", JSON.stringify(defaultProducts));
        }
      } catch (e) {
        console.error("Failed to load POS catalog items:", e);
        setProducts(defaultProducts);
      }
    };

    loadProducts();
  }, []);

  // Compute categories dynamically based on products array to support user-added categories
  const categories = ["All", ...Array.from(new Set(products.map(p => p.category || "Uncategorized")))];
  const [activeCategory, setActiveCategory] = useState("All");

  useEffect(() => {
    fetchCustomers();

    // Sync shop settings from database
    const loadShopSettingsFromDB = async () => {
      try {
        const { data, error } = await supabase
          .from("shop_settings")
          .select("settings")
          .eq("id", "default")
          .single();
        if (!error && data && data.settings) {
          localStorage.setItem("printx_shop_settings", JSON.stringify(data.settings));
        }
      } catch (err) {
        console.error("Failed to sync shop settings from database:", err);
      }
    };
    loadShopSettingsFromDB();

    // Subscribe to real-time customer updates
    const customersChannel = supabase
      .channel("pos-customers-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        () => {
          fetchCustomers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(customersChannel);
    };
  }, []);

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true });
    
    if (error) {
      console.error("Error fetching customers:", error);
    } else {
      const list = data || [];
      setCustomers(list);
      
      const currentSelected = selectedCustomerRef.current;
      // Auto-select Walk-in Customer if available
      const walkIn = list.find(c => c.name.toLowerCase().includes("walk-in"));
      if (walkIn && !currentSelected) {
        setSelectedCustomer(walkIn);
      } else if (currentSelected) {
        // Update current customer details (outstanding balance) from fresh database list
        const fresh = list.find(c => c.id === currentSelected.id);
        if (fresh) {
          setSelectedCustomer(fresh);
        }
      }
    }
  };

  const calculateItemTotal = (price, qty, discountType, discountValue) => {
    const quantity = qty === "" ? 0 : Number(qty);
    const originalPrice = Number(price || 0);
    const discVal = Number(discountValue || 0);
    let discountedPrice = originalPrice;
    
    if (discountType === "percentage") {
      discountedPrice = Math.max(0, originalPrice - (originalPrice * (discVal / 100)));
    } else if (discountType === "fixed") {
      discountedPrice = Math.max(0, originalPrice - discVal);
    }
    
    return {
      discountedPrice: Number(discountedPrice.toFixed(2)),
      total: Number((quantity * discountedPrice).toFixed(2))
    };
  };

  // Add catalog product to cart
  const handleAddProduct = (prod) => {
    const existing = cart.find(item => item.product_id === prod.id);
    if (existing) {
      // Increment quantity
      setCart(cart.map(item => {
        if (item.product_id === prod.id) {
          const newQty = item.qty + 1;
          const { discountedPrice, total } = calculateItemTotal(item.price, newQty, item.discountType, item.discountValue);
          return { ...item, qty: newQty, discountedPrice, total };
        }
        return item;
      }));
      setSelectedCartItemId(existing.id);
    } else {
      const newItem = {
        id: Date.now(),
        product_id: prod.id,
        name: prod.name,
        qty: 1,
        price: prod.price,
        discountType: "none",
        discountValue: 0,
        discountedPrice: prod.price,
        total: prod.price
      };
      setCart([...cart, newItem]);
      setSelectedCartItemId(newItem.id);
    }
    setErrorMsg("");
  };

  // Add custom typed product
  const handleAddCustomProduct = (e) => {
    e.preventDefault();
    if (!customDesc.trim() || !customPrice || Number(customPrice) <= 0 || Number(customQty) <= 0) return;

    const newItem = {
      id: Date.now(),
      product_id: "custom-" + Date.now(),
      name: customDesc.trim(),
      qty: Number(customQty),
      price: Number(customPrice),
      discountType: "none",
      discountValue: 0,
      discountedPrice: Number(customPrice),
      total: Number((Number(customQty) * Number(customPrice)).toFixed(2))
    };

    setCart([...cart, newItem]);
    setSelectedCartItemId(newItem.id);
    setCustomDesc("");
    setCustomPrice("");
    setCustomQty(1);
    setShowCustomModal(false);
    setErrorMsg("");
  };

  // Adjust quantity from cart listing
  const handleAdjustQty = (itemId, adjustment) => {
    setCart(cart.map(item => {
      if (item.id === itemId) {
        const currentQty = item.qty === "" ? 1 : Number(item.qty);
        const newQty = Math.max(0.01, Number((currentQty + adjustment).toFixed(2)));
        const { discountedPrice, total } = calculateItemTotal(item.price, newQty, item.discountType, item.discountValue);
        return { ...item, qty: newQty, discountedPrice, total };
      }
      return item;
    }));
  };

  // Set quantity to an exact manual value
  const handleSetQty = (itemId, newQty) => {
    setCart(cart.map(item => {
      if (item.id === itemId) {
        const qtyVal = newQty === "" ? "" : Number(newQty);
        const { discountedPrice, total } = calculateItemTotal(item.price, qtyVal, item.discountType, item.discountValue);
        return {
          ...item,
          qty: qtyVal,
          discountedPrice,
          total
        };
      }
      return item;
    }));
  };

  // Prompt the user to enter quantity manually
  const handlePromptQty = () => {
    if (!selectedCartItemId) return;
    const item = cart.find(i => i.id === selectedCartItemId);
    if (!item) return;
    const currentQty = item.qty === "" ? "1" : String(item.qty);
    const input = prompt(`Enter quantity for ${item.name} (e.g. 2.50):`, currentQty);
    if (input === null) return; // Cancelled
    const val = parseFloat(input);
    if (!isNaN(val) && val > 0) {
      handleSetQty(selectedCartItemId, val);
    } else {
      alert("Please enter a valid quantity greater than zero.");
    }
  };

  const handleRemoveItem = (itemId) => {
    setCart(cart.filter(item => item.id !== itemId));
    if (selectedCartItemId === itemId) {
      setSelectedCartItemId(null);
    }
  };

  const handleApplyDiscount = (itemId, type, value) => {
    setCart(cart.map(item => {
      if (item.id === itemId) {
        const { discountedPrice, total } = calculateItemTotal(item.price, item.qty, type, value);
        return {
          ...item,
          discountType: type,
          discountValue: Number(value || 0),
          discountedPrice,
          total
        };
      }
      return item;
    }));
  };

  const handleRemoveDiscount = (itemId) => {
    setCart(cart.map(item => {
      if (item.id === itemId) {
        const { discountedPrice, total } = calculateItemTotal(item.price, item.qty, "none", 0);
        return {
          ...item,
          discountType: "none",
          discountValue: 0,
          discountedPrice,
          total
        };
      }
      return item;
    }));
  };

  const handleVoidOrder = () => {
    if (window.confirm("Are you sure you want to void this active order?")) {
      setCart([]);
      setSelectedCartItemId(null);
      setPaidAmount("");
      setErrorMsg("");
      setSuccessMsg("");
      setSelectedCustomer(null);
      setShowSelectCustModal(true);
    }
  };


  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustName.trim() || !newCustPhone.trim()) {
      setErrorMsg("Customer name and phone number are required.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          name: newCustName.trim(),
          phone: newCustPhone.trim(),
          email: newCustEmail.trim() || null,
          address: newCustAddress.trim() || null,
          outstanding_balance: 0,
          portal_passcode: "1234",
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

      setSelectedCustomer(data);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustEmail("");
      setNewCustAddress("");
      setShowCustModal(false);
      fetchCustomers();
      setShowSelectCustModal(false);
      setSuccessMsg("Customer registered!");
      setTimeout(() => setSuccessMsg(""), 2000);
    } catch (err) {
      setErrorMsg(err.message || "Failed to create customer.");
    }
  };

  const generateWhatsAppLink = (customer, orderNum, orderId, total, paid, balance, itemsList) => {
    if (!customer || !customer.phone || customer.phone === "0000000000") {
      return null;
    }

    // Format phone number
    let phone = customer.phone.replace(/\D/g, "");
    if (phone.startsWith("0")) {
      phone = "94" + phone.substring(1);
    } else if (!phone.startsWith("94") && phone.length === 9) {
      phone = "94" + phone;
    }

    const itemsText = itemsList
      .map(item => `• *${item.name}* (x${item.qty}) - ${Number(item.price).toFixed(0)} LKR`)
      .join("\n");

    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const receiptUrl = `${origin}/orders/${orderId}/print`;

    // Fetch dynamic outstanding balance (which includes the new balance)
    const newOutstandingBalance = Number(customer.outstanding_balance || 0) + balance;

    const message = `Hello *${customer.name}*,\n\n` +
      `Thank you for choosing *PRINT X*! 😊\n\n` +
      `Here are your billing details for Order *${orderNum}*:\n` +
      `----------------------------------------\n` +
      `${itemsText}\n` +
      `----------------------------------------\n` +
      `*Total Amount:* ${total.toFixed(0)} LKR\n` +
      `*Amount Paid:* ${paid.toFixed(0)} LKR\n` +
      `*Remaining Balance:* ${balance.toFixed(0)} LKR\n\n` +
      `*Your Total Outstanding Debt:* ${newOutstandingBalance.toFixed(0)} LKR\n\n` +
      `You can view/print your official receipt here:\n` +
      `${receiptUrl}\n\n` +
      `Thank you for your business! 🙏`;

    return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
  };

  const handlePOSRecordAdvance = async (e) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const amount = parseFloat(posAdvanceAmount);
    if (!amount || amount <= 0) {
      alert("Please enter a valid advance amount greater than zero.");
      return;
    }

    setSavingPOSAdvance(true);
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

      const { orderNum: initialOrderNum } = await getNextOrderNumber(supabase, orderPrefix, year, orderStartNumber);

      // 2. Insert Order for Advance Payment with collision retry
      const { order, orderNum } = await insertOrderWithRetry(
        supabase,
        {
          order_number: initialOrderNum,
          customer_id: selectedCustomer.id,
          total_amount: amount,
          paid_amount: amount,
          balance_amount: 0,
          status: "paid",
          payment_method: posAdvanceMethod,
          items: [{ name: "Advance Payment", qty: 1, price: amount, total: amount }],
          created_by: profile?.username || "Unknown",
          created_at: new Date().toISOString()
        },
        { prefix: orderPrefix, year, startNumber: orderStartNumber }
      );

      // 3. Update customer outstanding balance
      // Since it is an advance payment, it reduces their outstanding balance (moving it negative if credit)
      const { data: latestCust } = await supabase
        .from("customers")
        .select("outstanding_balance")
        .eq("id", selectedCustomer.id)
        .single();
      const latestBalance = latestCust ? Number(latestCust.outstanding_balance || 0) : 0;
      const newBalance = latestBalance - amount;

      const { error: cError } = await supabase
        .from("customers")
        .update({ outstanding_balance: newBalance })
        .eq("id", selectedCustomer.id);
      if (cError) throw cError;

      // 4. Trigger Google Sheets Sync
      try {
        fetch("/api/sync-sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_number: orderNum,
            customer_name: selectedCustomer.name,
            customer_phone: selectedCustomer.phone,
            total_amount: amount,
            paid_amount: amount,
            balance_amount: 0,
            items: [{ name: "Advance Payment", qty: 1, price: amount, total: amount }],
            date: new Date().toISOString()
          })
        });
      } catch (syncErr) {
        console.error("Sheets sync failed:", syncErr);
      }

      setSuccessMsg(`Advance payment of ${amount.toFixed(0)} LKR recorded for ${selectedCustomer.name}!`);
      setShowPOSAdvanceModal(false);
      setPosAdvanceAmount("");
      
      // Store completed order in state to trigger custom printed bill modal
      setCompletedOrder({
        orderNum,
        orderId: order.id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone,
        total: amount,
        paid: amount,
        balance: 0,
        items: [{ name: "Advance Payment", qty: 1, price: amount, total: amount }],
        waLink: null
      });

      fetchCustomers(); // Refetch customer list
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
      alert("Error: " + (err.message || "Failed to record advance payment."));
    } finally {
      setSavingPOSAdvance(false);
    }
  };

  const handleCheckout = async (isQuotation = false) => {
    if (cart.length === 0) {
      setErrorMsg("Please add products to the cart before checking out.");
      return;
    }

    if (cart.some(item => !item.qty || Number(item.qty) <= 0)) {
      setErrorMsg("Please make sure all items have a valid quantity greater than zero.");
      return;
    }

    // For quotations, proceed directly without payment details
    if (isQuotation) {
      await proceedWithCheckout(isQuotation);
      return;
    }

    // For regular orders, check if walk-in customer
    const isWalkIn = !selectedCustomer || selectedCustomer.name.toLowerCase().includes("walk-in") || selectedCustomer.name.toLowerCase().includes("unknown");
    
    if (isWalkIn) {
      // Show walk-in capture modal first
      setWalkInCheckoutData({ isQuotation: false });
      setWalkInName("");
      setWalkInPhone("");
      setShowWalkInModal(true);
      return;
    }

    // For regular customers, show cash calculator
    setCashReceived(totalAmount.toFixed(0));
    setShowCashCalcModal(true);
  };

  const proceedWithCheckout = async (isQuotation = false) => {
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const date = new Date();
      const year = date.getFullYear();

      // Load bill series settings
      let orderPrefix = "ORD";
      let orderStartNumber = 1;
      try {
        const s = JSON.parse(localStorage.getItem("printx_shop_settings") || "{}");
        if (s.orderPrefix) orderPrefix = s.orderPrefix;
        if (s.orderStartNumber) orderStartNumber = Math.max(1, parseInt(s.orderStartNumber) || 1);
      } catch (_) {}

      // Resolve Customer to Use (default to Walk-in Customer if none selected)
      let customerToUse = null;
      const isSelectedWalkIn = selectedCustomer && (selectedCustomer.name.toLowerCase().includes("walk-in") || selectedCustomer.name.toLowerCase().includes("unknown"));
      
      if (selectedCustomer && !isSelectedWalkIn) {
        customerToUse = selectedCustomer;
      } else {
        const walkIn = customers.find(c => c.name.toLowerCase().includes("walk-in") || c.name.toLowerCase().includes("unknown"));
        if (walkIn) {
          customerToUse = { ...walkIn };
          if (walkInName.trim() && walkInName !== "Walk-in Customer") {
            customerToUse.name = walkInName.trim();
          }
          if (walkInPhone.trim() && walkInPhone !== "0000000000") {
            customerToUse.phone = walkInPhone.trim();
          }
        } else {
          // Auto create Walk-in Customer in database
          const { data: newWalkIn, error: createError } = await supabase
            .from("customers")
            .insert({
              name: walkInName.trim() || "Walk-in Customer",
              phone: walkInPhone.trim() || "0000000000",
              outstanding_balance: 0,
              created_at: new Date().toISOString()
            })
            .select()
            .single();
          if (createError) throw new Error("Failed to auto-create Walk-in Customer: " + createError.message);
          customerToUse = newWalkIn;
          fetchCustomers(); // Refetch
        }
      }

      // Check walk-in constraints
      const isWalkIn = customerToUse.name.toLowerCase().includes("walk-in") || customerToUse.name.toLowerCase().includes("unknown");
      if (paymentMethod === "pending" && isWalkIn && !isQuotation) {
        setErrorMsg("Pending Payment requires a registered customer. Walk-in / Unknown clients cannot have unpaid bills.");
        setSubmitting(false);
        return;
      }
      // Block credit (overpayment) for walk-in customers
      if (balanceAmount < 0 && isWalkIn && !isQuotation) {
        setErrorMsg("Credit/advance payments are only allowed for registered customers. Please select or create a customer profile.");
        setSubmitting(false);
        return;
      }

      if (isQuotation) {
        const { quotationNum } = await getNextQuotationNumber(supabase, year);

        // 2. Insert Quotation
        const { data: quotation, error: qError } = await supabase
          .from("quotations")
          .insert({
            quotation_number: quotationNum,
            customer_id: customerToUse.id,
            total_amount: totalAmount,
            special_note: specialNote.trim() || null,
            items: cart.map(item => ({ 
              name: item.name, 
              qty: item.qty, 
              price: item.price, 
              discount_type: item.discountType || "none",
              discount_value: item.discountValue || 0,
              discounted_price: item.discountedPrice || item.price,
              total: item.total 
            })),
            created_by: profile.id,
            created_at: new Date().toISOString(),
            converted_to_order: false
          })
          .select()
          .single();

        if (qError) throw qError;

        setSuccessMsg(`Quotation ${quotationNum} Saved!`);
        setCart([]);
        setPaidAmount("");
        setSpecialNote("");
        setShowSpecialNoteInput(false);
        setSelectedCartItemId(null);

        setTimeout(() => {
          router.push("/quotations");
        }, 1500);

      } else {
        const { orderNum: calculatedOrderNum } = await getNextOrderNumber(supabase, orderPrefix, year, orderStartNumber);

        const isRegisteredCust = customerToUse && 
          !customerToUse.name.toLowerCase().includes("walk-in") && 
          !customerToUse.name.toLowerCase().includes("unknown");

        // Calculate advance credit details
        const availableCredit = isRegisteredCust && Number(customerToUse.outstanding_balance || 0) < 0
          ? Math.abs(Number(customerToUse.outstanding_balance))
          : 0;
        const appliedCredit = useAdvanceCredit ? Math.min(totalAmount, availableCredit) : 0;
        const remainingTotal = totalAmount - appliedCredit;

        // Calculate actual checkout balance and effective paid amount taking checkbox and credit offset into account
        const checkoutBalance = paymentMethod === "overpaid"
          ? -(Number(creditAmount) || 0)
          : (isRegisteredCust && (paymentMethod === "cash" || paymentMethod === "bank_transfer") && Number(paidAmount || 0) > remainingTotal)
            ? (applyOverpaymentToOutstanding ? remainingTotal - Number(paidAmount || 0) : 0)
            : remainingTotal - Number(paidAmount || 0);

        const effectivePaid = paymentMethod === "overpaid"
          ? totalAmount + (Number(creditAmount) || 0)
          : (isRegisteredCust && (paymentMethod === "cash" || paymentMethod === "bank_transfer") && Number(paidAmount || 0) > remainingTotal)
            ? (applyOverpaymentToOutstanding ? Number(paidAmount || 0) + appliedCredit : totalAmount)
            : Number(paidAmount || 0) + appliedCredit;

        const storedMethod = paymentMethod === "overpaid" ? "cash" : (useAdvanceCredit && remainingTotal === 0 ? "advance_deduction" : paymentMethod);

        let orderStatus = "pending";
        if (checkoutBalance <= 0) {
          orderStatus = "paid";
        } else if (effectivePaid > 0) {
          orderStatus = "partially_paid";
        }

        // 2. Insert Order with collision retry
        const { order, orderNum } = await insertOrderWithRetry(
          supabase,
          {
            order_number: calculatedOrderNum,
            customer_id: customerToUse.id,
            total_amount: totalAmount,
            paid_amount: effectivePaid,
            balance_amount: checkoutBalance,
            status: orderStatus,
            payment_method: storedMethod,
            special_note: specialNote.trim() || null,
            items: cart.map(item => ({ 
              name: item.name, 
              qty: item.qty, 
              price: item.price, 
              discount_type: item.discountType || "none",
              discount_value: item.discountValue || 0,
              discounted_price: item.discountedPrice || item.price,
              total: item.total 
            })),
            created_by: profile.id,
            created_at: new Date().toISOString()
          },
          { prefix: orderPrefix, year, startNumber: orderStartNumber }
        );

        // 3. Update customer outstanding balance
        // We adjust their balance by the applied credit (spent credit increases outstanding balance)
        // plus any checkout balance (unpaid portion of remaining total)
        const balanceAdjustment = appliedCredit + checkoutBalance;
        if (balanceAdjustment !== 0) {
          const { data: latestCust } = await supabase
            .from("customers")
            .select("outstanding_balance")
            .eq("id", customerToUse.id)
            .single();
          const latestBalance = latestCust ? Number(latestCust.outstanding_balance || 0) : 0;
          const newOutstanding = latestBalance + balanceAdjustment;
          const { error: uError } = await supabase
            .from("customers")
            .update({ outstanding_balance: newOutstanding })
            .eq("id", customerToUse.id);
          if (uError) console.error("Failed to update customer balance:", uError);
        }

        // 4. Send to Google Sheets (async sync)
        try {
          fetch("/api/sync-sheets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_number: orderNum,
              customer_name: customerToUse.name,
              customer_phone: customerToUse.phone,
              total_amount: totalAmount,
              paid_amount: effectivePaid,
              balance_amount: checkoutBalance,
              items: cart.map(item => ({ 
                name: item.name, 
                qty: item.qty, 
                price: item.price, 
                discount_type: item.discountType || "none",
                discount_value: item.discountValue || 0,
                discounted_price: item.discountedPrice || item.price,
                total: item.total 
              })),
              date: new Date().toISOString()
            })
          });
        } catch (syncErr) {
          console.error("Sheets sync failed:", syncErr);
        }

        setSuccessMsg(`Order ${orderNum} Created Successfully!`);
        
        // If not walk-in customer, OR if a phone number was entered during walk-in modal checkout:
        let waLink = null;
        const hasCustomPhone = walkInPhone && walkInPhone.trim() && walkInPhone.trim() !== "0000000000";
        if (!isWalkIn || hasCustomPhone) {
          waLink = generateWhatsAppLink(
            customerToUse,
            orderNum,
            order.id,
            totalAmount,
            effectivePaid,
            checkoutBalance,
            cart
          );
          if (waLink) {
            window.open(waLink, "whatsapp_window");
          }
        }

        // Store completed order in state to trigger custom printed bill modal
        setCompletedOrder({
          orderNum,
          orderId: order.id,
          customerName: customerToUse.name,
          customerPhone: customerToUse.phone,
          total: totalAmount,
          paid: effectivePaid,
          balance: checkoutBalance,
          items: cart,
          waLink: waLink
        });

        setCart([]);
        setPaidAmount("");
        setCreditAmount("");
        setSelectedCartItemId(null);
        setSpecialNote("");
        setShowSpecialNoteInput(false);
        // Clear walk-in state
        setWalkInName("");
        setWalkInPhone("");
        setWalkInCheckoutData(null);
        setApplyOverpaymentToOutstanding(false); // Reset checkbox state
        setUseAdvanceCredit(false); // Reset credit offset checkbox state
        fetchCustomers(); // Refetch to update in-memory client list and selectedCustomer's balance
      }
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong. Please check again.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = products.filter(prod => {
    const matchesCategory = activeCategory === "All" || prod.category === activeCategory;
    const matchesSearch = prod.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const filteredCustomers = customers.filter(cust => {
    return (
      cust.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
      cust.phone.includes(customerSearchQuery)
    );
  });

  return (
    <div className="pos-wrapper" style={styles.posWrapper}>
      {/* Top Banner Notifications */}
      {successMsg && (
        <div style={styles.notificationOverlay}>
          <div style={styles.successBanner} className="animate-slide-down">
            <Check size={16} />
            <span>{successMsg}</span>
          </div>
        </div>
      )}
      {errorMsg && (
        <div style={styles.notificationOverlay}>
          <div style={styles.errorBanner} className="animate-slide-down">
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {profile?.passcode === "1234" && (
        <div style={{
          background: "var(--accent-red-glow)",
          color: "var(--accent-red)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          padding: "10px 16px",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "13px",
          fontWeight: "600",
          marginBottom: "4px",
        }}>
          <AlertCircle size={16} />
          <span>Security Warning: You are using the default staff passcode PIN "1234". Please go to <Link href="/settings" style={{ color: "#ffffff", textDecoration: "underline" }}>Settings</Link> to change it.</span>
        </div>
      )}

      {/* Mobile Tabs Switcher */}
      <div className="pos-mobile-tabs no-print">
        <button 
          type="button"
          onClick={() => setMobileActiveTab("catalog")} 
          className={`pos-mobile-tab ${mobileActiveTab === "catalog" ? "active" : ""}`}
        >
          📦 Catalog
        </button>
        <button 
          type="button"
          onClick={() => setMobileActiveTab("cart")} 
          className={`pos-mobile-tab ${mobileActiveTab === "cart" ? "active" : ""}`}
        >
          🛒 Cart ({cart.reduce((sum, item) => sum + Number(item.qty || 0), 0)})
        </button>
      </div>

      <div className={`pos-grid ${mobileActiveTab === "cart" ? "show-cart" : "show-catalog"}`} style={styles.posGrid}>
        {/* LEFT PANEL: BILLING & ACTIVE CART */}
        <section className="pos-left-panel glass-panel" style={styles.leftPanel}>
          
          <div style={styles.cartHeader}>
            <button 
              onClick={() => {
                if (selectedCartItemId) {
                  handleRemoveItem(selectedCartItemId);
                }
              }} 
              style={styles.cartActionBtnRed}
              disabled={!selectedCartItemId}
            >
              <Trash2 size={16} />
              <span>Delete</span>
            </button>
            
            <div style={styles.cartHeaderTitle}>
              <span>Active Bill</span>
            </div>

            <button 
              onClick={handlePromptQty}
              style={styles.cartActionBtn}
              disabled={!selectedCartItemId}
              title="Enter manual quantity"
            >
              <Plus size={16} />
              <span>Qty</span>
            </button>
          </div>
 
          {/* Cart Scrollable Items List */}
          <div style={styles.cartItemsScroll}>
            {cart.length === 0 ? (
              <div style={styles.emptyCartPlaceholder}>
                <Sparkles size={32} style={{ color: "var(--text-subtle)", opacity: 0.3, marginBottom: "12px" }} />
                <p>Register order items by selecting catalog panels on the right.</p>
              </div>
            ) : (
              cart.map((item) => {
                const isSelected = selectedCartItemId === item.id;
                return (
                  <div 
                    key={item.id} 
                    onClick={() => setSelectedCartItemId(item.id)}
                    style={{
                      ...styles.cartRow,
                      ...(isSelected ? styles.cartRowSelected : {})
                    }}
                  >
                    <div style={styles.cartRowHeader}>
                      <span style={styles.cartRowName}>{item.name}</span>
                      <span style={styles.cartRowQty}>{item.qty}</span>
                    </div>
                    <div style={styles.cartRowDetails}>
                      <div>
                        <span>{item.qty} x {item.price} LKR</span>
                        {item.discountType && item.discountType !== "none" && (
                          <span style={{ color: "var(--accent-orange)", fontSize: "11px", marginLeft: "6px" }}>
                            (-{item.discountType === "percentage" ? `${item.discountValue}%` : `${item.discountValue} LKR`})
                          </span>
                        )}
                      </div>
                      <span style={styles.cartRowTotal}>{item.total} LKR</span>
                    </div>
 
                    {/* Touch quantity adjustment overlay */}
                    {isSelected && (
                      <div style={styles.rowControls}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span style={styles.controlLabel}>Manual Qty</span>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <button onClick={(e) => { e.stopPropagation(); handleAdjustQty(item.id, -1); }} style={styles.controlBtn}>
                              <Minus size={14} />
                            </button>
                            <input 
                              type="number"
                              min="0.01"
                              step="any"
                              value={item.qty}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val > 0) {
                                  handleSetQty(item.id, val);
                                } else if (e.target.value === "") {
                                  handleSetQty(item.id, "");
                                }
                              }}
                              onBlur={() => {
                                if (item.qty === "" || Number(item.qty) <= 0) {
                                  handleSetQty(item.id, 1);
                                }
                              }}
                              style={styles.controlQtyInput}
                            />
                            <button onClick={(e) => { e.stopPropagation(); handleAdjustQty(item.id, 1); }} style={styles.controlBtn}>
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Item-level discount trigger */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: '8px', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '8px' }} onClick={(e) => e.stopPropagation()}>
                          <span style={styles.controlLabel}>Item Discount</span>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setDiscountingItem(item);
                                setDiscountType(item.discountType === "none" ? "percentage" : item.discountType);
                                setDiscountValue(item.discountType === "none" ? "" : String(item.discountValue));
                                setShowDiscountModal(true);
                              }}
                              style={{
                                background: item.discountType !== "none" ? "var(--accent-orange-glow)" : "var(--bg-surface-elevated)",
                                border: "1px solid " + (item.discountType !== "none" ? "var(--accent-orange)" : "var(--border)"),
                                color: item.discountType !== "none" ? "var(--accent-orange)" : "var(--text-muted)",
                                padding: "4px 8px",
                                borderRadius: "var(--radius-sm)",
                                fontSize: "11px",
                                fontWeight: "600",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px"
                              }}
                            >
                              <Tag size={10} />
                              <span>
                                {item.discountType === "percentage" 
                                  ? `-${item.discountValue}%` 
                                  : item.discountType === "fixed" 
                                    ? `-${item.discountValue} LKR` 
                                    : "Apply Disc"}
                              </span>
                            </button>
                            {item.discountType !== "none" && (
                              <button
                                type="button"
                                onClick={() => handleRemoveDiscount(item.id)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "var(--accent-red)",
                                  fontSize: "11px",
                                  cursor: "pointer",
                                  padding: "2px"
                                }}
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Cart Financial Summary & Checkout */}
          <div style={styles.cartTotalsBox}>
            <div style={styles.grandTotalRow}>
              <span>Total</span>
              <span>{totalAmount.toFixed(0)} LKR</span>
            </div>
            {useAdvanceCredit && (
              <div style={{ ...styles.balanceRow, color: "var(--accent-green)", fontWeight: 600 }}>
                <span>Applied Advance Credit:</span>
                <span>-{appliedCredit.toFixed(0)} LKR</span>
              </div>
            )}
            {useAdvanceCredit && (
              <div style={{ ...styles.grandTotalRow, fontSize: "15px", marginTop: "4px", borderTop: "1px dashed var(--border)" }}>
                <span>Remaining to Pay:</span>
                <span>{remainingTotal.toFixed(0)} LKR</span>
              </div>
            )}
            
            {/* Payment Method Selector */}
            <div style={styles.methodSelectorBox}>
              <div style={styles.methodButtons}>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  style={{
                    ...styles.methodBtn,
                    ...(paymentMethod === "cash" ? styles.methodBtnActive : {})
                  }}
                  disabled={cart.length === 0}
                >
                  💵 Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("bank_transfer")}
                  style={{
                    ...styles.methodBtn,
                    ...(paymentMethod === "bank_transfer" ? styles.methodBtnActive : {})
                  }}
                  disabled={cart.length === 0}
                >
                  🏦 Transfer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const isWalkIn = !selectedCustomer || selectedCustomer.name.toLowerCase().includes("walk-in") || selectedCustomer.name.toLowerCase().includes("unknown");
                    if (isWalkIn) {
                      alert("Pending payment is only allowed for registered customers. Please select or create a customer profile first.");
                      return;
                    }
                    setPaymentMethod("pending");
                  }}
                  style={{
                    ...styles.methodBtn,
                    ...(paymentMethod === "pending" ? styles.methodBtnActive : {}),
                    ...((!selectedCustomer || selectedCustomer.name.toLowerCase().includes("walk-in") || selectedCustomer.name.toLowerCase().includes("unknown")) ? styles.methodBtnDisabled : {})
                  }}
                  disabled={cart.length === 0}
                >
                  ⏳ Pending
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const isWalkIn = !selectedCustomer || selectedCustomer.name.toLowerCase().includes("walk-in") || selectedCustomer.name.toLowerCase().includes("unknown");
                    if (isWalkIn) {
                      alert("Overpaid / credit is only allowed for registered customers. Please select a customer first.");
                      return;
                    }
                    setPaymentMethod("overpaid");
                  }}
                  style={{
                    ...styles.methodBtn,
                    ...(paymentMethod === "overpaid" ? { ...styles.methodBtnActive, background: "rgba(34,197,94,0.18)", borderColor: "var(--accent-green)", color: "var(--accent-green)" } : {}),
                    ...((!selectedCustomer || selectedCustomer.name.toLowerCase().includes("walk-in") || selectedCustomer.name.toLowerCase().includes("unknown")) ? styles.methodBtnDisabled : {})
                  }}
                  disabled={cart.length === 0}
                >
                  💚 Overpaid
                </button>
              </div>
            </div>

            {/* Overpaid: credit input */}
            {paymentMethod === "overpaid" && (
              <div style={{ marginTop: "8px", padding: "10px 12px", background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "8px" }}>
                <div style={{ fontSize: "11px", color: "var(--accent-green)", fontWeight: 600, marginBottom: "8px" }}>💚 Bill fully paid — enter the extra credit amount received:</div>
                <div style={styles.settleInputContainer}>
                  <span style={styles.settleLabel}>Credit Amount:</span>
                  <input
                    type="number"
                    placeholder="Extra LKR received"
                    style={styles.settleInput}
                    value={creditAmount}
                    min={1}
                    onChange={(e) => setCreditAmount(e.target.value)}
                    autoFocus
                  />
                </div>
                {creditAmount && Number(creditAmount) > 0 && (
                  <div style={{ fontSize: "12px", color: "var(--accent-green)", marginTop: "6px", fontWeight: 600 }}>
                    💚 {Number(creditAmount).toFixed(0)} LKR will be saved as account credit for {selectedCustomer?.name}.
                  </div>
                )}
              </div>
            )}

            {/* Normal paid amount field (not shown for overpaid) */}
            {paymentMethod !== "overpaid" && (
              <div style={styles.settleInputContainer}>
                <span style={styles.settleLabel}>Amount Paid:</span>
                <input
                  type="number"
                  placeholder="LKR Paid"
                  style={styles.settleInput}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  disabled={cart.length === 0 || paymentMethod === "pending"}
                />
              </div>
            )}

            {/* Checkbox for available advance credit offset */}
            {selectedCustomer && Number(selectedCustomer.outstanding_balance || 0) < 0 && (
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "8px", 
                marginTop: "10px", 
                marginBottom: "10px",
                padding: "8px 12px", 
                background: "rgba(16, 185, 129, 0.06)", 
                border: "1px solid rgba(16, 185, 129, 0.2)", 
                borderRadius: "8px" 
              }}>
                <input
                  type="checkbox"
                  id="useAdvance"
                  checked={useAdvanceCredit}
                  onChange={(e) => setUseAdvanceCredit(e.target.checked)}
                  style={{ cursor: "pointer", width: "16px", height: "16px" }}
                />
                <label htmlFor="useAdvance" style={{ fontSize: "11px", color: "var(--text-main)", cursor: "pointer", fontWeight: 600, userSelect: "none" }}>
                  Use available advance credit ({Math.abs(selectedCustomer.outstanding_balance).toFixed(0)} LKR)
                </label>
              </div>
            )}

            {/* Checkbox for applying overpayment to outstanding balance */}
            {selectedCustomer && 
             !selectedCustomer.name.toLowerCase().includes("walk-in") && 
             !selectedCustomer.name.toLowerCase().includes("unknown") && 
             (paymentMethod === "cash" || paymentMethod === "bank_transfer") && 
             Number(paidAmount || 0) > remainingTotal && (
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "8px", 
                marginTop: "10px", 
                marginBottom: "10px",
                padding: "8px 12px", 
                background: "rgba(59, 130, 246, 0.06)", 
                border: "1px solid rgba(59, 130, 246, 0.2)", 
                borderRadius: "8px" 
              }}>
                <input
                  type="checkbox"
                  id="applyOverpayment"
                  checked={applyOverpaymentToOutstanding}
                  onChange={(e) => setApplyOverpaymentToOutstanding(e.target.checked)}
                  style={{ cursor: "pointer", width: "16px", height: "16px" }}
                />
                <label htmlFor="applyOverpayment" style={{ fontSize: "11px", color: "var(--text-main)", cursor: "pointer", fontWeight: 500, userSelect: "none" }}>
                  Apply extra {(Number(paidAmount) - remainingTotal).toFixed(0)} LKR to outstanding balance (reduce debt)
                </label>
              </div>
            )}

            {paymentMethod !== "overpaid" && paidAmount && (
              <div style={styles.balanceRow}>
                {balanceAmount > 0 ? (
                  <>
                    <span>Balance Due:</span>
                    <span style={{ color: "var(--accent-orange)", fontWeight: 700 }}>
                      {balanceAmount.toFixed(0)} LKR
                    </span>
                  </>
                ) : balanceAmount === 0 ? (
                  <>
                    <span>Balance Due:</span>
                    <span style={{ color: "var(--accent-green)", fontWeight: 700 }}>Fully Paid ✓</span>
                  </>
                ) : balanceAmount < 0 ? (
                  <>
                    <span>Excess to Account Credit:</span>
                    <span style={{ color: "var(--accent-green)", fontWeight: 700 }}>
                      {Math.abs(balanceAmount).toFixed(0)} LKR
                    </span>
                  </>
                ) : null}
              </div>
            )}

            {paymentMethod !== "overpaid" && Number(paidAmount || 0) > remainingTotal && !applyOverpaymentToOutstanding && (
              <div style={{ ...styles.balanceRow, marginTop: "4px" }}>
                <span>Change to return:</span>
                <span style={{ color: "#3b82f6", fontWeight: 700 }}>
                  {(Number(paidAmount) - remainingTotal).toFixed(0)} LKR
                </span>
              </div>
            )}

            {/* Special Note Button & Input */}
            <div style={{ marginTop: "12px", borderTop: "1px dashed var(--border)", paddingTop: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <FileText size={13} style={{ color: specialNote ? "var(--primary)" : "var(--text-muted)" }} />
                  Special Note
                </span>
                <button
                  type="button"
                  onClick={() => setShowSpecialNoteInput(!showSpecialNoteInput)}
                  style={{
                    background: showSpecialNoteInput || specialNote ? "rgba(99, 102, 241, 0.15)" : "none",
                    border: "1px solid var(--border)",
                    borderRadius: "4px",
                    color: showSpecialNoteInput || specialNote ? "var(--primary)" : "var(--text-muted)",
                    padding: "4px 8px",
                    fontSize: "11px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    transition: "var(--transition-fast)"
                  }}
                >
                  📝 {specialNote ? "Edit Note" : "Add Note"}
                </button>
              </div>
              
              {(showSpecialNoteInput || specialNote) && (
                <div style={{ marginTop: "8px" }} className="animate-fade-in">
                  <textarea
                    placeholder="Type special note to print on invoice..."
                    style={{
                      width: "100%",
                      minHeight: "50px",
                      background: "rgba(15, 23, 42, 0.4)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "8px",
                      fontSize: "12px",
                      color: "var(--text-main)",
                      outline: "none",
                      resize: "none"
                    }}
                    value={specialNote}
                    onChange={(e) => setSpecialNote(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Cart Footer Actions */}
          <div style={styles.cartFooter}>
            <button onClick={handleVoidOrder} style={styles.voidBtn} className="btn btn-danger" disabled={cart.length === 0}>
              <RotateCcw size={16} />
              <span>Void order</span>
            </button>
            <button onClick={() => handleCheckout(true)} style={styles.quoteBtn} className="btn btn-secondary" disabled={cart.length === 0}>
              <FileText size={16} />
              <span>Quotation</span>
            </button>
            <button 
              onClick={() => handleCheckout(false)} 
              style={styles.payBtn} 
              className="btn btn-primary" 
              disabled={cart.length === 0}
            >
              <Check size={16} />
              <span>Payment</span>
            </button>
          </div>
        </section>

        {/* RIGHT PANEL: CATALOG GRID & CLIENT SELECTOR */}
        <section className="pos-right-panel" style={styles.rightPanel}>
          
          {/* Top Row: Client profile Selector */}
          <div className="glass-panel pos-client-bar" style={styles.clientBar}>
            <div style={styles.clientSelector}>
              <User size={16} style={{ color: "var(--primary)" }} />
              {selectedCustomer ? (
                <div style={styles.clientBadge}>
                  <span style={styles.clientNameText}>{selectedCustomer.name}</span>
                  <span style={styles.clientPhoneText}> ({selectedCustomer.phone})</span>
                  <span style={styles.outstandingText}> | Outstanding: {Number(selectedCustomer.outstanding_balance || 0).toFixed(2)} LKR</span>
                </div>
              ) : (
                <span style={styles.noClientText}>Select client profile for this transaction</span>
              )}
            </div>

            <div style={styles.clientActions}>
              <Link 
                href="/dashboard" 
                className="btn btn-danger"
                style={{ ...styles.smallActionBtn, background: "rgba(239, 68, 68, 0.15)", borderColor: "rgba(239, 68, 68, 0.3)", color: "hsl(350, 80%, 65%)" }}
              >
                Exit POS
              </Link>

              {selectedCustomer && 
               !selectedCustomer.name.toLowerCase().includes("walk-in") && 
               !selectedCustomer.name.toLowerCase().includes("unknown") && (
                <button 
                  type="button"
                  onClick={() => setShowPOSAdvanceModal(true)} 
                  className="btn btn-secondary"
                  style={{ ...styles.smallActionBtn, background: "rgba(16, 185, 129, 0.12)", borderColor: "rgba(16, 185, 129, 0.25)", color: "var(--accent-green)" }}
                >
                  <DollarSign size={14} />
                  <span>Receive Advance</span>
                </button>
              )}

              <button 
                type="button" 
                onClick={() => setShowCustModal(true)} 
                className="btn btn-secondary"
                style={styles.smallActionBtn}
              >
                <UserPlus size={14} />
                <span>Add Client</span>
              </button>

              {selectedCustomer && (
                <button 
                  onClick={() => setSelectedCustomer(null)} 
                  className="btn btn-secondary"
                  style={styles.smallActionBtn}
                >
                  Clear Selection
                </button>
              )}
            </div>

            {/* Inline Customer Directory Search Panel (Only visible when no client selected) */}
            {!selectedCustomer && (
              <div style={styles.custSearchOverlay}>
                <div style={styles.custSearchBar}>
                  <Search size={14} style={styles.custSearchIcon} />
                  <input
                    id="customer-search-input"
                    type="text"
                    placeholder="Search directory by phone or name..."
                    className="input-field"
                    style={styles.custSearchInput}
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  />
                </div>
                {customerSearchQuery && (
                  <div style={styles.custResultsDrop} className="glass-panel">
                    {filteredCustomers.length === 0 ? (
                      <div style={styles.emptyResultsMsg}>No customers matched. Click "Add Client" to register.</div>
                    ) : (
                      filteredCustomers.map(cust => (
                        <div 
                          key={cust.id} 
                          onClick={() => { setSelectedCustomer(cust); setCustomerSearchQuery(""); }}
                          style={styles.custResultRow}
                        >
                          <div>
                            <strong>{cust.name}</strong> ({cust.phone})
                          </div>
                          {cust.outstanding_balance > 0 && (
                            <span style={{ color: "var(--accent-orange)", fontSize: "11px" }}>{cust.outstanding_balance} LKR outstanding</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Catalog Operations Bar */}
          <div className="glass-panel pos-operations-bar" style={styles.operationsBar}>
            {/* Category selection */}
            <div style={styles.categoryFilters}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    ...styles.categoryTab,
                    ...(activeCategory === cat ? styles.categoryTabActive : {})
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Catalog search field */}
            <div style={styles.catalogSearchBar}>
              <Search size={16} style={styles.catalogSearchIcon} />
              <input
                id="catalog-search-input"
                type="text"
                placeholder="Search products..."
                className="input-field"
                style={styles.catalogSearchInput}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button 
                onClick={() => setShowCustomModal(true)} 
                className="btn btn-primary"
                style={styles.customAddBtn}
              >
                + Custom Job
              </button>
            </div>
          </div>

          {/* Touch grid of products */}
          <div style={styles.productGridContainer}>
            {filteredProducts.length === 0 ? (
              <div style={styles.emptyProducts}>No items matched the search parameters.</div>
            ) : (
              <div className="pos-product-grid" style={styles.productGrid}>
                {filteredProducts.map(prod => (
                  <div 
                    key={prod.id} 
                    onClick={() => handleAddProduct(prod)}
                    style={styles.productCard}
                    className="glass-panel animate-fade-in"
                  >
                    <div style={styles.prodName}>{prod.name}</div>
                    <div style={styles.prodPrice}>{prod.price} LKR</div>
                  </div>
                ))}

                {/* Grid Item for Custom Print Entry */}
                <div 
                  onClick={() => setShowCustomModal(true)}
                  style={styles.customProductCard}
                  className="glass-panel animate-fade-in"
                >
                  <div style={styles.customCardTitle}>+ Custom Print</div>
                  <div style={styles.customCardSub}>Click to input specific dimensions & rates</div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* NEW CUSTOMER REGISTRATION MODAL */}
      {showCustModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel-elevated animate-fade-in" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Register Client Profile</h3>
            </div>
            <form onSubmit={handleCreateCustomer} style={styles.modalForm}>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Name *</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  required 
                />
              </div>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Phone Number *</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  required 
                />
              </div>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Email</label>
                <input 
                  type="email" 
                  className="input-field" 
                  value={newCustEmail}
                  onChange={(e) => setNewCustEmail(e.target.value)}
                />
              </div>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Address</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                />
              </div>
              <div style={styles.modalBtnRow}>
                <button 
                  type="button" 
                  onClick={() => setShowCustModal(false)} 
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM PRINT JOB INPUT MODAL */}
      {showCustomModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel-elevated animate-fade-in" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Specify Custom Print Job</h3>
            </div>
            <form onSubmit={handleAddCustomProduct} style={styles.modalForm}>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Job Description *</label>
                <input 
                  type="text" 
                  placeholder="e.g. Flex Print 12x4 Glossy"
                  className="input-field" 
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  required 
                />
              </div>

              <div style={styles.formRow}>
                <div style={{ ...styles.modalInputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>Unit Price *</label>
                  <input 
                    type="number" 
                    placeholder="Rate"
                    min="0.01"
                    step="0.01"
                    className="input-field" 
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    required 
                  />
                </div>

                <div style={{ ...styles.modalInputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>Quantity *</label>
                  <input 
                    type="number" 
                    min="0.01"
                    step="any"
                    placeholder="e.g. 2.50"
                    className="input-field" 
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                    required 
                  />
                </div>
              </div>

              <div style={styles.modalBtnRow}>
                <button 
                  type="button" 
                  onClick={() => setShowCustomModal(false)} 
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add to Active Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IDLE PASSCODE LOCK SCREEN */}
      {isLocked && (
        <div style={styles.lockOverlay} className="no-print">
          <div className="glass-panel-elevated animate-fade-in" style={styles.lockCard}>
            <div style={styles.lockIconBox}>
              <Clock size={36} style={{ color: "var(--accent-orange)" }} />
            </div>
            <h2 style={styles.lockTitle}>POS Locked due to Inactivity</h2>
            <p style={styles.lockSubtitle}>
              Please enter your security passcode to unlock this POS terminal session.
            </p>
            
            {/* Passcode Input Field */}
            <input 
              ref={passcodeInputRef}
              type="password"
              placeholder="••••"
              value={passcode}
              onChange={(e) => {
                setLockError("");
                setPasscode(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleUnlock();
                }
              }}
              style={styles.lockInput}
            />

            {lockError && (
              <div style={styles.lockErrorText}>{lockError}</div>
            )}

            {/* Numeric Touch Keypad */}
            <div style={styles.keypadGrid}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button
                  key={num}
                  onClick={() => {
                    setLockError("");
                    setPasscode(prev => prev + num);
                  }}
                  className="keypad-btn"
                  style={styles.keypadBtn}
                >
                  {num}
                </button>
              ))}
              
              {/* Bottom row of keypad */}
              <button
                onClick={() => {
                  setLockError("");
                  setPasscode("");
                }}
                className="keypad-btn"
                style={{ ...styles.keypadBtn, background: "rgba(239, 68, 68, 0.15)", color: "var(--accent-red)" }}
              >
                Clear
              </button>
              
              <button
                onClick={() => {
                  setLockError("");
                  setPasscode(prev => prev + "0");
                }}
                className="keypad-btn"
                style={styles.keypadBtn}
              >
                0
              </button>

              <button
                onClick={handleUnlock}
                className="keypad-btn"
                style={{ ...styles.keypadBtn, background: "rgba(34, 197, 94, 0.15)", color: "var(--accent-green)", fontWeight: "800" }}
              >
                Enter
              </button>
            </div>
            
            <p style={{ fontSize: "11px", color: "var(--text-subtle)", marginTop: "16px", textAlign: "center" }}>
              Logged in as: {profile?.username} ({profile?.role})
              {profile?.passcode === "1234" && (
                <span style={{ color: "var(--accent-orange)", marginLeft: "6px" }}>| Default PIN: 1234</span>
              )}
            </p>
            <button 
              onClick={signOut}
              className="btn btn-secondary"
              style={{ width: "100%", marginTop: "12px", background: "rgba(239, 68, 68, 0.1)", borderColor: "rgba(239, 68, 68, 0.2)", color: "var(--accent-red)", justifyContent: "center" }}
            >
              Sign Out / Switch Account
            </button>
          </div>
        </div>
      )}

      {/* SELECT CLIENT DIALOG (First step, blocking catalog/billing) */}
      {showSelectCustModal && !isLocked && (
        <div style={styles.lockOverlay} className="no-print">
          <div className="glass-panel-elevated animate-fade-in" style={styles.clientSelectCard}>
            <div style={styles.clientSelectIconBox}>
              <User size={32} style={{ color: "var(--primary)" }} />
            </div>
            <h2 style={styles.clientSelectTitle}>Select Client to Start Billing</h2>
            <p style={styles.clientSelectSubtitle}>
              Please select a registered customer profile, or continue as a Walk-in Customer to start adding items.
            </p>
            
            {/* Search Input */}
            <div style={{ ...styles.searchGroup, marginBottom: "16px", background: "rgba(15, 23, 42, 0.6)", padding: "0 10px" }}>
              <Search size={16} style={styles.searchIcon} />
              <input
                id="customer-modal-search"
                ref={customerSearchInputRef}
                type="text"
                placeholder="Search by client name or phone..."
                className="input-field"
                style={{ ...styles.searchInput, background: "none", border: "none" }}
                value={customerSearchQuery}
                onChange={(e) => setCustomerSearchQuery(e.target.value)}
              />
            </div>

            {/* Scrollable list of matches */}
            <div style={styles.clientModalListScroll}>
              {filteredCustomers.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-muted)" }}>
                  No customer profiles found.
                </div>
              ) : (
                filteredCustomers.map(cust => (
                  <div
                    key={cust.id}
                    onClick={() => {
                      setSelectedCustomer(cust);
                      setShowSelectCustModal(false);
                      setCustomerSearchQuery("");
                    }}
                    className="modal-cust-row"
                    style={styles.modalCustRow}
                  >
                    <div>
                      <div style={{ fontWeight: "700", color: "var(--text-main)" }}>{cust.name}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-subtle)", marginTop: "2px" }}>{cust.phone}</div>
                    </div>
                    {Number(cust.outstanding_balance || 0) > 0 && (
                      <span style={styles.modalCustDebtBadge}>Debt: {Number(cust.outstanding_balance).toFixed(0)} LKR</span>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Quick Actions Footer */}
            <div style={styles.clientSelectFooter}>
              <button
                onClick={() => {
                  // Walk-in customer: skip detail form, proceed directly to billing
                  const walkIn = customers.find(c => c.name.toLowerCase().includes("walk-in") || c.name.toLowerCase().includes("unknown"));
                  if (walkIn) {
                    setSelectedCustomer(walkIn);
                  } else {
                    // No walk-in customer in database yet - it will be created on checkout
                    setSelectedCustomer(null);
                  }
                  setShowSelectCustModal(false);
                  setShowCustModal(false); // Ensure registration form never opens for walk-in
                }}
                className="btn btn-secondary"
                style={{ flex: 1, padding: "12px", justifyContent: "center" }}
              >
                Walk-in Customer
              </button>
              
              <button
                onClick={() => {
                  setShowCustModal(true);
                }}
                className="btn btn-primary"
                style={{ padding: "12px 20px" }}
              >
                <Plus size={16} />
                <span>New Profile</span>
              </button>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "12px", width: "100%" }}>
              <Link 
                href="/dashboard"
                className="btn btn-secondary"
                style={{ flex: 1, padding: "8px", justifyContent: "center", fontSize: "12px" }}
              >
                Exit to Dashboard
              </Link>
              <button 
                onClick={signOut}
                className="btn btn-secondary"
                style={{ flex: 1, padding: "8px", justifyContent: "center", fontSize: "12px", color: "var(--accent-red)", borderColor: "rgba(239, 68, 68, 0.2)" }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ITEM DISCOUNT MODAL */}
      {showDiscountModal && discountingItem && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel-elevated animate-fade-in" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Apply Item Discount</h3>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                {discountingItem.name} (Original: {discountingItem.price} LKR)
              </p>
            </div>
            
            <div style={styles.modalForm}>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Discount Type</label>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setDiscountType("percentage")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      background: discountType === "percentage" ? "var(--primary-glow)" : "var(--bg-surface-elevated)",
                      border: "1px solid " + (discountType === "percentage" ? "var(--primary)" : "var(--border)"),
                      color: "var(--text-main)",
                      borderRadius: "var(--radius-sm)",
                      fontWeight: "700",
                      cursor: "pointer"
                    }}
                  >
                    Percentage (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType("fixed")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      background: discountType === "fixed" ? "var(--primary-glow)" : "var(--bg-surface-elevated)",
                      border: "1px solid " + (discountType === "fixed" ? "var(--primary)" : "var(--border)"),
                      color: "var(--text-main)",
                      borderRadius: "var(--radius-sm)",
                      fontWeight: "700",
                      cursor: "pointer"
                    }}
                  >
                    Fixed Amount (LKR)
                  </button>
                </div>
              </div>

              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Discount Value</label>
                <input
                  id="item-discount-input"
                  type="number"
                  autoFocus
                  placeholder={discountType === "percentage" ? "Enter % (e.g. 10)" : "Enter amount in LKR (e.g. 150)"}
                  className="input-field"
                  style={{ height: "40px", fontSize: "14px", width: "100%" }}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (discountValue !== "" && Number(discountValue) >= 0) {
                        handleApplyDiscount(discountingItem.id, discountType, discountValue);
                        setShowDiscountModal(false);
                      }
                    }
                  }}
                />
              </div>

              {/* Live Preview section */}
              {discountValue && Number(discountValue) > 0 && (
                <div className="glass-panel" style={{
                  padding: "12px",
                  background: "rgba(15, 23, 42, 0.4)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Original Unit Price:</span>
                    <span>{discountingItem.price} LKR</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Unit Price Reduction:</span>
                    <span style={{ color: "var(--accent-orange)" }}>
                      -{discountType === "percentage" 
                        ? `${(discountingItem.price * (Number(discountValue) / 100)).toFixed(0)} LKR (${discountValue}%)` 
                        : `${Number(discountValue).toFixed(0)} LKR`}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "6px", marginTop: "4px" }}>
                    <span style={{ color: "var(--text-muted)", fontWeight: "700" }}>New Unit Price:</span>
                    <strong style={{ color: "var(--accent-green)" }}>
                      {Math.max(0, discountingItem.price - (discountType === "percentage" 
                        ? discountingItem.price * (Number(discountValue) / 100) 
                        : Number(discountValue))).toFixed(0)} LKR
                    </strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Total for {discountingItem.qty} units:</span>
                    <strong>
                      {(discountingItem.qty * Math.max(0, discountingItem.price - (discountType === "percentage" 
                        ? discountingItem.price * (Number(discountValue) / 100) 
                        : Number(discountValue)))).toFixed(0)} LKR
                    </strong>
                  </div>
                </div>
              )}

              <div style={styles.modalBtnRow}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowDiscountModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    if (discountValue !== "" && Number(discountValue) >= 0) {
                      handleApplyDiscount(discountingItem.id, discountType, discountValue);
                      setShowDiscountModal(false);
                    }
                  }}
                  disabled={discountValue === "" || Number(discountValue) < 0}
                >
                  Apply Discount
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CASH PAYMENT CALCULATOR MODAL */}
      {showCashCalcModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel-elevated animate-fade-in" style={{ ...styles.modalCard, maxWidth: "440px" }}>
            <div style={styles.modalHeader}>
              <h3 style={{ ...styles.modalTitle, display: "flex", alignItems: "center", gap: "8px", color: "var(--secondary)" }}>
                💵 Cash & Change Calculator
              </h3>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                Enter the amount received to calculate client change
              </p>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                // Validate if amount received is valid for cash payments
                if (paymentMethod === "cash" && Number(cashReceived || 0) < remainingTotal) {
                  const confirmPartial = window.confirm(`Amount received (${cashReceived} LKR) is less than the remaining invoice amount (${remainingTotal.toFixed(0)} LKR). This will create an outstanding debt of ${(remainingTotal - Number(cashReceived)).toFixed(0)} LKR. Do you want to proceed?`);
                  if (!confirmPartial) return;
                }
                
                // Set paidAmount state to cashReceived
                if (paymentMethod === "cash") {
                  setPaidAmount(cashReceived || "0");
                } else if (paymentMethod === "bank_transfer") {
                  setPaidAmount(remainingTotal.toFixed(0));
                } else {
                  setPaidAmount("0");
                }
                
                setShowCashCalcModal(false);
                // Proceed directly to checkout (don't call handleCheckout again - that would re-trigger walk-in modal)
                await proceedWithCheckout(false);
              }}
              style={styles.modalForm}
            >
              {/* Payment Method Selector inside Calculator */}
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Payment Method</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[
                    { id: "cash", label: "💵 Cash" },
                    { id: "bank_transfer", label: "🏦 Transfer" },
                    { id: "pending", label: "⏳ Pending" }
                  ].map(m => {
                    const isSelected = paymentMethod === m.id;
                    const isWalkIn = !selectedCustomer || selectedCustomer.name.toLowerCase().includes("walk-in") || selectedCustomer.name.toLowerCase().includes("unknown");
                    const isDisabled = m.id === "pending" && isWalkIn;
                    
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          if (isDisabled) {
                            alert("Pending payment requires a registered customer.");
                            return;
                          }
                          setPaymentMethod(m.id);
                          if (m.id === "cash") {
                            setCashReceived(remainingTotal.toFixed(0));
                          } else if (m.id === "bank_transfer") {
                            setCashReceived(remainingTotal.toFixed(0));
                          } else {
                            setCashReceived("0");
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: "8px 4px",
                          background: isSelected ? "var(--secondary-glow)" : "var(--bg-surface-elevated)",
                          border: "1px solid " + (isSelected ? "var(--secondary)" : "var(--border)"),
                          color: isSelected ? "var(--secondary)" : (isDisabled ? "rgba(255,255,255,0.2)" : "var(--text-main)"),
                          borderRadius: "var(--radius-sm)",
                          fontSize: "12px",
                          fontWeight: "700",
                          cursor: isDisabled ? "not-allowed" : "pointer",
                          opacity: isDisabled ? 0.4 : 1
                        }}
                        disabled={isDisabled}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Total Row */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                padding: "10px 14px",
                background: "rgba(99, 102, 241, 0.05)",
                border: "1px solid rgba(99, 102, 241, 0.15)",
                borderRadius: "var(--radius-sm)",
                margin: "4px 0"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-muted)" }}>Invoice Total:</span>
                  <span style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-main)" }}>{totalAmount.toFixed(0)} LKR</span>
                </div>
                {useAdvanceCredit && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--accent-green)" }}>
                     <span style={{ fontSize: "13px", fontWeight: "700" }}>Applied Advance Credit:</span>
                     <span style={{ fontSize: "14px", fontWeight: "700" }}>-{appliedCredit.toFixed(0)} LKR</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px dashed var(--border)", paddingTop: "4px", marginTop: "4px" }}>
                  <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-muted)" }}>Total to Pay:</span>
                  <span style={{ fontSize: "20px", fontWeight: "800", color: "var(--secondary)" }}>{remainingTotal.toFixed(0)} LKR</span>
                </div>
              </div>

              {paymentMethod === "cash" && (
                <>
                  {/* Cash Received Input */}
                  <div style={styles.modalInputGroup}>
                    <label style={styles.modalLabel}>Cash Received from Customer (LKR) *</label>
                    <input
                      id="cash-received-input"
                      type="number"
                      autoFocus
                      required
                      placeholder="0"
                      className="input-field"
                      style={{ height: "46px", fontSize: "18px", fontWeight: "800", width: "100%", color: "var(--text-main)", textAlign: "center" }}
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                    />
                  </div>

                  {/* Quick Select Buttons */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "6px" }}>
                    {[
                      { label: "Exact", value: remainingTotal },
                      { label: "+100", value: Math.ceil(remainingTotal / 100) * 100 },
                      { label: "+500", value: Math.ceil(remainingTotal / 500) * 500 },
                      { label: "+1000", value: Math.ceil(remainingTotal / 1000) * 1000 },
                      { label: "5000", value: 5000 }
                    ].map((btn, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setCashReceived(String(btn.value));
                        }}
                        style={{
                          padding: "8px 2px",
                          background: "var(--bg-surface-elevated)",
                          border: "1px solid var(--border)",
                          color: "var(--text-main)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "11px",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {/* Change output display */}
                  {cashReceived && (
                    <div style={{
                      padding: "12px 16px",
                      borderRadius: "var(--radius-sm)",
                      background: Number(cashReceived) >= remainingTotal ? "var(--accent-green-glow)" : "var(--accent-red-glow)",
                      border: "1px solid " + (Number(cashReceived) >= remainingTotal ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"),
                      textAlign: "center",
                      fontSize: "14px",
                      fontWeight: "700",
                      marginTop: "10px"
                    }}>
                      {Number(cashReceived) >= remainingTotal ? (
                        <div style={{ color: "var(--accent-green)" }}>
                          <span>Change to Return: </span>
                          <strong style={{ fontSize: "18px" }}>
                            {applyOverpaymentToOutstanding ? "0 LKR (Applied to Debt)" : `${(Number(cashReceived) - remainingTotal).toFixed(0)} LKR`}
                          </strong>
                        </div>
                      ) : (
                        <div style={{ color: "var(--accent-orange)" }}>
                          <span>Remaining Debt / Due: </span>
                          <strong style={{ fontSize: "18px" }}>{(remainingTotal - Number(cashReceived)).toFixed(0)} LKR</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Checkbox for applying overpayment in the Modal */}
                  {selectedCustomer && 
                   !selectedCustomer.name.toLowerCase().includes("walk-in") && 
                   !selectedCustomer.name.toLowerCase().includes("unknown") && 
                   Number(cashReceived || 0) > remainingTotal && (
                    <div style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      gap: "8px", 
                      marginTop: "10px", 
                      padding: "10px 12px", 
                      background: "rgba(59, 130, 246, 0.08)", 
                      border: "1px solid rgba(59, 130, 246, 0.25)", 
                      borderRadius: "8px",
                      textAlign: "left"
                    }}>
                      <input
                        type="checkbox"
                        id="modalApplyOverpayment"
                        checked={applyOverpaymentToOutstanding}
                        onChange={(e) => setApplyOverpaymentToOutstanding(e.target.checked)}
                        style={{ cursor: "pointer", width: "16px", height: "16px", flexShrink: 0 }}
                      />
                      <label htmlFor="modalApplyOverpayment" style={{ fontSize: "11px", color: "var(--text-main)", cursor: "pointer", fontWeight: 600, userSelect: "none" }}>
                        Apply extra {(Number(cashReceived) - remainingTotal).toFixed(0)} LKR to outstanding balance (reduce debt)
                      </label>
                    </div>
                  )}
                </>
              )}

              {paymentMethod === "bank_transfer" && (
                <div style={{
                  padding: "16px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(6, 182, 212, 0.05)",
                  border: "1px solid rgba(6, 182, 212, 0.15)",
                  color: "var(--secondary)",
                  textAlign: "center",
                  fontSize: "13px"
                }}>
                  🏦 Bank Transfer Selected: Customer will pay the exact amount via bank transfer. No cash change is needed.
                </div>
              )}

              {paymentMethod === "pending" && (
                <div style={{
                  padding: "16px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--accent-red-glow)",
                  border: "1px solid rgba(239, 68, 68, 0.15)",
                  color: "var(--accent-red)",
                  textAlign: "center",
                  fontSize: "13px"
                }}>
                  ⏳ Pending Payment: Invoice balance of <strong>{totalAmount.toFixed(0)} LKR</strong> will be recorded as outstanding debt under <strong>{selectedCustomer?.name}</strong>.
                </div>
              )}

              <div style={styles.modalBtnRow}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCashCalcModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: "var(--secondary)", borderColor: "var(--secondary)" }}
                >
                  {paymentMethod === "pending" ? "Submit Unpaid Order" : "Confirm & Checkout"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHECKOUT SUCCESS OVERLAY */}
      {completedOrder && (
        <div style={styles.modalOverlay} className="no-print animate-fade-in">
          <div className="glass-panel-elevated" style={{ ...styles.modalCard, maxWidth: "420px", textAlign: "center" }}>
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "var(--accent-green-glow)",
              border: "1px solid rgba(74, 222, 128, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto",
            }}>
              <Check size={28} style={{ color: "var(--accent-green)" }} />
            </div>

            <h3 style={{ fontSize: "20px", fontWeight: "800", color: "var(--text-main)", marginBottom: "6px" }}>
              Order Completed!
            </h3>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "20px" }}>
              Invoice has been registered in the system.
            </p>

            {/* Financial Details Box */}
            <div className="glass-panel" style={{
              padding: "16px",
              background: "rgba(15, 23, 42, 0.4)",
              borderRadius: "var(--radius-sm)",
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              marginBottom: "24px",
              fontSize: "13px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Order Reference:</span>
                <strong style={{ color: "var(--text-main)", fontFamily: "monospace" }}>{completedOrder.orderNum}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Customer Name:</span>
                <span style={{ color: "var(--text-main)", fontWeight: "600" }}>{completedOrder.customerName}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "8px", marginTop: "4px" }}>
                <span style={{ color: "var(--text-muted)" }}>Total Due:</span>
                <strong style={{ color: "var(--text-main)" }}>{completedOrder.total.toFixed(0)} LKR</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Paid amount:</span>
                <strong style={{ color: "var(--accent-green)" }}>{completedOrder.paid.toFixed(0)} LKR</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Balance outstanding:</span>
                <strong style={{ color: completedOrder.balance > 0 ? "var(--accent-orange)" : "var(--accent-green)" }}>
                  {completedOrder.balance.toFixed(0)} LKR
                </strong>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  const printWindow = window.open(`/orders/${completedOrder.orderId}/print`, "_blank");
                  if (printWindow) printWindow.focus();
                }}
                className="btn btn-primary"
                style={{ width: "100%", justifyContent: "center", gap: "8px", padding: "12px", background: "var(--primary)" }}
              >
                <Printer size={18} />
                <span>Print Invoice Slip</span>
              </button>

              {completedOrder.waLink && (
                <button
                  type="button"
                  onClick={() => {
                    window.open(completedOrder.waLink, "whatsapp_window");
                  }}
                  className="btn btn-secondary"
                  style={{ 
                    width: "100%", 
                    justifyContent: "center", 
                    gap: "8px", 
                    padding: "12px",
                    background: "rgba(34, 197, 94, 0.08)", 
                    borderColor: "rgba(34, 197, 94, 0.2)", 
                    color: "hsl(142, 70%, 50%)" 
                  }}
                >
                  <Send size={14} />
                  <span>Resend WhatsApp</span>
                </button>
              )}

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setCompletedOrder(null);
                    setCart([]);
                    setPaidAmount("");
                    setSelectedCartItemId(null);
                    setSelectedCustomer(null);
                    setShowSelectCustModal(true);
                  }}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: "10px", justifyContent: "center", fontSize: "13px" }}
                >
                  New Order
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCompletedOrder(null);
                    router.push("/orders");
                  }}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: "10px", justifyContent: "center", fontSize: "13px" }}
                >
                  View Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WALK-IN CUSTOMER CAPTURE MODAL */}
      {showWalkInModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel-elevated animate-fade-in" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Walk-in Customer Details</h3>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>Optional: Enter phone number to send bill via WhatsApp</p>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              setShowWalkInModal(false);
              setCashReceived(totalAmount.toFixed(0));
              setShowCashCalcModal(true);
            }} style={styles.modalForm}>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Customer Name (Optional)</label>
                <input 
                  type="text" 
                  placeholder="Leave empty to use 'Walk-in Customer'"
                  className="input-field" 
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Phone Number (Optional)</label>
                <input 
                  type="tel" 
                  placeholder="e.g. 0771234567 or 94771234567"
                  className="input-field" 
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                />
                <span style={styles.helpText}>If provided, bill will be sent via WhatsApp</span>
              </div>
              <div style={styles.modalBtnRow}>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowWalkInModal(false);
                    setWalkInName("");
                    setWalkInPhone("");
                    setWalkInCheckoutData(null);
                  }} 
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Proceed to Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* RECEIVE ADVANCE MODAL */}
      {showPOSAdvanceModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel-elevated animate-fade-in" style={{ ...styles.modalCard, maxWidth: "400px" }}>
            <div style={styles.modalHeader}>
              <h3 style={{ ...styles.modalTitle, display: "flex", alignItems: "center", gap: "8px" }}>
                💰 Receive Advance Payment
              </h3>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                Add funds directly to {selectedCustomer?.name}'s account
              </p>
            </div>
            <form onSubmit={handlePOSRecordAdvance} style={styles.modalForm}>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Advance Amount (LKR) *</label>
                <input 
                  type="number" 
                  required
                  placeholder="Enter amount"
                  className="input-field" 
                  style={{ height: "42px", fontSize: "16px", fontWeight: "700" }}
                  value={posAdvanceAmount}
                  onChange={(e) => setPosAdvanceAmount(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Payment Method</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setPosAdvanceMethod("cash")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      background: posAdvanceMethod === "cash" ? "var(--secondary-glow)" : "var(--bg-surface-elevated)",
                      border: "1px solid " + (posAdvanceMethod === "cash" ? "var(--secondary)" : "var(--border)"),
                      color: posAdvanceMethod === "cash" ? "var(--secondary)" : "var(--text-main)",
                      borderRadius: "var(--radius-sm)",
                      fontWeight: "700",
                      cursor: "pointer"
                    }}
                  >
                    💵 Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setPosAdvanceMethod("bank_transfer")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      background: posAdvanceMethod === "bank_transfer" ? "var(--secondary-glow)" : "var(--bg-surface-elevated)",
                      border: "1px solid " + (posAdvanceMethod === "bank_transfer" ? "var(--secondary)" : "var(--border)"),
                      color: posAdvanceMethod === "bank_transfer" ? "var(--secondary)" : "var(--text-main)",
                      borderRadius: "var(--radius-sm)",
                      fontWeight: "700",
                      cursor: "pointer"
                    }}
                  >
                    🏦 Transfer
                  </button>
                </div>
              </div>
              <div style={styles.modalBtnRow}>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowPOSAdvanceModal(false);
                    setPosAdvanceAmount("");
                  }} 
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingPOSAdvance} style={{ background: "var(--secondary)", borderColor: "var(--secondary)" }}>
                  {savingPOSAdvance ? "Saving..." : "Confirm & Issue Receipt"}
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
  posWrapper: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    position: "relative",
    padding: "16px",
    boxSizing: "border-box",
  },
  notificationOverlay: {
    position: "absolute",
    top: 10,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 150,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    width: "100%",
    maxWidth: "400px",
  },
  successBanner: {
    background: "var(--accent-green-glow)",
    color: "var(--accent-green)",
    border: "1px solid rgba(74, 222, 128, 0.2)",
    padding: "10px 16px",
    borderRadius: "var(--radius-sm)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "13px",
    fontWeight: "600",
    boxShadow: "var(--glass-shadow)",
  },
  errorBanner: {
    background: "var(--accent-red-glow)",
    color: "var(--accent-red)",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    padding: "10px 16px",
    borderRadius: "var(--radius-sm)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "13px",
    fontWeight: "600",
    boxShadow: "var(--glass-shadow)",
  },
  posGrid: {
    display: "grid",
    gridTemplateColumns: "380px 1fr",
    gap: "16px",
    height: "100%",
    overflow: "hidden",
    "@media (maxWidth: 991px)": {
      gridTemplateColumns: "1fr",
    }
  },
  // LEFT PANEL STYLES
  leftPanel: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    padding: "12px",
    background: "rgba(11, 15, 25, 0.8)",
  },
  cartHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid var(--border)",
    paddingBottom: "12px",
    marginBottom: "8px",
  },
  cartHeaderTitle: {
    fontSize: "15px",
    fontWeight: "700",
    color: "var(--text-main)",
  },
  cartActionBtn: {
    background: "var(--bg-surface-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-main)",
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: "600",
    borderRadius: "var(--radius-sm)",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    transition: "var(--transition-fast)",
  },
  cartActionBtnRed: {
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    color: "hsl(350, 80%, 65%)",
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: "600",
    borderRadius: "var(--radius-sm)",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    transition: "var(--transition-fast)",
  },
  cartItemsScroll: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    paddingRight: "4px",
    marginBottom: "12px",
  },
  emptyCartPlaceholder: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "40px 20px",
    color: "var(--text-subtle)",
    fontSize: "13px",
  },
  cartRow: {
    padding: "12px 14px",
    borderRadius: "var(--radius-sm)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--border)",
    background: "rgba(255, 255, 255, 0.02)",
    cursor: "pointer",
    transition: "var(--transition-fast)",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  cartRowSelected: {
    background: "var(--primary-glow)",
    borderColor: "var(--primary)",
  },
  cartRowHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cartRowName: {
    fontWeight: "700",
    fontSize: "14px",
    color: "var(--text-main)",
  },
  cartRowQty: {
    fontSize: "13px",
    fontWeight: "700",
    background: "var(--bg-surface-elevated)",
    color: "var(--primary)",
    padding: "2px 8px",
    borderRadius: "var(--radius-sm)",
  },
  cartRowDetails: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "12px",
    color: "var(--text-muted)",
  },
  cartRowTotal: {
    fontWeight: "600",
    color: "var(--text-main)",
  },
  rowControls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "8px",
    paddingTop: "8px",
    borderTop: "1px dashed rgba(255,255,255,0.08)",
  },
  controlBtn: {
    background: "var(--bg-surface-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-main)",
    width: "28px",
    height: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  controlLabel: {
    fontSize: "11px",
    fontWeight: "600",
    textTransform: "uppercase",
    color: "var(--primary)",
  },
  controlQtyInput: {
    background: "rgba(15, 23, 42, 0.4)",
    border: "1px solid var(--border)",
    color: "var(--text-main)",
    width: "48px",
    height: "28px",
    textAlign: "center",
    borderRadius: "var(--radius-sm)",
    fontSize: "12px",
    fontWeight: "600",
    outline: "none",
    margin: "0 6px",
  },
  cartTotalsBox: {
    borderTop: "1px solid var(--border)",
    paddingTop: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginBottom: "12px",
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "13px",
    color: "var(--text-muted)",
  },
  grandTotalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "16px",
    fontWeight: "800",
    color: "var(--text-main)",
    borderTop: "1px dashed var(--border)",
    paddingTop: "8px",
    marginTop: "4px",
  },
  methodSelectorBox: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginTop: "8px",
  },
  methodButtons: {
    display: "flex",
    gap: "6px",
    width: "100%",
  },
  methodBtn: {
    flex: 1,
    height: "32px",
    background: "rgba(255, 255, 255, 0.03)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--border)",
    color: "var(--text-muted)",
    fontSize: "12px",
    fontWeight: "600",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "var(--transition-fast)",
  },
  methodBtnActive: {
    color: "#ffffff",
    background: "var(--primary-glow)",
    borderColor: "var(--primary)",
  },
  methodBtnDisabled: {
    opacity: 0.25,
    cursor: "not-allowed",
  },
  settleInputContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginTop: "8px",
  },
  settleLabel: {
    fontSize: "12px",
    fontWeight: "700",
    color: "var(--text-muted)",
  },
  settleInput: {
    flex: 1,
    height: "36px",
    padding: "0 10px",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid var(--border)",
    color: "var(--text-main)",
    borderRadius: "var(--radius-sm)",
    outline: "none",
    fontWeight: "700",
    textAlign: "right",
  },
  balanceRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "13px",
    fontWeight: "700",
    marginTop: "2px",
  },
  cartFooter: {
    display: "flex",
    gap: "6px",
  },
  voidBtn: {
    flex: 1.2,
    fontSize: "12px",
    padding: "10px 0",
    height: "38px",
    gap: "4px",
  },
  quoteBtn: {
    flex: 1.5,
    fontSize: "12px",
    padding: "10px 0",
    height: "38px",
    gap: "4px",
  },
  payBtn: {
    flex: 1.8,
    fontSize: "12px",
    padding: "10px 0",
    height: "38px",
    background: "var(--accent-green)",
    gap: "4px",
  },
  // RIGHT PANEL STYLES
  rightPanel: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    gap: "12px",
  },
  clientBar: {
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
  },
  clientSelector: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  clientBadge: {
    fontSize: "14px",
    fontWeight: "600",
  },
  clientNameText: {
    color: "var(--text-main)",
  },
  clientPhoneText: {
    color: "var(--text-subtle)",
  },
  outstandingText: {
    color: "var(--accent-orange)",
  },
  noClientText: {
    fontSize: "13px",
    color: "var(--text-subtle)",
  },
  clientActions: {
    display: "flex",
    gap: "8px",
  },
  smallActionBtn: {
    padding: "4px 8px",
    fontSize: "11px",
    height: "28px",
  },
  custSearchOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "var(--bg-surface)",
    zIndex: 20,
    borderRadius: "var(--radius-md)",
    padding: "6px 12px",
    display: "flex",
    alignItems: "center",
  },
  custSearchBar: {
    position: "relative",
    flex: 1,
    display: "flex",
    alignItems: "center",
  },
  custSearchIcon: {
    position: "absolute",
    left: "12px",
    color: "var(--text-subtle)",
  },
  custSearchInput: {
    height: "32px",
    paddingLeft: "32px",
    fontSize: "13px",
  },
  custResultsDrop: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 30,
    maxHeight: "180px",
    overflowY: "auto",
    padding: "6px 0",
  },
  custResultRow: {
    padding: "8px 16px",
    cursor: "pointer",
    fontSize: "13px",
    borderBottom: "1px solid rgba(255,255,255,0.02)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    "&:hover": {
      backgroundColor: "rgba(255,255,255,0.03)",
    }
  },
  emptyResultsMsg: {
    padding: "12px",
    textAlign: "center",
    color: "var(--text-subtle)",
    fontSize: "12px",
  },
  operationsBar: {
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  categoryFilters: {
    display: "flex",
    gap: "8px",
    overflowX: "auto",
    paddingBottom: "2px",
  },
  categoryTab: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    padding: "6px 12px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    borderRadius: "var(--radius-sm)",
    transition: "var(--transition-fast)",
    whiteSpace: "nowrap",
    "&:hover": {
      color: "var(--text-main)",
      backgroundColor: "rgba(255,255,255,0.02)",
    }
  },
  categoryTabActive: {
    color: "var(--text-main)",
    backgroundColor: "var(--primary-glow)",
    borderLeft: "2px solid var(--primary)",
  },
  catalogSearchBar: {
    display: "flex",
    alignItems: "center",
    position: "relative",
    gap: "10px",
  },
  catalogSearchIcon: {
    position: "absolute",
    left: "14px",
    color: "var(--text-subtle)",
  },
  catalogSearchInput: {
    paddingLeft: "40px",
    height: "38px",
    flex: 1,
  },
  customAddBtn: {
    height: "38px",
    padding: "0 14px",
    fontSize: "13px",
    gap: "4px",
  },
  productGridContainer: {
    flex: 1,
    overflowY: "auto",
  },
  emptyProducts: {
    padding: "60px",
    textAlign: "center",
    color: "var(--text-subtle)",
  },
  productGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: "12px",
    paddingBottom: "12px",
  },
  productCard: {
    padding: "20px 16px",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    minHeight: "110px",
    background: "rgba(15,23,42,0.4)",
    border: "1px solid var(--border)",
    transition: "var(--transition-fast)",
    "&:hover": {
      borderColor: "var(--primary)",
      transform: "translateY(-1px)",
      boxShadow: "0 4px 12px 0 var(--primary-glow)",
    }
  },
  prodName: {
    fontWeight: "700",
    fontSize: "14px",
    color: "var(--text-main)",
  },
  prodPrice: {
    fontSize: "13px",
    color: "var(--secondary)",
    fontWeight: "700",
    marginTop: "8px",
    alignSelf: "flex-end",
  },
  customProductCard: {
    padding: "20px 16px",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "110px",
    border: "1px dashed var(--primary)",
    background: "rgba(99, 102, 241, 0.03)",
    textAlign: "center",
    transition: "var(--transition-fast)",
    "&:hover": {
      background: "var(--primary-glow)",
      borderColor: "var(--primary)",
    }
  },
  customCardTitle: {
    fontWeight: "700",
    fontSize: "14px",
    color: "var(--primary)",
  },
  customCardSub: {
    fontSize: "11px",
    color: "var(--text-subtle)",
    marginTop: "6px",
  },
  // MODAL COMMON STYLES
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
  formRow: {
    display: "flex",
    gap: "16px",
  },
  modalBtnRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "10px",
  },
  lockOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(3, 7, 18, 0.85)",
    backdropFilter: "blur(20px)",
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },
  lockCard: {
    background: "var(--bg-glass)",
    border: "1px solid var(--border)",
    padding: "36px 30px",
    borderRadius: "var(--radius-lg)",
    maxWidth: "340px",
    width: "100%",
    boxShadow: "var(--glass-shadow)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  lockIconBox: {
    width: "60px",
    height: "60px",
    borderRadius: "50%",
    background: "rgba(251, 146, 60, 0.1)",
    border: "1px solid rgba(251, 146, 60, 0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "20px",
  },
  lockTitle: {
    fontSize: "18px",
    fontWeight: "800",
    color: "var(--text-main)",
    textAlign: "center",
    marginBottom: "8px",
  },
  lockSubtitle: {
    fontSize: "12px",
    color: "var(--text-muted)",
    textAlign: "center",
    marginBottom: "24px",
    lineHeight: "1.4",
  },
  lockInput: {
    width: "100%",
    padding: "12px",
    background: "rgba(15, 23, 42, 0.6)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-main)",
    fontSize: "20px",
    letterSpacing: "8px",
    textAlign: "center",
    outline: "none",
    marginBottom: "16px",
    fontFamily: "monospace",
  },
  lockErrorText: {
    fontSize: "12px",
    color: "var(--accent-red)",
    marginBottom: "16px",
    fontWeight: "600",
    textAlign: "center",
  },
  keypadGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "10px",
    width: "100%",
  },
  keypadBtn: {
    background: "var(--bg-surface-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-main)",
    padding: "14px",
    fontSize: "18px",
    fontWeight: "700",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "var(--transition-fast)",
  },
  clientSelectCard: {
    background: "var(--bg-glass)",
    border: "1px solid var(--border)",
    padding: "30px",
    borderRadius: "var(--radius-lg)",
    maxWidth: "460px",
    width: "100%",
    boxShadow: "var(--glass-shadow)",
    display: "flex",
    flexDirection: "column",
  },
  clientSelectIconBox: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    background: "rgba(99, 102, 241, 0.1)",
    border: "1px solid rgba(99, 102, 241, 0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "16px",
    alignSelf: "center",
  },
  clientSelectTitle: {
    fontSize: "18px",
    fontWeight: "800",
    color: "var(--text-main)",
    textAlign: "center",
    marginBottom: "8px",
  },
  clientSelectSubtitle: {
    fontSize: "12px",
    color: "var(--text-muted)",
    textAlign: "center",
    marginBottom: "20px",
    lineHeight: "1.4",
  },
  clientModalListScroll: {
    maxHeight: "200px",
    overflowY: "auto",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    background: "rgba(15, 23, 42, 0.4)",
    marginBottom: "20px",
  },
  modalCustRow: {
    padding: "10px 14px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid var(--border)",
    cursor: "pointer",
    transition: "var(--transition-fast)",
  },
  modalCustDebtBadge: {
    fontSize: "10px",
    fontWeight: "700",
    background: "var(--accent-orange-glow)",
    color: "var(--accent-orange)",
    padding: "2px 8px",
    borderRadius: "var(--radius-full)",
    border: "1px solid rgba(251, 146, 60, 0.2)",
  },
  clientSelectFooter: {
    display: "flex",
    gap: "12px",
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
    color: "var(--text-main)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  helpText: {
    fontSize: "11px",
    color: "var(--text-muted)",
    marginTop: "2px",
  },
};
