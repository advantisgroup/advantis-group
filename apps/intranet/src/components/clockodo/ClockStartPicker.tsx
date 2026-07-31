"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClockOption } from "@/lib/clockodo-clock";

/** The customer/service picker shown once "start clock" needs a choice —
 * shared by the Dashboard's dialog and the header pill's popover so both
 * present the identical form instead of two copies. */
export function ClockStartPicker({
  options,
  customerId,
  onCustomerChange,
  serviceId,
  onServiceChange,
  busy,
  onStart,
}: {
  options: { customers: ClockOption[]; services: ClockOption[] } | null;
  customerId: string;
  onCustomerChange: (value: string) => void;
  serviceId: string;
  onServiceChange: (value: string) => void;
  busy: boolean;
  onStart: () => void;
}) {
  const t = useTranslations("Absences");
  return (
    <div className="space-y-3">
      <Select value={customerId} onValueChange={onCustomerChange}>
        <SelectTrigger>
          <SelectValue placeholder={t("clockCustomer")} />
        </SelectTrigger>
        <SelectContent>
          {options?.customers.map(customer => (
            <SelectItem key={customer.id} value={String(customer.id)}>
              {customer.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={serviceId} onValueChange={onServiceChange}>
        <SelectTrigger>
          <SelectValue placeholder={t("clockService")} />
        </SelectTrigger>
        <SelectContent>
          {options?.services.map(service => (
            <SelectItem key={service.id} value={String(service.id)}>
              {service.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button className="w-full" onClick={onStart} disabled={!customerId || !serviceId || busy}>
        {t("startClock")}
      </Button>
    </div>
  );
}
