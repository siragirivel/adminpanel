import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const TAX_RATE = 0.18;

function round(value) {
  return Math.round(Number(value) || 0);
}

function buildItems(rows) {
  return rows.map((row) => {
    const total = round(row.quantity * row.unit_price);
    const tax = round(total * TAX_RATE);
    return {
      ...row,
      total,
      tax,
      total_with_tax: total + tax,
    };
  });
}

function buildLabour(rows) {
  return rows.map((row) => {
    const amount = round(row.amount);
    const tax = round(amount * TAX_RATE);
    return {
      ...row,
      amount,
      tax,
      total_with_tax: amount + tax,
    };
  });
}

function buildInvoiceRecord(base) {
  const items = buildItems(base.items);
  const labour = buildLabour(base.labour);
  const totalSpare = round(items.reduce((sum, item) => sum + item.total, 0));
  const totalLabour = round(labour.reduce((sum, item) => sum + item.amount, 0));
  const subtotal = totalSpare + totalLabour;
  const totalTax = round(subtotal * TAX_RATE);

  return {
    ...base,
    items,
    labour,
    total_spare: totalSpare,
    total_labour: totalLabour,
    grand_total: subtotal + totalTax,
  };
}

function buildQuotationRecord(base) {
  const items = buildItems(base.items);
  const labour = buildLabour(base.labour);
  const totalSpare = round(items.reduce((sum, item) => sum + item.total, 0));
  const totalLabour = round(labour.reduce((sum, item) => sum + item.amount, 0));
  const subtotal = totalSpare + totalLabour;
  const discount = round(base.discount || 0);
  const discountedSubtotal = Math.max(subtotal - discount, 0);
  const totalTax = round(discountedSubtotal * TAX_RATE);

  return {
    ...base,
    items,
    labour,
    discount,
    total_spare: totalSpare,
    total_labour: totalLabour,
    subtotal_before_tax: subtotal,
    total_tax: totalTax,
    grand_total: discountedSubtotal + totalTax,
  };
}

async function upsert(table, rows, onConflict = "id") {
  if (!rows.length) {
    return;
  }

  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
}

async function countRows(table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  return count || 0;
}

