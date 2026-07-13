import { jsPDF } from "jspdf";

import { format } from "date-fns";

interface InvoicePdfVehicle {
  owner_name?: string;
  owner?: string;
  phone_number?: string;
  phone?: string;
  car_id?: string;
  vehicle_reg?: string;
  vehicle_no?: string;
  make_model?: string | null;
  entry_date?: string;
  odometer_km?: string | number | null;
}

interface InvoicePdfItem {
  name: string;
  quantity?: number;
  qty?: number;
  part_id?: string;
  partId?: string;
  unit_price?: number;
  unitPrice?: number;
  discount?: number;
  tax?: number;
  total_with_tax?: number;
  totalWithTax?: number;
  total?: number;
}

interface InvoicePdfLabour {
  description?: string;
  desc?: string;
  amount: number;
  discount?: number;
  tax?: number;
  total_with_tax?: number;
  totalWithTax?: number;
}

interface InvoicePdfData {
  invoice_number: string;
  vehicle: InvoicePdfVehicle;
  items: InvoicePdfItem[];
  labour: InvoicePdfLabour[];
  grand_total: number;
  payment_mode: string;
  odometer_km?: string | number | null;
  date?: string;
  note?: string;
  total_spare?: number;
  total_labour?: number;
  subtotal_before_tax?: number;
  total_tax?: number;
}

const INVOICE_TERMS_AND_CONDITIONS = [
  "1. Estimate for jobs to be done is only approximate. Bill will be made out for actual, Work turned out, depending on the time involved.",
  "2. Our quotation for parts to be supplied is based on the prices of materials current at the time of giving quotation. Any fluctuation of prices on the date of fitment will be billed to you.",
  "3. Our quotation are subject to availability of parts and we accept no responsibility for any delay caused due to non availability of parts.",
  "4. Handling charges, sales tax, surcharge and incidental charges etc, will be extra.",
  "5. Unless otherwise stated our terms of payment are cash on delivery of the vehicle of goods and therefore our bill amount will have to be paid for in full at the time of taking delivery of the vehicle of goods.",
  "6. Customer has to pay 50% of estimated value as advance for Non Tie Up Insurance Policy Body Shop Jobs at the time of Job approval.",
  "7. It should be distinctly understood that all our charges are net and are not subject to any rebate or discount.",
  "8. It should be definitely agreed and understood that we assume no responsibility for loss or damages by theft or fire or whatever means to the vehicle/parts placed with us for storage, sale or repair.",
  "9. Any Parts found at the time of dismantling will be submitted on supplementary & Fuel for testing/trial will be extra.",
  "10. Garage rent will be charged ( Rs.250 Per Day ) if the vehicles, spares are not taken delivery Customer, for the entire period from the date of acknowledgement of the estimate or from a week after despatch of estimate whichever occurs earliest.",
  "11. Also if the vehicle or spare is not taken delivery within a period of 3 days from the date of information to you after repairs, garage rent will be charged as per norms.",
  "12. 5 % of estimation will be charged, if vehicle is taking back without job under any circumstances.",
  "13. Estimate is valid for only for two weeks.",
  "14. Taxes are applicable as per Govt norms, which has to paid during the time of delivery."
];

