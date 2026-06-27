"use client";

import { type ReactNode, useMemo, useState } from "react";

import { Check, RotateCcw, Search, X } from "lucide-react";

import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CaseRow {
  recordType: string;
  category: string;
  subcategory: string;
  subcategoryDetail: string;
  processor: string;
  description: string;
}

const CASES: CaseRow[] = [
  // === CARDS ===
  { recordType: "Cards", category: "Servicecard General", subcategory: "Limit question/ issue", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard General", subcategory: "Limit change", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard General", subcategory: "Limit check", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard General", subcategory: "Authorization request", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard General", subcategory: "Block cards", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard General", subcategory: "Unblock cards", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard General", subcategory: "Card renewal", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard General", subcategory: "Card check", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard General", subcategory: "Cost centre", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard General", subcategory: "Costs", subcategoryDetail: "Card fee", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard General", subcategory: "General question", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard Order", subcategory: "Ordering process request", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard Order", subcategory: "Error message (Wrong address data exceet)", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard Order", subcategory: "PIN reorder", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard Order", subcategory: "PIN change", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard Order", subcategory: "Wrong order", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard Order", subcategory: "Forgotten order", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard Order", subcategory: "Shipment issue", subcategoryDetail: "Card", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard Order", subcategory: "Shipment issue", subcategoryDetail: "PIN", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard Order", subcategory: "Shipment issue (delivery time)", subcategoryDetail: "", processor: "HQ Logistics", description: "" },
  { recordType: "Cards", category: "Servicecard Order", subcategory: "Card order", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard Order", subcategory: "Shipment status", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Servicecard Order", subcategory: "Replacement card", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Echarge", subcategory: "Account connection issue", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Echarge", subcategory: "Error message", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Echarge", subcategory: "Charging process", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Echarge", subcategory: "App", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Service Card Issue", subcategory: "Card wasn´t accepted at the station", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Service Card Issue", subcategory: "PIN reset", subcategoryDetail: "", processor: "HQ Cards", description: "" },
  { recordType: "Cards", category: "Service Card Issue", subcategory: "Station doesn´t exist anymore", subcategoryDetail: "", processor: "no automated link to a queue", description: "" },

  // === TOLL ===
  { recordType: "Toll", category: "New Order/ Registration", subcategory: "New order/ Registration", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "New Order/ Registration", subcategory: "Missing information", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "New Order/ Registration", subcategory: "Missing documents", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "New Order/ Registration", subcategory: "Incorrect Order", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "New Order/ Registration", subcategory: "Pick-up confirmation", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "New Order/ Registration", subcategory: "Shipment / Delivery time", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "New Order/ Registration", subcategory: "Task Status", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "New Order/ Registration", subcategory: "Cancellation of order", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Device Operation (How to…)", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Toll Context Status", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Vehicle data change", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Toll Context Change", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Replacement", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Declaration", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Incorrect Data (Service Center)", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Blocking", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Cancellation", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Missing documents", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Error Codes / Device Error", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Task Status", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Shipment issue (Delivery time)", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Accessories", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Device Overview", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Existing device / Replacement device", subcategory: "Device Return", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "General toll guidance", subcategory: "AKZ Media", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "General toll guidance", subcategory: "Country", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "General toll guidance", subcategory: "Service Center", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "General toll guidance", subcategory: "SmartConnect", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "General toll guidance", subcategory: "SmartConnect Light", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "General toll guidance", subcategory: "Consorzio", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "General toll guidance", subcategory: "other services (rebates/bridges …)", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Wrong Registration", subcategory: "Customer number", subcategoryDetail: "", processor: "HQ Toll Operations", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Rejections", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Rejected vehicle data change", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Rejected order", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Rejections context change", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Vehicle data change not possible", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Order not possible", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Missing documents", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Defect report", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "General Telepass e-mails", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Enforcement BEL", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "LPN mismatch", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Double TRX BEL", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Wrong registration", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Area C", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Confirmation receipt OBUs", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Declaration", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Cancellation Eurovignette", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Stockorder Eurovignette", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Discounts", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Call from customer", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "General information", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },
  { recordType: "Toll", category: "Contact Customer / Customer Care", subcategory: "Negative report Eurovignette", subcategoryDetail: "", processor: "Customer Care Team (country)", description: "" },

  // === TAX OPERATIONS ===
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Gasoleo Professionel", subcategoryDetail: "NIF registration", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Gasoleo Professionel", subcategoryDetail: "NIF complaints", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Contract Handling", subcategoryDetail: "Service type changes", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Contract Handling", subcategoryDetail: "Supplement", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Contract Handling", subcategoryDetail: "Conditions", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Contract Handling", subcategoryDetail: "New contract", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Contract Handling", subcategoryDetail: "Customer termination", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Contract Handling", subcategoryDetail: "Blocking", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Financial Handling", subcategoryDetail: "Chargeback", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Financial Handling", subcategoryDetail: "Rejections", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Financial Handling", subcategoryDetail: "Bank transfer", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Financial Handling", subcategoryDetail: "Saving deposit", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Customer Handling", subcategoryDetail: "Change of address", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Customer Handling", subcategoryDetail: "Change of VAT ID/ Tax number", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Customer Handling", subcategoryDetail: "Change of company name", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Operations", subcategoryDetail: "General topics EFIN", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Operations", subcategoryDetail: "General questions refund service", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Operations", subcategoryDetail: "User access EFIN systems", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Chargeback", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Prefinancing", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Service quality", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "EFIN receipt request", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Wrong company data", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Service contract", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Customer portal", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Refund duration", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Settled value unclear", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Commissions", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Service Fee", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Refund amount", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Minimum fee", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Goodwill credit note", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Missing payout", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Missing documents", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "HQ Tax Operations Team", subcategory: "Escalation Cases", subcategoryDetail: "Service Type", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Customer Handling", subcategoryDetail: "Customer consultation", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Customer Handling", subcategoryDetail: "Chargeback", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Customer Handling", subcategoryDetail: "Rejection", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Customer Handling", subcategoryDetail: "Document collection", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Customer Handling", subcategoryDetail: "Authority request", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Customer Handling", subcategoryDetail: "Change of address", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Customer Handling", subcategoryDetail: "Change of VAT ID/ Tax number", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Customer Handling", subcategoryDetail: "Change of company name", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Invoice Handling", subcategoryDetail: "Invoice correction", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Invoice Handling", subcategoryDetail: "Reprint invoice", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Contract Handling", subcategoryDetail: "Supplement", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Contract Handling", subcategoryDetail: "Conditions", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Contract Handling", subcategoryDetail: "New contract", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Contract Handling", subcategoryDetail: "Customer termination", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Contract Handling", subcategoryDetail: "Assignment Agreement", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Chargeback", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Prefinancing", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Service quality", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "EFIN receipt request", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Wrong company data", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Service contract", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Customer portal", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Refund duration", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Settled value unclear", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Commissions", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Service Fee", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Refund amount", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Minimum fee", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Goodwill credit note", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Missing payout", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Missing documents", processor: "HQ Tax Operations", description: "" },
  { recordType: "Tax Operations", category: "CO Customer Support", subcategory: "Claims Complaints", subcategoryDetail: "Service Type", processor: "HQ Tax Operations", description: "" },

  // === COMPLAINTS ===
  { recordType: "Complaints", category: "Fuel", subcategory: "Service problem at a gas station", subcategoryDetail: "Error message", processor: "Complaints Team", description: "Error messages on the gas station" },
  { recordType: "Complaints", category: "Fuel", subcategory: "Service problem at a gas station", subcategoryDetail: "Quality/ Service", processor: "Complaints Team", description: "Inquiries about quality/service at a gas station" },
  { recordType: "Complaints", category: "Fuel", subcategory: "Service problem at a gas station", subcategoryDetail: "Station doesn´t exist anymore", processor: "Complaints Team", description: "Inquiries about station doesn´t exist anymore" },
  { recordType: "Complaints", category: "Fuel", subcategory: "Service problem at a gas station", subcategoryDetail: "Station network", processor: "Complaints Team", description: "Inquiries about station network at a gas station" },
  { recordType: "Complaints", category: "Internal", subcategory: "Fuel", subcategoryDetail: "", processor: "Complaints Team", description: "" },
  { recordType: "Complaints", category: "Internal", subcategory: "Other Plus-Services", subcategoryDetail: "", processor: "Complaints Team", description: "" },
  { recordType: "Complaints", category: "Internal", subcategory: "Other Services", subcategoryDetail: "", processor: "Complaints Team", description: "" },
  { recordType: "Complaints", category: "Internal", subcategory: "Plus Services", subcategoryDetail: "", processor: "Complaints Team", description: "" },
  { recordType: "Complaints", category: "Internal", subcategory: "Toll", subcategoryDetail: "", processor: "Complaints Team", description: "" },
  { recordType: "Complaints", category: "Internal", subcategory: "EV", subcategoryDetail: "Transaction", processor: "Complaints Team", description: "" },
  { recordType: "Complaints", category: "Invoice", subcategory: "Conditions", subcategoryDetail: "Bonus payment", processor: "Complaints Team", description: "" },
  { recordType: "Complaints", category: "Vehicle Service", subcategory: "Quality/ Service", subcategoryDetail: "", processor: "HQ Complaints", description: "Inquiries about quality/service from partner" },
  { recordType: "Complaints", category: "Vehicle Service", subcategory: "Warranty", subcategoryDetail: "", processor: "HQ Complaints", description: "Inquiries about workshop service contract/guarantee" },
  { recordType: "Complaints", category: "Other Plus-Services", subcategory: "See case description", subcategoryDetail: "", processor: "Procurement", description: "" },

  // === LOGISTICS ===
  { recordType: "Logistics", category: "Logistics general", subcategory: "", subcategoryDetail: "", processor: "HQ Logistics queue", description: "All requests that don't fit into the other sub-/categories, e.g. reordering of copy paper" },
  { recordType: "Logistics", category: "Incoming Post", subcategory: "Incoming Post", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Daily incoming post and parcels that need to be put into the correct inboxes" },
  { recordType: "Logistics", category: "Incoming Post", subcategory: "Other", subcategoryDetail: "", processor: "HQ Logistics queue", description: "e.g. Return tollbox parcels that need to be opened and relevant documents allocated" },
  { recordType: "Logistics", category: "Outgoing Post", subcategory: "Pick Up Request", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Joint work between cards and logistics to ensure special requests regarding card delivery are fulfilled" },
  { recordType: "Logistics", category: "Outgoing Post", subcategory: "Other", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Respects all daily outgoing post and parcels" },
  { recordType: "Logistics", category: "Scanning", subcategory: "Quality Issue", subcategoryDetail: "", processor: "HQ Logistics queue", description: "In case scans have quality issues or are not scanned correctly, e.g. missing page or blurry" },
  { recordType: "Logistics", category: "Scanning", subcategory: "Other", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Mahnungen" },
  { recordType: "Logistics", category: "Tollbox Handling", subcategory: "Accessoires", subcategoryDetail: "", processor: "HQ Logistics queue", description: "e.g. extra cables for tollboxes, or fixation patches, etc." },
  { recordType: "Logistics", category: "Tollbox Handling", subcategory: "Express Shipment / Urgent Shipment", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Urgent cases that need to be addressed prioritized" },
  { recordType: "Logistics", category: "Tollbox Handling", subcategory: "Other", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Preparing tollbox blockings" },
  { recordType: "Logistics", category: "Billing", subcategory: "Invoice lost", subcategoryDetail: "", processor: "HQ Logistics queue", description: "In case of a lost invoice" },
  { recordType: "Logistics", category: "Billing", subcategory: "Other", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Anything regarding the covering and franking process of invoices" },
  { recordType: "Logistics", category: "Tracking", subcategory: "Tollboxes", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Questions regarding trackable tollbox deliveries" },
  { recordType: "Logistics", category: "Tracking", subcategory: "Cards", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Questions regarding trackable cards deliveries" },
  { recordType: "Logistics", category: "Tracking", subcategory: "Other", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Questions regarding trackable other deliveries" },
  { recordType: "Logistics", category: "Cards Returns", subcategory: "Card Returns", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Handling of all card returns in cooperation with cards team" },
  { recordType: "Logistics", category: "General", subcategory: "Card Holders", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Customers still request card holders and we send them out" },
  { recordType: "Logistics", category: "General", subcategory: "Gas Station Stickers", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Merchants still need stickers for gas stations" },
  { recordType: "Logistics", category: "General", subcategory: "Other", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Anything else not being mentioned before that logistics is responsible for" },
  { recordType: "Logistics", category: "Cards Advice Notes", subcategory: "Missing Advice", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Daily advice notes sent out that may be missing" },
  { recordType: "Logistics", category: "Cards Advice Notes", subcategory: "Other", subcategoryDetail: "", processor: "HQ Logistics queue", description: "Other problems with advice notes, e.g. changing email recipients, or wrong content" },
  { recordType: "Logistics", category: "EASY", subcategory: "EASY", subcategoryDetail: "", processor: "HQ Logistics queue", description: "All requests belonging to the release process of invoices as well as cost center allocation" },

  // === CUSTOMER SERVICE ===
  { recordType: "Customer Service", category: "Welcome Call", subcategory: "See case description", subcategoryDetail: "", processor: "", description: "1st advice to the customer, with information to ServiceCenter or Client Tool" },
  { recordType: "Customer Service", category: "Conditions", subcategory: "New conditions", subcategoryDetail: "", processor: "", description: "Customer gets new conditions for the 1st time or the previous conditions should be changed" },
  { recordType: "Customer Service", category: "Conditions", subcategory: "Confirmation of conditions", subcategoryDetail: "", processor: "", description: "Customer asks for a conditions confirmation or sales rep. needs this confirmation for further negotiations" },
  { recordType: "Customer Service", category: "Conditions", subcategory: "Change of product package", subcategoryDetail: "", processor: "", description: "The previous product package should be changed" },
  { recordType: "Customer Service", category: "Conditions", subcategory: "Homebase change", subcategoryDetail: "", processor: "", description: "Stammtankstelle – Preferred Station change" },
  { recordType: "Customer Service", category: "Conditions", subcategory: "Conditions deposited too late", subcategoryDetail: "", processor: "", description: "Customer complains that discounts were missing from the invoice" },
  { recordType: "Customer Service", category: "Conditions", subcategory: "Conditions deposited incorrectly", subcategoryDetail: "", processor: "", description: "Customer complaints that discounts were not correct" },
  { recordType: "Customer Service", category: "Conditions", subcategory: "Conditions not deposited", subcategoryDetail: "", processor: "", description: "Customer complains that discounts were missing from the invoice" },
  { recordType: "Customer Service", category: "Conditions", subcategory: "Bonus payment", subcategoryDetail: "", processor: "", description: "Questions to Bonus payment, Create a new bonus/kickback for customers" },
  { recordType: "Customer Service", category: "Conditions", subcategory: "Print and shipping costs", subcategoryDetail: "", processor: "", description: "Discount of the Print and shipping costs for paper invoice" },
  { recordType: "Customer Service", category: "Conditions", subcategory: "Dynamic pricing", subcategoryDetail: "", processor: "", description: "Special kind of pricing displaying" },
  { recordType: "Customer Service", category: "Termination", subcategory: "From customer", subcategoryDetail: "", processor: "", description: "Customer terminates the business relationship" },
  { recordType: "Customer Service", category: "Termination", subcategory: "Conditions", subcategoryDetail: "", processor: "", description: "Customer terminates his conditions agreement" },
  { recordType: "Customer Service", category: "Termination", subcategory: "Condition 300645", subcategoryDetail: "", processor: "", description: "No process (Special UTA DEU topic)" },
  { recordType: "Customer Service", category: "Master Data", subcategory: "Change all data", subcategoryDetail: "", processor: "", description: "Change of legal name & Legal form" },
  { recordType: "Customer Service", category: "Master Data", subcategory: "Change of support group", subcategoryDetail: "", processor: "", description: "Change of accounting group assignments" },
  { recordType: "Customer Service", category: "Master Data", subcategory: "Legal name/legal form change", subcategoryDetail: "", processor: "", description: "Customer has changed its name and either has a new company name or legal form" },
  { recordType: "Customer Service", category: "Master Data", subcategory: "Address addition/ change", subcategoryDetail: "", processor: "", description: "Customer is moved to a new address" },
  { recordType: "Customer Service", category: "Master Data", subcategory: "Change of bank details", subcategoryDetail: "", processor: "", description: "Customer tells us other banking details for direct debit" },
  { recordType: "Customer Service", category: "Master Data", subcategory: "Change of Tax ID", subcategoryDetail: "", processor: "", description: "Due to the reorganisation, the tax ID has also changed" },
  { recordType: "Customer Service", category: "Master Data", subcategory: "Addition/ Change of contact person", subcategoryDetail: "", processor: "", description: "Customer tells us a new contact person or our contact person changed" },
  { recordType: "Customer Service", category: "Master Data", subcategory: "Change of Shareholder / Management", subcategoryDetail: "", processor: "", description: "Change of a shareholder or management of a customer" },
  { recordType: "Customer Service", category: "Master Data", subcategory: "Payment term / Invoice frequency", subcategoryDetail: "Change payment term", processor: "", description: "We change the payment term for the customer" },
  { recordType: "Customer Service", category: "Master Data", subcategory: "Payment term / Invoice frequency", subcategoryDetail: "Change payment method", processor: "", description: "We change the payment method for the customer" },
  { recordType: "Customer Service", category: "Master Data", subcategory: "Payment term / Invoice frequency", subcategoryDetail: "Change billing term (invoice)", processor: "", description: "We change the billing term for customer" },
  { recordType: "Customer Service", category: "Master Data", subcategory: "Payment term / Invoice frequency", subcategoryDetail: "Change currency", processor: "", description: "In some cases we have to change the currency or create a bicurrency invoice" },
  { recordType: "Customer Service", category: "Invoicing Type", subcategory: "X-Rechnung", subcategoryDetail: "", processor: "", description: "Questions or change requests to this specific invoicing type" },
  { recordType: "Customer Service", category: "Invoicing Type", subcategory: "ZugFerd", subcategoryDetail: "", processor: "", description: "Questions or change requests to this specific invoicing type" },
  { recordType: "Customer Service", category: "Invoicing Type", subcategory: "Peppol", subcategoryDetail: "", processor: "", description: "Questions or change requests to this specific invoicing type" },
  { recordType: "Customer Service", category: "Invoicing Type", subcategory: "E-Invoicing", subcategoryDetail: "", processor: "", description: "Questions or change requests to this specific invoicing type" },
  { recordType: "Customer Service", category: "Invoicing Type", subcategory: "Paper invoice", subcategoryDetail: "", processor: "", description: "Questions or change requests to this specific invoicing type" },
  { recordType: "Customer Service", category: "Documents", subcategory: "Fuel receipt", subcategoryDetail: "", processor: "", description: "Customer requests fuel receipt" },
  { recordType: "Customer Service", category: "Documents", subcategory: "UTA invoicing documents", subcategoryDetail: "", processor: "", description: "Customer requests UTA invoicing documents, like invoice, summary sheet or Transaction sheet" },
  { recordType: "Customer Service", category: "Documents", subcategory: "Plus-service invoice", subcategoryDetail: "", processor: "", description: "Customer requests Plus-Service invoice" },
  { recordType: "Customer Service", category: "Documents", subcategory: "Toll trip statement", subcategoryDetail: "", processor: "", description: "Customer requests toll trip statement" },
  { recordType: "Customer Service", category: "Documents", subcategory: "Second original UTA invoice", subcategoryDetail: "", processor: "", description: "Customer requests a second original UTA invoice, e.g. the 1st one is lost in the post" },
  { recordType: "Customer Service", category: "Documents", subcategory: "Correction UTA invoice", subcategoryDetail: "", processor: "", description: "Customer has changed its name but further invoices were issued and correction is requested" },
  { recordType: "Customer Service", category: "Documents", subcategory: "Plus Service Credit Note", subcategoryDetail: "", processor: "", description: "Customer gets a Plus Service Credit Note" },
  { recordType: "Customer Service", category: "Documents", subcategory: "Workshop invoice", subcategoryDetail: "", processor: "", description: "Customer requests workshop invoice" },
  { recordType: "Customer Service", category: "Legal", subcategory: "GTC", subcategoryDetail: "", processor: "", description: "Questions to GTC" },
  { recordType: "Customer Service", category: "Legal", subcategory: "Consultation/issue", subcategoryDetail: "", processor: "", description: "Customer requests to GTC (if GTC have been changed)" },
  { recordType: "Customer Service", category: "Legal", subcategory: "Compliance", subcategoryDetail: "", processor: "", description: "Topics around complaints" },
  { recordType: "Customer Service", category: "Data protection", subcategory: "Consultation/issue", subcategoryDetail: "", processor: "", description: "Request Data protection violation, compromised data" },
  { recordType: "Customer Service", category: "General Customer Handling", subcategory: "Balance confirmations", subcategoryDetail: "", processor: "", description: "Customer requests a balance confirmation for the auditor" },
  { recordType: "Customer Service", category: "General Customer Handling", subcategory: "Lost mail", subcategoryDetail: "", processor: "", description: "Documents from the customer, which were send to UTA are lost in the post" },
  { recordType: "Customer Service", category: "General Customer Handling", subcategory: "Returned mail", subcategoryDetail: "", processor: "", description: "Letters or emails could not be delivered" },
  { recordType: "Customer Service", category: "Others", subcategory: "Spammails", subcategoryDetail: "", processor: "", description: "To close automated created cases as Spam and not process it" },
  { recordType: "Customer Service", category: "Others", subcategory: "Empty Voicemails", subcategoryDetail: "", processor: "", description: "To close created Voicemails" },

  // === PRICING ===
  { recordType: "Pricing", category: "Condition Ids", subcategory: "", subcategoryDetail: "", processor: "HQ pricing queue", description: "All topics related to condition handling" },
  { recordType: "Pricing", category: "Complaints", subcategory: "", subcategoryDetail: "", processor: "HQ pricing queue", description: "Customer complaints related to pricing issues" },
  { recordType: "Pricing", category: "Bonus payments", subcategory: "", subcategoryDetail: "", processor: "HQ pricing queue", description: "Various bonus payments to customers, e.g. annual bonus, quarterly or half-yearly bonus" },
  { recordType: "Pricing", category: "Mass import", subcategory: "", subcategoryDetail: "", processor: "HQ pricing queue", description: "Mass imports (creation or deletion) to be imported from Pricing in Notes" },
  { recordType: "Pricing", category: "Suppliers", subcategory: "", subcategoryDetail: "", processor: "HQ pricing queue", description: "All topics related to UTA suppliers" },
  { recordType: "Pricing", category: "Calculations", subcategory: "", subcategoryDetail: "", processor: "HQ pricing queue", description: "Customer calculations, offers and tenders, special condition requests" },
  { recordType: "Pricing", category: "Miscellaneous", subcategory: "", subcategoryDetail: "", processor: "HQ pricing queue", description: "All other topics" },

  // === INTERNAL CASE ===
  { recordType: "Internal case", category: "Fuel", subcategory: "see case description", subcategoryDetail: "", processor: "Queue needs to be selected manually", description: "" },
  { recordType: "Internal case", category: "Toll", subcategory: "see case description", subcategoryDetail: "", processor: "Queue needs to be selected manually", description: "" },
  { recordType: "Internal case", category: "Financial issue", subcategory: "see case description", subcategoryDetail: "", processor: "Queue needs to be selected manually", description: "" },
  { recordType: "Internal case", category: "Plus Services", subcategory: "see case description", subcategoryDetail: "", processor: "Queue needs to be selected manually", description: "" },
  { recordType: "Internal case", category: "Other Services", subcategory: "see case description", subcategoryDetail: "", processor: "Queue needs to be selected manually", description: "" },

  // === ONBOARDING ===
  { recordType: "Onboarding", category: "NKA SME", subcategory: "", subcategoryDetail: "None", processor: "DEU Onboarding", description: "Onboarding a new customer for SME" },
  { recordType: "Onboarding", category: "NKA Field", subcategory: "", subcategoryDetail: "None", processor: "DEU Onboarding", description: "Onboarding of a new customer FIELD" },
  { recordType: "Onboarding", category: "NKA KAM", subcategory: "", subcategoryDetail: "None", processor: "DEU Onboarding", description: "Onboarding of a new customer KAM" },
  { recordType: "Onboarding", category: "NKA Channel Partner", subcategory: "", subcategoryDetail: "None", processor: "DEU Onboarding", description: "Onboarding of a new Channel Partner" },
  { recordType: "Onboarding", category: "NKA R-Trucks", subcategory: "", subcategoryDetail: "None", processor: "DEU Onboarding", description: "Onboarding of a new customer for R-Trucks" },
  { recordType: "Onboarding", category: "NKA VRIO", subcategory: "", subcategoryDetail: "None", processor: "DEU Onboarding", description: "Onboarding of a new customer for VRIO" },
  { recordType: "Onboarding", category: "NKA GEFA", subcategory: "", subcategoryDetail: "None", processor: "DEU Onboarding", description: "Onboarding of a new customer for GEFA" },
  { recordType: "Onboarding", category: "General requests", subcategory: "", subcategoryDetail: "None", processor: "DEU Onboarding", description: "General questions / Requests" },

  // === FINANCE ===
  { recordType: "Finance", category: "Credit", subcategory: "Internal", subcategoryDetail: "see case description", processor: "defined by BTRIDA/profit centre", description: "All topics for which there is no subcategory available" },
  { recordType: "Finance", category: "Credit", subcategory: "Credit Limit", subcategoryDetail: "Credit Limit adjustments", processor: "defined by BTRIDA/profit centre", description: "Customer asks for a higher credit limit" },
  { recordType: "Finance", category: "Credit", subcategory: "Credit Limit", subcategoryDetail: "New Customer approval", processor: "defined by BTRIDA/profit centre", description: "New customer was not automatically approved" },
  { recordType: "Finance", category: "Credit", subcategory: "Securities", subcategoryDetail: "Request of new Security", processor: "defined by BTRIDA/profit centre", description: "Credit asks for a new security or for an increase of existing security" },
  { recordType: "Finance", category: "Credit", subcategory: "Securities", subcategoryDetail: "Release of Security", processor: "defined by BTRIDA/profit centre", description: "Credit releases a Security as it is not needed anymore" },
  { recordType: "Finance", category: "Credit", subcategory: "Securities", subcategoryDetail: "Incoming Security", processor: "defined by BTRIDA/profit centre", description: "Information to Credit that we have received a Security" },
  { recordType: "Finance", category: "Credit", subcategory: "Termination", subcategoryDetail: "", processor: "defined by BTRIDA/profit centre", description: "Customer cancels the relationship with us" },
  { recordType: "Finance", category: "Credit", subcategory: "Financial Data", subcategoryDetail: "Request financial data", processor: "defined by BTRIDA/profit centre", description: "If credit needs any more financial data/documents" },
  { recordType: "Finance", category: "Credit", subcategory: "Payment disruptions", subcategoryDetail: "Direct debit return / Payment request", processor: "defined by BTRIDA/profit centre", description: "Payment request to customer incl. sales because of direct debit return" },
  { recordType: "Finance", category: "Credit", subcategory: "Payment disruptions", subcategoryDetail: "Self-Payer / Payment request", processor: "defined by BTRIDA/profit centre", description: "Payment request to customer incl. sales because of not paid invoice (self-payer)" },
  { recordType: "Finance", category: "Credit", subcategory: "Payment disruptions", subcategoryDetail: "Complete blocking", processor: "defined by BTRIDA/profit centre", description: "We terminate the relationship with the customer due to open invoices or missing security" },
  { recordType: "Finance", category: "Credit", subcategory: "Payment term", subcategoryDetail: "Payment term direct debit rejected by bank", processor: "POL queue", description: "If a direct debit was rejected by bank (special POL case)" },
  { recordType: "Finance", category: "Credit", subcategory: "Payment term", subcategoryDetail: "Payment term direct debit accepted by bank", processor: "POL queue", description: "If a direct debit was accepted by bank (special POL case)" },
  { recordType: "Finance", category: "Credit", subcategory: "Payment term", subcategoryDetail: "Change currency", processor: "defined by BTRIDA/profit centre", description: "" },
  { recordType: "Finance", category: "Fraud & Prevention", subcategory: "Prevention", subcategoryDetail: "", processor: "HQ Fraud and Prevention queue", description: "Cases created for a prevention case" },
  { recordType: "Finance", category: "Fraud & Prevention", subcategory: "Fraud", subcategoryDetail: "", processor: "HQ Fraud and Prevention queue", description: "Cases created for a Fraud case" },
  { recordType: "Finance", category: "Fraud & Prevention", subcategory: "Skimming", subcategoryDetail: "", processor: "HQ Fraud and Prevention queue", description: "Cases created for a Skimming case" },
  { recordType: "Finance", category: "Accounting", subcategory: "Customer Pay-Out", subcategoryDetail: "", processor: "HQ Accounting", description: "Cases created for a customer request for payout" },
  { recordType: "Finance", category: "Accounting", subcategory: "Credit Notes creation", subcategoryDetail: "", processor: "HQ Accounting", description: "If a credit note has to be created" },
  { recordType: "Finance", category: "Accounting", subcategory: "Cash Deposits", subcategoryDetail: "", processor: "HQ Accounting", description: "All topics/questions around cash deposits" },
  { recordType: "Finance", category: "Accounting", subcategory: "Direct Debit Modifications", subcategoryDetail: "", processor: "HQ Accounting", description: "Changes to direct debits" },
  { recordType: "Finance", category: "Accounting", subcategory: "Offsetting", subcategoryDetail: "", processor: "HQ Accounting", description: "Request for offsetting" },
  { recordType: "Finance", category: "Accounting", subcategory: "Other", subcategoryDetail: "", processor: "HQ Accounting", description: "All other topics related to accounting" },
  { recordType: "Finance", category: "VAT & Indirect Tax", subcategory: "VAT/Tax number support", subcategoryDetail: "", processor: "HQ VAT & Indirect Tax", description: "Support for creation / Update of VAT/tax number" },
  { recordType: "Finance", category: "VAT & Indirect Tax", subcategory: "Enquiry on Invoice rules/Details", subcategoryDetail: "", processor: "HQ VAT & Indirect Tax", description: "Request/information on invoice rules/details" },
  { recordType: "Finance", category: "VAT & Indirect Tax", subcategory: "Invoice Correction", subcategoryDetail: "", processor: "HQ VAT & Indirect Tax", description: "If an invoice correction has to be made" },
  { recordType: "Finance", category: "VAT & Indirect Tax", subcategory: "Balance Confirmation/account statement", subcategoryDetail: "", processor: "HQ VAT & Indirect Tax", description: "If a balance confirmation / account statement is needed" },
  { recordType: "Finance", category: "VAT & Indirect Tax", subcategory: "Invoice Duplicate", subcategoryDetail: "", processor: "HQ VAT & Indirect Tax", description: "If you want to request an invoice duplicate" },
  { recordType: "Finance", category: "VAT & Indirect Tax", subcategory: "Others", subcategoryDetail: "", processor: "HQ VAT & Indirect Tax", description: "" },
];

/** Per record-type accent: badge chip + left card accent. Tuned for both themes. */
const RECORD_TYPE_STYLES: Record<string, { chip: string; accent: string }> = {
  Cards: { chip: "bg-blue-500/15 text-blue-700 dark:text-blue-300", accent: "bg-blue-500" },
  Toll: { chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", accent: "bg-emerald-500" },
  "Tax Operations": { chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300", accent: "bg-orange-500" },
  Complaints: { chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300", accent: "bg-rose-500" },
  Logistics: { chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300", accent: "bg-violet-500" },
  "Customer Service": { chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300", accent: "bg-teal-500" },
  Pricing: { chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300", accent: "bg-amber-500" },
  "Internal case": { chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300", accent: "bg-slate-500" },
  Onboarding: { chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300", accent: "bg-sky-500" },
  Finance: { chip: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300", accent: "bg-fuchsia-500" },
};

const FALLBACK_STYLE = {
  chip: "bg-muted text-muted-foreground",
  accent: "bg-muted-foreground",
};

function styleFor(recordType: string) {
  return RECORD_TYPE_STYLES[recordType] ?? FALLBACK_STYLE;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[´`']/g, "");
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!text || !query) return false;
  const t = normalize(text);
  const q = normalize(query);
  if (t.includes(q)) return true;
  // Allow a single typo for queries longer than 4 chars.
  if (q.length > 4) {
    for (let i = 0; i <= t.length - q.length + 1; i++) {
      let mismatches = 0;
      for (let j = 0; j < q.length; j++) {
        if (t[i + j] !== q[j]) mismatches++;
        if (mismatches > 1) break;
      }
      if (mismatches <= 1) return true;
    }
  }
  return false;
}

function scoreMatch(c: CaseRow, query: string): number {
  let score = 0;
  const q = query.toLowerCase();
  if (c.subcategoryDetail.toLowerCase().includes(q)) score += 10;
  if (c.subcategory.toLowerCase().includes(q)) score += 8;
  if (c.description.toLowerCase().includes(q)) score += 6;
  if (c.category.toLowerCase().includes(q)) score += 4;
  if (c.recordType.toLowerCase().includes(q)) score += 2;
  if (score === 0) {
    if (fuzzyMatch(c.subcategoryDetail, query)) score += 5;
    if (fuzzyMatch(c.subcategory, query)) score += 4;
    if (fuzzyMatch(c.description, query)) score += 3;
    if (fuzzyMatch(c.category, query)) score += 2;
  }
  return score;
}

function highlight(text: string, query: string): ReactNode {
  if (!text || !query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[3px] bg-warning/40 px-0.5 text-foreground">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// Mandatory case fields (domain content — kept in the team's working language).
const CHECKLIST = [
  { id: 1, label: "Kd-Nr.", hint: "im Betreff" },
  { id: 2, label: "Firmenname", hint: "+ Ort" },
  { id: 3, label: "Name Ansprechpartner", hint: "" },
  { id: 4, label: "Tel. Nr.", hint: "beim Kunden abfragen" },
  { id: 5, label: "Grund des Falls", hint: "worum es genau geht – keine bloße Rückrufbitte" },
];

const MAX_RESULTS = 40;

export function CaseSearchGuidebook() {
  const t = useTranslations("CaseSearch");
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const recordTypes = useMemo(
    () => ["All", ...Array.from(new Set(CASES.map(c => c.recordType)))],
    []
  );

  const q = query.trim();

  const results = useMemo(() => {
    if (!q && selectedType === "All") return [];
    return CASES.filter(c => {
      if (selectedType !== "All" && c.recordType !== selectedType) return false;
      if (!q) return true;
      return scoreMatch(c, q) > 0;
    })
      .map(c => ({ ...c, _score: q ? scoreMatch(c, q) : 0 }))
      .sort((a, b) => b._score - a._score)
      .slice(0, MAX_RESULTS);
  }, [q, selectedType]);

  const doneCount = CHECKLIST.filter(i => checked[i.id]).length;
  const allDone = doneCount === CHECKLIST.length;

  return (
    <div className="space-y-5">
      {/* Mandatory-fields checklist */}
      <Card className={cn(allDone && "border-success/40")}>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{t("mandatoryTitle")}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                  allDone
                    ? "bg-success/15 text-success"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {doneCount}/{CHECKLIST.length}
              </span>
            </div>
            {doneCount > 0 && (
              <button
                type="button"
                onClick={() => setChecked({})}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
                {t("reset")}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("mandatoryHint")}</p>
          <div className="flex flex-wrap gap-2">
            {CHECKLIST.map(item => {
              const on = !!checked[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setChecked(p => ({ ...p, [item.id]: !p[item.id] }))
                  }
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors",
                    on
                      ? "border-success/40 bg-success/10 text-foreground"
                      : "border-border bg-card hover:bg-accent"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                      on
                        ? "bg-success text-success-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {on ? <Check className="size-3" /> : item.id}
                  </span>
                  <span className="font-medium">{item.label}</span>
                  {item.hint && (
                    <span className="text-xs italic text-muted-foreground">
                      ({item.hint})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-11 pl-10 pr-10 text-base"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("clear")}
            className="absolute right-2.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {recordTypes.map(rt => {
          const active = selectedType === rt;
          const style = rt === "All" ? null : styleFor(rt);
          return (
            <button
              key={rt}
              type="button"
              onClick={() => setSelectedType(rt)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <span className="flex items-center gap-1.5">
                {style && (
                  <span className={cn("size-2 rounded-full", style.accent)} />
                )}
                {rt === "All" ? t("allTypes") : rt}
              </span>
            </button>
          );
        })}
      </div>

      {/* Results */}
      {!q && selectedType === "All" ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Search className="size-6" />
          </span>
          <p className="text-sm font-medium">{t("emptyTitle")}</p>
          <p className="text-xs text-muted-foreground">
            {t("casesAvailable", { count: CASES.length })}
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm font-medium">
            {t("noResultsTitle", { query: q })}
          </p>
          <p className="text-xs text-muted-foreground">{t("noResultsHint")}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t("resultsCount", { count: results.length })}
            {results.length === MAX_RESULTS ? ` ${t("topN", { n: MAX_RESULTS })}` : ""}
          </p>
          <div className="space-y-2.5">
            {results.map((c, i) => {
              const style = styleFor(c.recordType);
              return (
                <div
                  key={`${c.recordType}-${c.category}-${c.subcategory}-${c.subcategoryDetail}-${i}`}
                  className="relative overflow-hidden rounded-xl border border-border/70 bg-card p-4 pl-5 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]"
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 w-1",
                      style.accent
                    )}
                  />
                  <div className="mb-3">
                    <span
                      className={cn(
                        "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                        style.chip
                      )}
                    >
                      {c.recordType}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t("fieldCategory")} value={c.category} query={q} />
                    {c.subcategory && (
                      <Field
                        label={t("fieldSubcategory")}
                        value={c.subcategory}
                        query={q}
                      />
                    )}
                    {c.subcategoryDetail && c.subcategoryDetail !== "None" && (
                      <Field
                        label={t("fieldSubcategoryDetail")}
                        value={c.subcategoryDetail}
                        query={q}
                      />
                    )}
                    {c.processor && (
                      <Field
                        label={t("fieldProcessor")}
                        value={c.processor}
                        query={q}
                      />
                    )}
                  </div>
                  {c.description && (
                    <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm leading-relaxed text-foreground">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("whenToUse")}{" "}
                      </span>
                      {highlight(c.description, q)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  query,
}: {
  label: string;
  value: string;
  query: string;
}) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium leading-snug">
        {highlight(value, query)}
      </div>
    </div>
  );
}