async function main() {
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, email")
    .order("email", { ascending: true })
    .limit(1);

  if (profilesError) {
    throw new Error(`profiles: ${profilesError.message}`);
  }

  const createdBy = profiles?.[0]?.id;
  if (!createdBy) {
    throw new Error("No profile found. Create at least one app user before seeding sample data.");
  }

  const parts = [
    {
      id: "SgvBRA/3101",
      name: "Brake Pad Set",
      seller: "Murugan Suppliers",
      cat: "Brakes",
      cost: 980,
      sell: 1200,
      stock: 12,
      threshold: 5,
      created_by: createdBy,
      created_at: "2026-01-08T09:20:00+05:30",
    },
    {
      id: "SgvENG/3102",
      name: "Engine Oil 5W30",
      seller: "Velan Lubes",
      cat: "Lubricants",
      cost: 1450,
      sell: 1800,
      stock: 18,
      threshold: 6,
      created_by: createdBy,
      created_at: "2026-01-08T09:30:00+05:30",
    },
    {
      id: "SgvOIL/3103",
      name: "Oil Filter",
      seller: "Murugan Suppliers",
      cat: "Filters",
      cost: 180,
      sell: 240,
      stock: 22,
      threshold: 8,
      created_by: createdBy,
      created_at: "2026-01-11T11:10:00+05:30",
    },
    {
      id: "SgvAIR/3104",
      name: "Air Filter",
      seller: "Murugan Suppliers",
      cat: "Filters",
      cost: 260,
      sell: 350,
      stock: 9,
      threshold: 4,
      created_by: createdBy,
      created_at: "2026-01-11T11:18:00+05:30",
    },
    {
      id: "SgvCLU/3105",
      name: "Clutch Plate Kit",
      seller: "Prime Driveline",
      cat: "Engine",
      cost: 2800,
      sell: 3450,
      stock: 3,
      threshold: 2,
      created_by: createdBy,
      created_at: "2026-02-01T10:05:00+05:30",
    },
    {
      id: "SgvHEA/3106",
      name: "Headlight Bulb",
      seller: "Bright Auto Electricals",
      cat: "Electrical",
      cost: 90,
      sell: 150,
      stock: 14,
      threshold: 5,
      created_by: createdBy,
      created_at: "2026-02-03T14:22:00+05:30",
    },
    {
      id: "SgvWIP/3107",
      name: "Wiper Blade Pair",
      seller: "Bright Auto Electricals",
      cat: "Body",
      cost: 220,
      sell: 320,
      stock: 7,
      threshold: 3,
      created_by: createdBy,
      created_at: "2026-02-08T16:14:00+05:30",
    },
    {
      id: "SgvCOO/3108",
      name: "Coolant 1L",
      seller: "Velan Lubes",
      cat: "Lubricants",
      cost: 180,
      sell: 250,
      stock: 2,
      threshold: 4,
      created_by: createdBy,
      created_at: "2026-02-14T12:30:00+05:30",
    },
  ];

  const vehicles = [
    {
      id: "8b9b1d2c-1f3a-4a73-8cb7-8bd57f0f1001",
      car_id: "SGV-2026-001",
      owner_name: "Rajan Kumar",
      phone_number: "+91 98765 43210",
      alternate_phone: null,
      vehicle_reg: "TN 58 AB 1234",
      entry_date: "2026-03-10",
      make_model: "Maruti Swift VXI",
      status: "In Service",
      work_description: "Entry note: Brake noise and periodic service | Address: 12 Gandhi Nagar, Erode | Year: 2020 | Colour: White",
      chassis_number: "MA3FJEB1S00123456",
      front_image_url: "/Siragiri.png",
      back_image_url: "/Siragiri.png",
      chassis_image_url: "/Siragiri.png",
      created_by: createdBy,
      created_at: "2026-03-10T09:15:00+05:30",
    },
    {
      id: "8b9b1d2c-1f3a-4a73-8cb7-8bd57f0f1002",
      car_id: "SGV-2026-002",
      owner_name: "Malar Selvi",
      phone_number: "+91 98422 10567",
      alternate_phone: null,
      vehicle_reg: "TN 72 EF 9012",
      entry_date: "2026-03-12",
      make_model: "Tata Tiago XT",
      status: "Ready",
      work_description: "Entry note: Front brake replacement and headlight check | Address: Perundurai Main Road, Erode | Year: 2021 | Colour: Red",
      chassis_number: "MAT626401L7T90123",
      front_image_url: null,
      back_image_url: null,
      chassis_image_url: null,
      created_by: createdBy,
      created_at: "2026-03-12T10:05:00+05:30",
    },
    {
      id: "8b9b1d2c-1f3a-4a73-8cb7-8bd57f0f1003",
      car_id: "SGV-2026-003",
      owner_name: "Prakash B",
      phone_number: "+91 97888 44011",
      alternate_phone: null,
      vehicle_reg: "TN 38 CD 4488",
      entry_date: "2026-03-14",
      make_model: "Hyundai i20 Sportz",
      status: "Delivered",
      work_description: "Entry note: General service, filter replacement, engine oil change | Address: Karungalpalayam, Erode | Year: 2019 | Colour: Grey",
      chassis_number: "MALBB51CLKM448800",
      front_image_url: null,
      back_image_url: null,
      chassis_image_url: null,
      created_by: createdBy,
      created_at: "2026-03-14T08:55:00+05:30",
    },
    {
      id: "8b9b1d2c-1f3a-4a73-8cb7-8bd57f0f1004",
      car_id: "SGV-2026-004",
      owner_name: "Naveen Raj",
      phone_number: "+91 99524 33118",
      alternate_phone: null,
      vehicle_reg: "TN 66 H 9012",
      entry_date: "2026-03-18",
      make_model: "Mahindra Bolero",
      status: "In Service",
      work_description: "Entry note: Clutch issue and coolant leakage inspection | Address: Gobichettipalayam | Year: 2018 | Colour: Silver",
      chassis_number: "MA1TB2KSCP6045678",
      front_image_url: null,
      back_image_url: null,
      chassis_image_url: null,
      created_by: createdBy,
      created_at: "2026-03-18T12:05:00+05:30",
    },
    {
      id: "8b9b1d2c-1f3a-4a73-8cb7-8bd57f0f1005",
      car_id: "SGV-2026-005",
      owner_name: "Keerthana S",
      phone_number: "+91 93603 22147",
      alternate_phone: null,
      vehicle_reg: "TN 72 K 7781",
      entry_date: "2026-03-19",
      make_model: "Honda Amaze VX",
      status: "Waiting for Parts",
      work_description: "Entry note: Estimate requested for clutch overhaul | Address: Bhavani | Year: 2022 | Colour: Brown",
      chassis_number: "MAKGM354JNN778155",
      front_image_url: null,
      back_image_url: null,
      chassis_image_url: null,
      created_by: createdBy,
      created_at: "2026-03-19T09:40:00+05:30",
    },
  ];

  const enquiries = [
    {
      id: "ENQ-1001",
      customer_name: "Saravanan M",
      phone_number: "+91 98420 11122",
      vehicle_details: "TN 33 AX 4421 · Hyundai i10 · General service and pickup tomorrow morning",
      status: "open",
      pickup_date: "2026-03-20",
      created_by: createdBy,
      created_at: "2026-03-19T09:10:00+05:30",
    },
    {
      id: "ENQ-1002",
      customer_name: "Kavitha R",
      phone_number: "+91 97877 55443",
      vehicle_details: "TN 72 BB 9088 · Maruti WagonR · Brake pad price enquiry",
      status: "closed",
      pickup_date: "2026-03-19",
      created_by: createdBy,
      created_at: "2026-03-19T10:35:00+05:30",
    },
    {
      id: "ENQ-1003",
      customer_name: "Vignesh P",
      phone_number: "+91 93611 22990",
      vehicle_details: "TN 86 Z 7001 · Mahindra Bolero · Clutch complaint and tentative pickup next week",
      status: "open",
      pickup_date: "2026-03-24",
      created_by: createdBy,
      created_at: "2026-03-19T11:25:00+05:30",
    },
  ];

  const quotations = [
    buildQuotationRecord({
      id: "6fbb4f10-1ec5-4804-a22f-e0f789f41001",
      quotation_number: "QTN/MAR/2026/001",
      vehicle_id: vehicles[0].id,
      items: [
        { name: "Brake Pad Set", quantity: 1, unit_price: 1200, part_id: "SgvBRA/3101" },
        { name: "Oil Filter", quantity: 1, unit_price: 240, part_id: "SgvOIL/3103" },
      ],
      labour: [
        { description: "Brake inspection", amount: 350 },
        { description: "Wheel alignment", amount: 450 },
      ],
      start_date: "2026-03-10",
      end_date: "2026-03-17",
      discount: 100,
      note: "Customer requested genuine parts only.",
      created_by: createdBy,
      created_at: "2026-03-10T11:10:00+05:30",
    }),
    buildQuotationRecord({
      id: "6fbb4f10-1ec5-4804-a22f-e0f789f41002",
      quotation_number: "QTN/MAR/2026/002",
      vehicle_id: vehicles[4].id,
      items: [
        { name: "Clutch Plate Kit", quantity: 1, unit_price: 3450, part_id: "SgvCLU/3105" },
        { name: "Engine Oil 5W30", quantity: 1, unit_price: 1800, part_id: "SgvENG/3102" },
      ],
      labour: [
        { description: "Clutch overhaul labour", amount: 1600 },
      ],
      start_date: "2026-03-19",
      end_date: "2026-03-26",
      discount: 250,
      note: "Quotation shared before confirming work.",
      created_by: createdBy,
      created_at: "2026-03-19T10:15:00+05:30",
    }),
    buildQuotationRecord({
      id: "6fbb4f10-1ec5-4804-a22f-e0f789f41003",
      quotation_number: "QTN/MAR/2026/003",
      vehicle_id: vehicles[1].id,
      items: [
        { name: "Brake Pad Set", quantity: 1, unit_price: 1200, part_id: "SgvBRA/3101" },
        { name: "Headlight Bulb", quantity: 2, unit_price: 150, part_id: "SgvHEA/3106" },
      ],
      labour: [
        { description: "Brake fitting", amount: 400 },
      ],
      start_date: "2026-03-12",
      end_date: "2026-03-19",
      discount: 0,
      note: "Approved for same-day service.",
      created_by: createdBy,
      created_at: "2026-03-12T12:35:00+05:30",
    }),
  ];

  const invoices = [
    buildInvoiceRecord({
      id: "92cb3121-3b74-4b51-a7cc-79a0db9f1001",
      invoice_number: "SRV/MAR/2026/001",
      vehicle_id: vehicles[2].id,
      items: [
        { name: "Engine Oil 5W30", quantity: 1, unit_price: 1800, part_id: "SgvENG/3102" },
        { name: "Oil Filter", quantity: 1, unit_price: 240, part_id: "SgvOIL/3103" },
        { name: "Air Filter", quantity: 1, unit_price: 350, part_id: "SgvAIR/3104" },
      ],
      labour: [
        { description: "Periodic service labour", amount: 750 },
      ],
      payment_mode: "upi",
      created_by: createdBy,
      created_at: "2026-03-17T16:20:00+05:30",
    }),
    buildInvoiceRecord({
      id: "92cb3121-3b74-4b51-a7cc-79a0db9f1002",
      invoice_number: "SRV/MAR/2026/002",
      vehicle_id: vehicles[1].id,
      items: [
        { name: "Brake Pad Set", quantity: 1, unit_price: 1200, part_id: "SgvBRA/3101" },
        { name: "Headlight Bulb", quantity: 2, unit_price: 150, part_id: "SgvHEA/3106" },
      ],
      labour: [
        { description: "Brake fitting", amount: 400 },
      ],
      payment_mode: "cash",
      created_by: createdBy,
      created_at: "2026-03-18T18:05:00+05:30",
    }),
    buildInvoiceRecord({
      id: "92cb3121-3b74-4b51-a7cc-79a0db9f1003",
      invoice_number: "SRV/MAR/2026/003",
      vehicle_id: vehicles[3].id,
      items: [
        { name: "Clutch Plate Kit", quantity: 1, unit_price: 3450, part_id: "SgvCLU/3105" },
        { name: "Coolant 1L", quantity: 1, unit_price: 250, part_id: "SgvCOO/3108" },
      ],
      labour: [
        { description: "Gearbox and clutch labour", amount: 1800 },
      ],
      payment_mode: "card",
      created_by: createdBy,
      created_at: "2026-03-19T15:40:00+05:30",
    }),
    buildInvoiceRecord({
      id: "92cb3121-3b74-4b51-a7cc-79a0db9f1004",
      invoice_number: "SRV/MAR/2026/004",
      vehicle_id: vehicles[0].id,
      items: [
        { name: "Wiper Blade Pair", quantity: 1, unit_price: 320, part_id: "SgvWIP/3107" },
      ],
      labour: [
        { description: "Quick wash and fitting", amount: 200 },
      ],
      payment_mode: "cheque",
      created_by: createdBy,
      created_at: "2026-03-19T17:30:00+05:30",
    }),
  ];

  const orders = [
    {
      id: "SPO-1001",
      supplier: "Murugan Suppliers",
      part: "Brake Pad Set",
      qty: 10,
      total: 9800,
      mode: "upi",
      bill: true,
      bill_url: "/Siragiri.png",
      status: "received",
      date: "2026-03-11",
      created_by: createdBy,
      created_at: "2026-03-11T13:00:00+05:30",
    },
    {
      id: "SPO-1002",
      supplier: "Velan Lubes",
      part: "Engine Oil 5W30",
      qty: 12,
      total: 17400,
      mode: "cash",
      bill: false,
      bill_url: null,
      status: "received",
      date: "2026-03-13",
      created_by: createdBy,
      created_at: "2026-03-13T15:20:00+05:30",
    },
    {
      id: "SPO-1003",
      supplier: "Prime Driveline",
      part: "Clutch Plate Kit",
      qty: 3,
      total: 8400,
      mode: "card",
      bill: true,
      bill_url: "/Siragiri.png",
      status: "pending",
      date: "2026-03-18",
      created_by: createdBy,
      created_at: "2026-03-18T11:45:00+05:30",
    },
    {
      id: "SPO-1004",
      supplier: "Bright Auto Electricals",
      part: "Headlight Bulb",
      qty: 25,
      total: 2250,
      mode: "upi",
      bill: false,
      bill_url: null,
      status: "received",
      date: "2026-03-19",
      created_by: createdBy,
      created_at: "2026-03-19T14:10:00+05:30",
    },
  ];

  const transactions = [
    {
      id: "f15ca46f-f6a0-49f1-b17b-1a8a72511001",
      description: "Compressor maintenance",
      amount: 2200,
      type: "debit",
      payment_mode: "upi",
      date: "2026-01-08",
      note: "Quarterly workshop equipment service",
      created_by: createdBy,
      created_at: "2026-01-08T17:30:00+05:30",
    },
    {
      id: "f15ca46f-f6a0-49f1-b17b-1a8a72511002",
      description: "Insurance claim settlement",
      amount: 2800,
      type: "credit",
      payment_mode: "upi",
      date: "2026-01-27",
      note: "Received to bank account",
      created_by: createdBy,
      created_at: "2026-01-27T12:45:00+05:30",
    },
    {
      id: "f15ca46f-f6a0-49f1-b17b-1a8a72511003",
      description: "Advance received - Naveen Raj",
      amount: 1500,
      type: "credit",
      payment_mode: "cash",
      date: "2026-02-10",
      note: "Advance for clutch job booking",
      created_by: createdBy,
      created_at: "2026-02-10T10:05:00+05:30",
    },
    {
      id: "f15ca46f-f6a0-49f1-b17b-1a8a72511004",
      description: "Shop electricity bill",
      amount: 1250,
      type: "debit",
      payment_mode: "cash",
      date: "2026-02-26",
      note: "EB payment for February",
      created_by: createdBy,
      created_at: "2026-02-26T18:10:00+05:30",
    },
    {
      id: "f15ca46f-f6a0-49f1-b17b-1a8a72511005",
      description: "Supplier payment - Murugan Suppliers",
      amount: 3820,
      type: "debit",
      payment_mode: "upi",
      date: "2026-03-12",
      note: "Brake pads and filter stock purchase",
      created_by: createdBy,
      created_at: "2026-03-12T16:55:00+05:30",
    },
    {
      id: "f15ca46f-f6a0-49f1-b17b-1a8a72511006",
      description: "Invoice SRV/MAR/2026/001 - Prakash B",
      amount: invoices[0].grand_total,
      type: "credit",
      payment_mode: "upi",
      date: "2026-03-17",
      note: "SGV-2026-003 · TN 38 CD 4488",
      created_by: createdBy,
      created_at: "2026-03-17T16:25:00+05:30",
    },
    {
      id: "f15ca46f-f6a0-49f1-b17b-1a8a72511007",
      description: "Invoice SRV/MAR/2026/002 - Malar Selvi",
      amount: invoices[1].grand_total,
      type: "credit",
      payment_mode: "cash",
      date: "2026-03-18",
      note: "SGV-2026-002 · TN 72 EF 9012",
      created_by: createdBy,
      created_at: "2026-03-18T18:12:00+05:30",
    },
    {
      id: "f15ca46f-f6a0-49f1-b17b-1a8a72511008",
      description: "Tea and cleaning",
      amount: 450,
      type: "debit",
      payment_mode: "cash",
      date: "2026-03-19",
      note: "Daily running expense",
      created_by: createdBy,
      created_at: "2026-03-19T13:20:00+05:30",
    },
    {
      id: "f15ca46f-f6a0-49f1-b17b-1a8a72511009",
      description: "Invoice SRV/MAR/2026/003 - Naveen Raj",
      amount: invoices[2].grand_total,
      type: "credit",
      payment_mode: "card",
      date: "2026-03-19",
      note: "SGV-2026-004 · TN 66 H 9012",
      created_by: createdBy,
      created_at: "2026-03-19T15:45:00+05:30",
    },
    {
      id: "f15ca46f-f6a0-49f1-b17b-1a8a72511010",
      description: "Invoice SRV/MAR/2026/004 - Rajan Kumar",
      amount: invoices[3].grand_total,
      type: "credit",
      payment_mode: "cheque",
      date: "2026-03-19",
      note: "SGV-2026-001 · TN 58 AB 1234",
      created_by: createdBy,
      created_at: "2026-03-19T17:35:00+05:30",
    },
  ];

  const activityLogs = [
    {
      id: "7d93eec9-42bb-4901-bf8b-3c54ddf91001",
      action: "create",
      entity_type: "spare_part",
      entity_id: "SgvBRA/3101",
      entity_label: "Brake Pad Set",
      description: "Created spare part",
      metadata: { seller: "Murugan Suppliers", cat: "Brakes", stock: 12 },
      created_by: createdBy,
      created_at: "2026-01-08T09:22:00+05:30",
    },
    {
      id: "7d93eec9-42bb-4901-bf8b-3c54ddf91002",
      action: "create",
      entity_type: "vehicle",
      entity_id: vehicles[0].id,
      entity_label: "Rajan Kumar",
      description: "Created vehicle record",
      metadata: { car_id: "SGV-2026-001", vehicle_reg: "TN 58 AB 1234" },
      created_by: createdBy,
      created_at: "2026-03-10T09:17:00+05:30",
    },
    {
      id: "7d93eec9-42bb-4901-bf8b-3c54ddf91003",
      action: "create",
      entity_type: "spare_order",
      entity_id: "SPO-1001",
      entity_label: "Murugan Suppliers - Brake Pad Set",
      description: "Created spare order",
      metadata: { total: 9800, mode: "upi", status: "received" },
      created_by: createdBy,
      created_at: "2026-03-11T13:05:00+05:30",
    },
    {
      id: "7d93eec9-42bb-4901-bf8b-3c54ddf91011",
      action: "create",
      entity_type: "enquiry",
      entity_id: enquiries[0].id,
      entity_label: enquiries[0].customer_name,
      description: "Created enquiry",
      metadata: { phone_number: enquiries[0].phone_number, status: enquiries[0].status, pickup_date: enquiries[0].pickup_date },
      created_by: createdBy,
      created_at: "2026-03-19T09:11:00+05:30",
    },
    {
      id: "7d93eec9-42bb-4901-bf8b-3c54ddf91012",
      action: "edit",
      entity_type: "enquiry",
      entity_id: enquiries[1].id,
      entity_label: enquiries[1].customer_name,
      description: "Closed enquiry after confirmation",
      metadata: { phone_number: enquiries[1].phone_number, status: enquiries[1].status, pickup_date: enquiries[1].pickup_date },
      created_by: createdBy,
      created_at: "2026-03-19T10:55:00+05:30",
    },
    {
      id: "7d93eec9-42bb-4901-bf8b-3c54ddf91004",
      action: "edit",
      entity_type: "vehicle",
      entity_id: vehicles[1].id,
      entity_label: "Malar Selvi",
      description: "Edited vehicle record",
      metadata: { car_id: "SGV-2026-002", status: "Ready" },
      created_by: createdBy,
      created_at: "2026-03-12T17:10:00+05:30",
    },
    {
      id: "7d93eec9-42bb-4901-bf8b-3c54ddf91005",
      action: "create",
      entity_type: "quotation",
      entity_id: quotations[0].id,
      entity_label: quotations[0].quotation_number,
      description: "Created quotation for Rajan Kumar",
      metadata: { vehicle_id: vehicles[0].id, grand_total: quotations[0].grand_total },
      created_by: createdBy,
      created_at: "2026-03-10T11:12:00+05:30",
    },
    {
      id: "7d93eec9-42bb-4901-bf8b-3c54ddf91006",
      action: "create",
      entity_type: "invoice",
      entity_id: invoices[0].id,
      entity_label: invoices[0].invoice_number,
      description: "Created invoice for Prakash B",
      metadata: { vehicle_id: vehicles[2].id, grand_total: invoices[0].grand_total, payment_mode: "upi" },
      created_by: createdBy,
      created_at: "2026-03-17T16:21:00+05:30",
    },
    {
      id: "7d93eec9-42bb-4901-bf8b-3c54ddf91007",
      action: "create",
      entity_type: "transaction",
      entity_id: transactions[5].id,
      entity_label: transactions[5].description,
      description: "Created automatic day book entry from invoice",
      metadata: { amount: transactions[5].amount, payment_mode: "upi", date: "2026-03-17", type: "credit" },
      created_by: createdBy,
      created_at: "2026-03-17T16:26:00+05:30",
    },
    {
      id: "7d93eec9-42bb-4901-bf8b-3c54ddf91008",
      action: "edit",
      entity_type: "spare_part",
      entity_id: "SgvCOO/3108",
      entity_label: "Coolant 1L",
      description: "Edited spare part",
      metadata: { seller: "Velan Lubes", cat: "Lubricants", stock: 2 },
      created_by: createdBy,
      created_at: "2026-03-18T09:05:00+05:30",
    },
    {
      id: "7d93eec9-42bb-4901-bf8b-3c54ddf91009",
      action: "create",
      entity_type: "invoice",
      entity_id: invoices[2].id,
      entity_label: invoices[2].invoice_number,
      description: "Created invoice for Naveen Raj",
      metadata: { vehicle_id: vehicles[3].id, grand_total: invoices[2].grand_total, payment_mode: "card" },
      created_by: createdBy,
      created_at: "2026-03-19T15:42:00+05:30",
    },
    {
      id: "7d93eec9-42bb-4901-bf8b-3c54ddf91010",
      action: "create",
      entity_type: "transaction",
      entity_id: transactions[7].id,
      entity_label: transactions[7].description,
      description: "Created manual day book entry",
      metadata: { amount: 450, payment_mode: "cash", date: "2026-03-19", type: "debit" },
      created_by: createdBy,
      created_at: "2026-03-19T13:21:00+05:30",
    },
  ];

  await upsert("spare_parts", parts);
  await upsert("vehicles", vehicles);
  await upsert("enquiries", enquiries);
  await upsert("spare_orders", orders);
  await upsert("quotations", quotations);
  await upsert("invoices", invoices);
  await upsert("transactions", transactions);
  await upsert("activity_logs", activityLogs);

  const summary = {};
  for (const table of [
    "profiles",
    "spare_parts",
    "spare_orders",
    "vehicles",
    "enquiries",
    "quotations",
    "invoices",
    "transactions",
    "activity_logs",
  ]) {
    summary[table] = await countRows(table);
  }

  console.log("Sample data seeded successfully.");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