const TERMS_AND_CONDITIONS = [
  "1. This workshop is owned and operated by SIRAGIRI VEL AUTOMOBILES (“Workshop”). The Workshop is open for 7 days a week, except for day/s that are pre-disclosed as weekly off or special holiday, by this Workshop.",
  "2. The Workshop is an authorised franchisee of TVS Automobile Solutions PVT. LTD. (“KMS”). You (“Customer”/ “you”) hereby agree and authorize the Workshop and KMS and all of its divisions, affiliates, subsidiaries, related parties and other group companies (collectively the “KMS Entities”; Workshop and KMS Entities are collectively called “we”/ “us” / “our”) to access your basic data / contact details provided herewith, i.e. your name, address, telephone number, e-mail address, birth date and / or anniversary date. You hereby consent to, agree and acknowledge that we may call/ email/ SMS/Whatsapp/Telegram you on any of the basic contact details shared by you, in order to assist you with the services availed by you or keep you informed regarding our service or product details, or send you any marketing and our other product or service related communication and our other offers. You confirm that you are providing the details herein at your sole discretion and confirm that you have full capacity and authority to provide the abovementioned details and these details are true and accurate. You promise that neither the Workshop nor any KMS Entity shall be held responsible or liable for any claim arising out of accessing or using your basic data / contact details shared by you. You also consent to being assigned a unique identity within the KMS Group, to be shared amongst all KMS Entities, for the purpose outlined in this paragraph. You also agree and understand that the Workshop, KMS Entities or their agency appointed for this purpose will retain the data provided hereunder for as long as reasonably required for the purposes mentioned above, or until you withdraw consent, after which they will delete all your data from their records and will forget you completely. You also agree that if at any point of time, you wish to stop receiving such communications from KMS Group, you will call at KMS’s designated call center* and register your preference.",
  "*Call Centre Number: 1800224008 or email us at:- customercare@tvs.in",
  "3. This Workshop shall take reasonable care of your vehicle while it is at the Workshop. However, this Workshop shall not be responsible for any loss or damage caused to the vehicle in case such loss is caused due to reason of fire, theft, accident or any other cause beyond the control of the Workshop.",
  "4. The Customer is advised to collect his/her personal articles before handing over the vehicle to the Workshop. We shall not be responsible for any missing item, which has not been registered in the job card.",
  "5. For a vehicle in an accident, if towing services are availed from the Workshop, the Customer will be liable to pay the cost for such towing, at actuals.",
  "6. Workshop will release the vehicle only upon receiving complete payment from the Customer or upon receipt of delivery order from the insurance company. However, principal liability to pay will always be of the Customer, under all circumstances. 7. This Workshop may conduct test drive on the vehicle for purpose of inspecting the damages and testing the repairs done and/ or also drive the vehicle for delivery to the Customer, at Customer’s risk. In case of damage due to any accident, repairs will be carried out under the insurance of the vehicle.",
  "8. While best efforts will be made by the Workshop to identify full extent of damages suffered by the vehicle brought to the Workshop for repair and accordingly repairs and replacement of damaged parts will be carried out. However, the Customer understands and acknowledges the fact that the repaired vehicle may not be restored to its original condition or cannot be made like new vehicles. Few parts or systems of the vehicle may fail after some time of usage because of certain unidentifiable or unforeseen effect of damage occurred due to any accident or natural calamity, if any, show up after some time. Such failures shall not be treated as deficiency in quality of repair / service done by the Workshop.",
  "9. THE CUSTOMER SHALL INSPECT THE VEHICLE TO ITS SATISFACTION BEFORE TAKING IT BACK FORM THE WORKSHOP. NEITHER THE WORKSHOP NOR TASPL MAKES ANY WARRANTY WITH RESPECT TO THE SERVICES, WHETHER EXPRESS OR IMPLIED, AND SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTIES, WHETHER OF MERCHANTABILITY, SUITABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR OTHERWISE FOR ITS SERVICES. 10. Customer is requested to collect the old spare part (in case of replacement) after the job is completed.",
  "In case the old spare part is not collected by the Customer at the time of delivery of the vehicle, the Workshop has the right to dispose it off, in the manner it deems fit, and shall not be held responsible thereafter.",
  "11. In case the delivery of the vehicle has not been taken within 3 days from the day the service is completed, Rs. 100 per day per vehicle as parking charges would be levied. The charges will have to be paid by the Customer along with the bill at the time of taking delivery of the vehicle. The Workshop reserves the right to recover all expenses and take all steps, including disposal of the vehicle in the manner it deems fit, or initiate legal actions, if the Customer fails to take delivery of the vehicle within 7 days of notice or information of completion of the service, whichever is earlier.",
  "12. If required by the Workshop, Customer undertakes to make deposit of 50% of the estimated amount of repair charges in advance in case of major repairs (as determined by the Workshop), whether under insurance claims or otherwise.",
  "13. Every effort is made to adhere to the commitments made by this Workshop to the Customer. However, the estimated date/time of delivery could change depending upon the availability of spare parts (if need be), additional jobs requested and delays caused due to unforeseen circumstances.",
  "14. Vehicle can be delivered only on production of customer copy of the Repair Order Form. However, the Workshop may deliver the vehicle to the Customer or any representative of the Customer, whose signature appears on the Repair Order form or who is authorised by the Customer.",
  "15. Workshop will levy an estimation charge of Rs. 500/- or 10% of the total labour charges, whichever is higher if the job is not entrusted to the Workshop after obtaining the estimate from Workshop. The amount will have to be paid along with the parking charges if any, prior to delivery of the vehicle on his/her behalf.",
  "16. Further, an interest of 24% p.a will be levied on the invoice value in case the Customer or owner of vehicle does not pay on the outstanding within 2 days from the date of the invoice.",
  "17. Amounts referred under these “Terms and Conditions” are exclusive of taxes.",
  "18. The Customer shall be bound by these Terms and Conditions including their respective successors and lawful assigns. These Terms and Conditions shall be governed by and construed in accordance with the laws of India and any dispute arising out of this engagement or these terms shall be subject to the exclusive jurisdiction of the Indian courts."
];

