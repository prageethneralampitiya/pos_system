/**
 * Robust order, quotation, and payment receipt sequence generation.
 * Prevents PostgREST row-limit truncations and duplicate key violations.
 */

/**
 * Get next sequence number and formatted code for orders (invoices)
 */
export async function getNextOrderNumber(supabase, prefix = "ORD", year = new Date().getFullYear(), startNumber = 1) {
  const cleanPrefix = (prefix || "ORD").trim().toUpperCase();
  const pattern = `${cleanPrefix}-${year}-%`;

  // Fetch recent orders ordered by both created_at desc and order_number desc
  const [byCreated, byNum] = await Promise.all([
    supabase
      .from("orders")
      .select("order_number")
      .like("order_number", pattern)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("orders")
      .select("order_number")
      .like("order_number", pattern)
      .order("order_number", { ascending: false })
      .limit(50)
  ]);

  const allFound = [...(byCreated.data || []), ...(byNum.data || [])];
  let maxSeq = 0;

  allFound.forEach((o) => {
    if (o.order_number && o.order_number.startsWith(`${cleanPrefix}-${year}-`)) {
      const parts = o.order_number.split("-");
      const numPart = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(numPart) && numPart > maxSeq) {
        maxSeq = numPart;
      }
    }
  });

  const nextSeq = Math.max(maxSeq + 1, startNumber || 1);
  const orderNum = `${cleanPrefix}-${year}-${String(nextSeq).padStart(4, "0")}`;
  return { nextSeq, orderNum };
}

/**
 * Get next sequence number and formatted code for quotations
 */
export async function getNextQuotationNumber(supabase, year = new Date().getFullYear()) {
  const pattern = `QT-${year}-%`;

  const [byCreated, byNum] = await Promise.all([
    supabase
      .from("quotations")
      .select("quotation_number")
      .like("quotation_number", pattern)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("quotations")
      .select("quotation_number")
      .like("quotation_number", pattern)
      .order("quotation_number", { ascending: false })
      .limit(50)
  ]);

  const allFound = [...(byCreated.data || []), ...(byNum.data || [])];
  let maxSeq = 0;

  allFound.forEach((q) => {
    if (q.quotation_number && q.quotation_number.startsWith(`QT-${year}-`)) {
      const parts = q.quotation_number.split("-");
      const numPart = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(numPart) && numPart > maxSeq) {
        maxSeq = numPart;
      }
    }
  });

  const nextSeq = maxSeq + 1;
  const quotationNum = `QT-${year}-${String(nextSeq).padStart(4, "0")}`;
  return { nextSeq, quotationNum };
}

/**
 * Get next sequence number and formatted code for customer payments (PAY-YYYY-XXXX)
 */
export async function getNextPaymentNumber(supabase, year = new Date().getFullYear()) {
  const pattern = `PAY-${year}-%`;

  const [byCreated, byNum] = await Promise.all([
    supabase
      .from("orders")
      .select("order_number")
      .like("order_number", pattern)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("orders")
      .select("order_number")
      .like("order_number", pattern)
      .order("order_number", { ascending: false })
      .limit(50)
  ]);

  const allFound = [...(byCreated.data || []), ...(byNum.data || [])];
  let maxSeq = 0;

  allFound.forEach((o) => {
    if (o.order_number && o.order_number.startsWith(`PAY-${year}-`)) {
      const parts = o.order_number.split("-");
      const numPart = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(numPart) && numPart > maxSeq) {
        maxSeq = numPart;
      }
    }
  });

  const nextSeq = maxSeq + 1;
  const paymentNum = `PAY-${year}-${String(nextSeq).padStart(4, "0")}`;
  return { nextSeq, paymentNum };
}

/**
 * Inserts an order with automatic collision retry against duplicate key constraints.
 */
export async function insertOrderWithRetry(
  supabase,
  orderPayload,
  { prefix = "ORD", year = new Date().getFullYear(), startNumber = 1, maxRetries = 5 } = {}
) {
  let currentNum = orderPayload.order_number;
  let attempts = 0;

  while (attempts < maxRetries) {
    attempts++;
    const { data, error } = await supabase
      .from("orders")
      .insert({ ...orderPayload, order_number: currentNum })
      .select()
      .single();

    if (!error) {
      return { order: data, orderNum: currentNum };
    }

    const isDuplicate =
      error.code === "23505" ||
      (error.message && error.message.includes("orders_order_number_key")) ||
      (error.message && error.message.toLowerCase().includes("duplicate key"));

    if (isDuplicate && attempts < maxRetries) {
      // Re-fetch latest or increment to next number
      const nextInfo = await getNextOrderNumber(supabase, prefix, year, startNumber);
      if (nextInfo.orderNum === currentNum) {
        // Force increment if database read was momentarily cached
        const parts = currentNum.split("-");
        const nextInt = (parseInt(parts[parts.length - 1], 10) || 1) + 1;
        currentNum = `${prefix}-${year}-${String(nextInt).padStart(4, "0")}`;
      } else {
        currentNum = nextInfo.orderNum;
      }
      continue;
    }

    throw error;
  }

  throw new Error("Failed to insert order after maximum sequence retries.");
}