const fetchImageAsBase64 = async (url: string): Promise<string> => {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
};

const SIRAGIRI_LOGO_URL = "/Siragiri.png";
const SECONDARY_LOGO_URL = "/Screenshot 2026-04-03 at 12.17.56 AM.png";

async function drawHeaderLogos(doc: jsPDF, x: number, y: number) {
  try {
    const b64Siragiri = await fetchImageAsBase64(SIRAGIRI_LOGO_URL);
    const b64Secondary = await fetchImageAsBase64(SECONDARY_LOGO_URL);
    doc.addImage(b64Siragiri, "PNG", x, y, 20, 10);
    doc.addImage(b64Secondary, "PNG", x + 24, y, 20, 10);
  } catch (error) {
    console.error("Failed to load header logos", error);
  }
}

interface QuotationPdfData {
  quotation_number: string;
  vehicle: InvoicePdfVehicle;
  items: InvoicePdfItem[];
  labour: InvoicePdfLabour[];
  start_date: string;
  end_date: string;
  discount: number;
  grand_total: number;
  odometer_km?: string | number | null;
  date?: string;
  note?: string;
  total_spare?: number;
  total_labour?: number;
  subtotal_before_tax?: number;
  total_tax?: number;
}

function formatAmount(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function roundCurrency(value: number) {
  return Number((Number(value) || 0).toFixed(2));
}

function getInvoicePdfPartLine(row: InvoicePdfItem) {
  const quantity = Number(row.quantity ?? row.qty ?? 1);
  const unitPrice = Number(row.unit_price ?? row.unitPrice ?? 0);
  const lineSubtotal = Number(row.total ?? unitPrice * quantity);
  const lineDiscount = Math.min(Math.max(Number(row.discount ?? 0), 0), lineSubtotal);
  const taxableAmount = Math.max(lineSubtotal - lineDiscount, 0);
  const lineTax = Number(row.tax ?? roundCurrency(taxableAmount * 0.18));
  const lineTotal = Number(
    row.total_with_tax ?? row.totalWithTax ?? roundCurrency(taxableAmount + lineTax),
  );

  return {
    quantity,
    unitPrice,
    lineSubtotal,
    lineDiscount,
    taxableAmount,
    lineTax,
    lineTotal,
  };
}

function getInvoicePdfLabourLine(row: InvoicePdfLabour) {
  const lineAmount = Number(row.amount || 0);
  const lineDiscount = Math.min(Math.max(Number(row.discount ?? 0), 0), lineAmount);
  const taxableAmount = Math.max(lineAmount - lineDiscount, 0);
  const lineTax = Number(row.tax ?? roundCurrency(taxableAmount * 0.18));
  const lineTotal = Number(
    row.total_with_tax ?? row.totalWithTax ?? roundCurrency(taxableAmount + lineTax),
  );

  return {
    lineAmount,
    lineDiscount,
    taxableAmount,
    lineTax,
    lineTotal,
  };
}

function extractOdometerReading(note?: string, fallback?: string | number | null) {
  if (fallback !== null && fallback !== undefined && String(fallback).trim()) {
    return String(fallback).trim();
  }
  const match = String(note || "").match(/odometer:\s*([\d,]+)(?:\s*km)?/i);
  return match?.[1]?.trim() || "";
}

function drawRule(doc: jsPDF, y: number, pageWidth: number, margin: number) {
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
}

function fitText(doc: jsPDF, value: string, maxWidth: number) {
  const text = String(value || "").trim();
  if (!text) return "—";
  if (doc.getTextWidth(text) <= maxWidth) return text;

  let truncated = text;
  while (truncated.length > 0 && doc.getTextWidth(`${truncated}...`) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  return `${truncated}...`;
}

export async function generateInvoicePDF(data: InvoicePdfData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const rightX = pageWidth - margin;

  const labourRows = data.labour || [];
  const partRows = data.items || [];
  const labourLines = labourRows.map((row) => getInvoicePdfLabourLine(row));
  const partLines = partRows.map((row) => getInvoicePdfPartLine(row));
  const labourSubtotalInclGst = roundCurrency(
    labourLines.reduce((sum, row) => sum + row.lineTotal, 0),
  );
  const partsSubtotalInclGst = roundCurrency(
    partLines.reduce((sum, row) => sum + row.lineTotal, 0),
  );
  const labourTotal =
    data.total_labour ??
    labourRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const partsTotal =
    data.total_spare ??
    partRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const subtotal = data.subtotal_before_tax ?? labourTotal + partsTotal;
  const totalDiscount = roundCurrency(
    labourLines.reduce((sum, row) => sum + row.lineDiscount, 0) +
      partLines.reduce((sum, row) => sum + row.lineDiscount, 0),
  );
  const taxableSubtotal = roundCurrency(Math.max(subtotal - totalDiscount, 0));
  const totalTax =
    data.total_tax ??
    roundCurrency(
      labourLines.reduce((sum, row) => sum + row.lineTax, 0) +
        partLines.reduce((sum, row) => sum + row.lineTax, 0),
    );
  const grandTotal = data.grand_total ?? roundCurrency(taxableSubtotal + totalTax);

  const invoiceDate = format(
    new Date(data.date || Date.now()),
    "dd-MMM-yyyy",
  );
  const ownerName = data.vehicle.owner_name || data.vehicle.owner || "Customer";
  const phone = data.vehicle.phone_number || data.vehicle.phone || "—";
  const vehicleNo = data.vehicle.vehicle_reg || data.vehicle.vehicle_no || "—";
  const model = data.vehicle.make_model || "General Service";
  const odometerReading = extractOdometerReading(
    data.note,
    data.odometer_km ?? data.vehicle.odometer_km,
  );
  const comments = data.note?.trim()
    ? data.note.trim()
    : [
        "1. Total payment due on receipt.",
        `2. Payment mode: ${data.payment_mode.toUpperCase()}.`,
        `3. For queries contact: ${phone}`,
      ].join("\n");

  // Add Logos at the top
  await drawHeaderLogos(doc, margin, 10);
  
  let y = 28;

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("myTVS Erode - Siragiri Vel Automobiles", margin, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text("SF No.: 330/1, Erode to Perundurai Main Road,", margin, y);
  y += 4.5;
  doc.text("Post, Vallipurathanpalayam, Erode,", margin, y);
  y += 4.5;
  doc.text("Tamil Nadu - 638 112", margin, y);
  y += 4.5;
  doc.text(
    "Ph: +91 99433 08008 | admin@siragirivel.in",
    margin,
    y,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(30, 41, 59);
  doc.text("INVOICE", rightX, 26, { align: "right" });

  y = 52;
  drawRule(doc, y, pageWidth, margin);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("INVOICE No.", margin, y);
  doc.text("DATE", rightX - 18, y, { align: "right" });

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(data.invoice_number, margin + 28, y);
  doc.text(invoiceDate, rightX, y, { align: "right" });

  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  const infoRightColX = 112;
  doc.text("Customer INFO", margin, y);
  doc.text("Vehicle INFO", infoRightColX, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(fitText(doc, ownerName, 88), margin, y);
  doc.text("Model:", infoRightColX, y);
  doc.text(fitText(doc, model, 58), infoRightColX + 18, y);

  y += 5.5;
  doc.setTextColor(71, 85, 105);
  doc.text(fitText(doc, phone, 88), margin, y);
  doc.text("Car No.:", infoRightColX, y);
  doc.text(fitText(doc, vehicleNo, 58), infoRightColX + 18, y);

  y += 5.5;
  doc.text("Payment:", infoRightColX, y);
  doc.text(fitText(doc, data.payment_mode.toUpperCase(), 58), infoRightColX + 18, y);
  y += 5.5;
  doc.text("Odometer:", infoRightColX, y);
  doc.text(fitText(doc, odometerReading ? `${odometerReading} km` : "—", 58), infoRightColX + 18, y);

  y += 10;

  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, pageWidth - margin * 2, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const serviceNameX = margin + 3;
  const serviceNameWidth = 106;
  const servicePriceX = 142;
  const serviceTaxX = 162;
  const serviceAmountX = rightX - 3;
  doc.text("SERVICES PERFORMED", serviceNameX, y + 5.4);
  doc.text("PRICE", servicePriceX, y + 5.4, { align: "right" });
  doc.text("TAX", serviceTaxX, y + 5.4, { align: "right" });
  doc.text("AMOUNT", serviceAmountX, y + 5.4, { align: "right" });
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  labourRows.forEach((row) => {
    const lineAmount = Number(row.amount || 0);
    const lineTax = Number(row.tax ?? Math.round(lineAmount * 0.18));
    const lineTotal = Number(
      row.total_with_tax ?? row.totalWithTax ?? lineAmount + lineTax,
    );

    doc.setTextColor(30, 41, 59);
    doc.text(
      fitText(doc, row.description || row.desc || "Labour charge", serviceNameWidth),
      serviceNameX,
      y,
    );
    doc.text(formatAmount(lineAmount), servicePriceX, y, { align: "right" });
    doc.text(formatAmount(lineTax), serviceTaxX, y, { align: "right" });
    doc.text(formatAmount(lineTotal), serviceAmountX, y, {
      align: "right",
    });
    y += 7;
  });

  if (labourRows.length === 0) {
    doc.setTextColor(148, 163, 184);
    doc.text("No labour charges added", margin + 3, y);
    y += 7;
  }

  y += 2;
  drawRule(doc, y, pageWidth, margin);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("SUBTOTAL (incl. TAX)", rightX - 32, y, { align: "right" });
  doc.text(formatAmount(labourSubtotalInclGst), rightX - 3, y, { align: "right" });

  y += 10;

  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, pageWidth - margin * 2, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const partNameX = margin + 3;
  const partNameWidth = 52;
  const partIdX = 74;
  const partIdWidth = 36;
  const partQtyX = 120;
  const partUnitX = 144;
  const partTaxX = 166;
  const partAmountX = rightX - 3;
  doc.text("PART NAME", partNameX, y + 5.4);
  doc.text("PART ID", partIdX, y + 5.4);
  doc.text("QTY", partQtyX, y + 5.4, { align: "right" });
  doc.text("AMOUNT", partUnitX, y + 5.4, { align: "right" });
  doc.text("TAX 18%", partTaxX, y + 5.4, { align: "right" });
  doc.text("AFTER TAX", partAmountX, y + 5.4, { align: "right" });
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  partRows.forEach((row) => {
    const { quantity, unitPrice, lineTax, lineTotal } = getInvoicePdfPartLine(row);

    doc.setTextColor(30, 41, 59);
    doc.text(fitText(doc, row.name, partNameWidth), partNameX, y);
    doc.text(
      fitText(doc, row.part_id || row.partId || "—", partIdWidth),
      partIdX,
      y,
    );
    doc.text(String(quantity), partQtyX, y, { align: "right" });
    doc.text(formatAmount(unitPrice), partUnitX, y, { align: "right" });
    doc.text(formatAmount(lineTax), partTaxX, y, { align: "right" });
    doc.text(formatAmount(lineTotal), partAmountX, y, { align: "right" });
    y += 7;
  });

  if (partRows.length === 0) {
    doc.setTextColor(148, 163, 184);
    doc.text("No spare parts added", margin + 3, y);
    y += 7;
  }

  y += 2;
  drawRule(doc, y, pageWidth, margin);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("SUBTOTAL (incl. TAX)", rightX - 32, y, { align: "right" });
  doc.text(formatAmount(partsSubtotalInclGst), rightX - 3, y, { align: "right" });

  y += 12;

  const commentsLines = doc.splitTextToSize(comments, 84);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text("OTHER COMMENTS", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);
  doc.setTextColor(51, 65, 85);
  doc.text(commentsLines, margin, y + 6);

  let totalsY = y;
  const totalsX = 126;
  const totalsValueX = rightX - 2;

  const totalRows: Array<{ label: string; value: number; bold?: boolean }> = [
    { label: "TOTAL SERVICES", value: labourTotal },
    { label: "TOTAL PARTS", value: partsTotal },
    { label: "Subtotal (before discount)", value: subtotal },
    { label: "Discount", value: totalDiscount },
    { label: "Taxable subtotal", value: taxableSubtotal },
    { label: "TAX 18% (Services + Parts)", value: totalTax },
    { label: "TOTAL (incl. TAX)", value: grandTotal, bold: true },
  ];

  totalRows.forEach((row, index) => {
    if (row.bold) {
      doc.setFillColor(248, 250, 252);
      doc.rect(totalsX - 4, totalsY - 4.8, rightX - totalsX + 1, 9, "F");
    }

    doc.setFont("helvetica", row.bold ? "bold" : "normal");
    doc.setFontSize(row.bold ? 10 : 9);
    doc.setTextColor(row.bold ? 30 : 71, row.bold ? 41 : 85, row.bold ? 59 : 105);
    doc.text(row.label, totalsX, totalsY);
    doc.text(formatAmount(row.value), totalsValueX, totalsY, { align: "right" });
    totalsY += index === totalRows.length - 1 ? 0 : 7;
  });

  const footerY = pageHeight - 22;
  drawRule(doc, footerY - 6, pageWidth, margin);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text("Thank You For Your Business!", margin, footerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "This is a computer generated invoice and does not require any signature.",
    margin,
    footerY + 6,
  );
  doc.text("Make all payments payable to:", rightX, footerY, { align: "right" });
  doc.text("Siragiri Vel Automobiles", rightX, footerY + 6, { align: "right" });

  doc.setFontSize(7.5);
  doc.text(
    `${data.invoice_number} · ${invoiceDate} · myTVS Erode - Siragiri Vel Automobiles`,
    pageWidth / 2,
    pageHeight - 6,
    { align: "center" },
  );

  // Add Terms and Conditions Page for Invoice
  doc.addPage();
  
  // Re-add Logos and Workshop Header
  await drawHeaderLogos(doc, margin, 10);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Terms & Conditions", margin, 32);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  
  let currentY = 42;
  const lineHeight = 5.5;
  const maxWidth = pageWidth - (margin * 2);
  
  INVOICE_TERMS_AND_CONDITIONS.forEach(para => {
    const lines = doc.splitTextToSize(para, maxWidth);
    if (currentY + (lines.length * lineHeight) > pageHeight - 30) {
      doc.addPage();
      currentY = 20;
    }
    doc.text(lines, margin, currentY);
    currentY += (lines.length * lineHeight) + 2;
  });

  // Signatures section
  currentY += 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("For SIRAGIRI VEL AUTOMOBILES", rightX, currentY - 8, { align: "right" });
  
  doc.text("_______________________", margin, currentY);
  doc.text("_______________________", rightX, currentY, { align: "right" });
  currentY += 5;
  doc.text("Customer Signature", margin, currentY);
  doc.text("Authorized Signature", rightX, currentY, { align: "right" });

  doc.save(`${data.invoice_number.replaceAll("/", "-")}.pdf`);
}

export async function generateQuotationPDF(data: QuotationPdfData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const rightX = pageWidth - margin;

  const labourRows = data.labour || [];
  const partRows = data.items || [];
  const labourTotal =
    data.total_labour ??
    labourRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const partsTotal =
    data.total_spare ??
    partRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const subtotalBeforeDiscount =
    data.subtotal_before_tax ?? labourTotal + partsTotal;
  const discountedSubtotal = Math.max(
    subtotalBeforeDiscount - Number(data.discount || 0),
    0,
  );
  const totalTax =
    data.total_tax ?? Math.round(discountedSubtotal * 0.18);
  const grandTotal = data.grand_total ?? discountedSubtotal + totalTax;

  const quoteDate = format(
    new Date(data.date || Date.now()),
    "dd-MMM-yyyy",
  );
  const startDate = format(new Date(data.start_date), "dd-MMM-yyyy");
  const ownerName = data.vehicle.owner_name || data.vehicle.owner || "Customer";
  const phone = data.vehicle.phone_number || data.vehicle.phone || "—";
  const vehicleNo = data.vehicle.vehicle_reg || data.vehicle.vehicle_no || "—";
  const model = data.vehicle.make_model || "General Service";
  const odometerReading = extractOdometerReading(
    data.note,
    data.odometer_km ?? data.vehicle.odometer_km,
  );

  // Add Logos at the top
  await drawHeaderLogos(doc, margin, 10);

  let y = 28;

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("myTVS Erode - Siragiri Vel Automobiles", margin, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text("SF No.: 330/1, Erode to Perundurai Main Road,", margin, y);
  y += 4.5;
  doc.text("Post, Vallipurathanpalayam, Erode,", margin, y);
  y += 4.5;
  doc.text("Tamil Nadu - 638 112", margin, y);
  y += 4.5;
  doc.text("Ph: +91 99433 08008 | admin@siragirivel.in", margin, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(30, 41, 59);
  doc.text("QUOTATION", rightX, 26, { align: "right" });

  // Add Draft Watermark
  doc.setFontSize(8);
  doc.setTextColor(239, 68, 68); // Red-500
  doc.text("This Copy is Draft & not Original", rightX, 32, { align: "right" });

  y = 52;
  drawRule(doc, y, pageWidth, margin);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("QUOTATION No.", margin, y);
  doc.text("DATE", rightX - 18, y, { align: "right" });

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(data.quotation_number, margin + 34, y);
  doc.text(quoteDate, rightX, y, { align: "right" });

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  const quoteInfoRightColX = 112;
  doc.text("Customer INFO", margin, y);
  doc.text("Vehicle INFO", quoteInfoRightColX, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(fitText(doc, ownerName, 88), margin, y);
  doc.text("Model:", quoteInfoRightColX, y);
  doc.text(fitText(doc, model, 58), quoteInfoRightColX + 18, y);

  y += 5.5;
  doc.setTextColor(71, 85, 105);
  doc.text(fitText(doc, phone, 88), margin, y);
  doc.text("Car No.:", quoteInfoRightColX, y);
  doc.text(fitText(doc, vehicleNo, 58), quoteInfoRightColX + 18, y);

  y += 5.5;
  doc.text(`Valid From: ${startDate}`, margin, y);
  doc.text("Odometer:", quoteInfoRightColX, y);
  doc.text(fitText(doc, odometerReading ? `${odometerReading} km` : "—", 58), quoteInfoRightColX + 18, y);

  y += 10;

  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, pageWidth - margin * 2, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const quoteServiceNameX = margin + 3;
  const quoteServiceNameWidth = 130;
  doc.text("SERVICES QUOTED", quoteServiceNameX, y + 5.4);
  doc.text("AMOUNT", rightX - 3, y + 5.4, { align: "right" });
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  labourRows.forEach((row) => {
    doc.setTextColor(30, 41, 59);
    doc.text(
      fitText(doc, row.description || row.desc || "Labour charge", quoteServiceNameWidth),
      quoteServiceNameX,
      y,
    );
    doc.text(formatAmount(Number(row.amount || 0)), rightX - 3, y, {
      align: "right",
    });
    y += 7;
  });

  if (labourRows.length === 0) {
    doc.setTextColor(148, 163, 184);
    doc.text("No labour charges added", margin + 3, y);
    y += 7;
  }

  y += 2;
  drawRule(doc, y, pageWidth, margin);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("SUBTOTAL", rightX - 32, y, { align: "right" });
  doc.text(formatAmount(labourTotal), rightX - 3, y, { align: "right" });

  y += 10;
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, pageWidth - margin * 2, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const quotePartNameX = margin + 3;
  const quotePartNameWidth = 52;
  const quotePartIdX = 74;
  const quotePartIdWidth = 36;
  const quotePartQtyX = 120;
  const quotePartUnitX = 144;
  const quotePartTaxX = 166;
  doc.text("PART NAME", quotePartNameX, y + 5.4);
  doc.text("PART ID", quotePartIdX, y + 5.4);
  doc.text("QTY", quotePartQtyX, y + 5.4, { align: "right" });
  doc.text("UNIT PRICE", quotePartUnitX, y + 5.4, { align: "right" });
  doc.text("TAX 18%", quotePartTaxX, y + 5.4, { align: "right" });
  doc.text("AMOUNT", rightX - 3, y + 5.4, { align: "right" });
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  partRows.forEach((row) => {
    const quantity = Number(row.quantity ?? row.qty ?? 1);
    const unitPrice = Number(row.unit_price ?? row.unitPrice ?? 0);
    const total = Number(row.total ?? unitPrice * quantity);
    const lineTax = Number(row.tax ?? Math.round(total * 0.18));

    doc.setTextColor(30, 41, 59);
    doc.text(fitText(doc, row.name, quotePartNameWidth), quotePartNameX, y);
    doc.text(
      fitText(doc, (row as InvoicePdfItem & { part_id?: string }).part_id || "—", quotePartIdWidth),
      quotePartIdX,
      y,
    );
    doc.text(String(quantity), quotePartQtyX, y, { align: "right" });
    doc.text(formatAmount(unitPrice), quotePartUnitX, y, { align: "right" });
    doc.text(formatAmount(lineTax), quotePartTaxX, y, { align: "right" });
    doc.text(formatAmount(total), rightX - 3, y, { align: "right" });
    y += 7;
  });

  if (partRows.length === 0) {
    doc.setTextColor(148, 163, 184);
    doc.text("No spare parts added", margin + 3, y);
    y += 7;
  }

  y += 2;
  drawRule(doc, y, pageWidth, margin);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("SUBTOTAL", rightX - 32, y, { align: "right" });
  doc.text(formatAmount(partsTotal), rightX - 3, y, { align: "right" });

  y += 12;

  const comments = data.note?.trim()
    ? data.note.trim()
    : [
        "1. Pricing is subject to part availability.",
        "2. Labour and material rates are valid only for the stated period.",
        "3. Approval is required before invoice generation.",
      ].join("\n");
  const commentsLines = doc.splitTextToSize(comments, 84);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text("OTHER COMMENTS", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);
  doc.setTextColor(51, 65, 85);
  doc.text(commentsLines, margin, y + 6);

  let totalsY = y;
  const totalsX = 126;
  const totalsValueX = rightX - 2;

  const totalRows: Array<{ label: string; value: number; bold?: boolean }> = [
    { label: "TOTAL SERVICES", value: labourTotal },
    { label: "TOTAL PARTS", value: partsTotal },
    { label: "Subtotal (before discount)", value: subtotalBeforeDiscount },
    { label: "Discount", value: Number(data.discount || 0) * -1 },
    { label: "TAX 18%", value: totalTax },
    { label: "TOTAL", value: grandTotal, bold: true },
  ];

  totalRows.forEach((row, index) => {
    if (row.bold) {
      doc.setFillColor(248, 250, 252);
      doc.rect(totalsX - 4, totalsY - 4.8, rightX - totalsX + 1, 9, "F");
    }

    doc.setFont("helvetica", row.bold ? "bold" : "normal");
    doc.setFontSize(row.bold ? 10 : 9);
    doc.setTextColor(row.bold ? 30 : 71, row.bold ? 41 : 85, row.bold ? 59 : 105);
    doc.text(row.label, totalsX, totalsY);
    const formattedValue = row.value < 0 ? `- ${formatAmount(Math.abs(row.value))}` : formatAmount(row.value);
    doc.text(formattedValue, totalsValueX, totalsY, { align: "right" });
    totalsY += index === totalRows.length - 1 ? 0 : 7;
  });

  const footerY = pageHeight - 22;
  drawRule(doc, footerY - 6, pageWidth, margin);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text("Thank you for considering Siragiri Vel Automobiles!", margin, footerY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("This is a computer generated quotation.", margin, footerY + 6);
  doc.text(`${data.quotation_number} · ${quoteDate} · Valid from ${startDate}`, pageWidth / 2, pageHeight - 6, { align: "center" });

  // Add Terms and Conditions Page
  doc.addPage();
  
  // Re-add Logos and Workshop Header to T&C page
  drawHeaderLogos(doc, margin, 10);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Terms & Conditions", margin, 32);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  
  let tcY = 42;
  const tcLineHeight = 4.5;
  const maxWidth = pageWidth - (margin * 2);
  
  TERMS_AND_CONDITIONS.forEach(para => {
    const lines = doc.splitTextToSize(para, maxWidth);
    // Check if we need a new page for long T&C (though standard T&C usually fits on one A4)
    if (tcY + (lines.length * tcLineHeight) > pageHeight - 20) {
      doc.addPage();
      tcY = 20;
    }
    doc.text(lines, margin, tcY);
    tcY += (lines.length * tcLineHeight) + 2;
  });

  // Signatures
  tcY += 15;
  doc.setFont("helvetica", "bold");
  doc.text("_______________________", margin, tcY);
  doc.text("_______________________", rightX, tcY, { align: "right" });
  tcY += 5;
  doc.text("Customer Signature", margin, tcY);
  doc.text("Authorized Signature", rightX, tcY, { align: "right" });

  doc.save(`${data.quotation_number.replaceAll("/", "-")}.pdf`);
}
