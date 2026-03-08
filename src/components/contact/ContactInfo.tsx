import { Link } from "@/i18n/navigation";
import { type ContactInfoItem } from "@/types/contact";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

export function ContactInfoMobile({ items }: { items: ContactInfoItem[] }) {
  return (
    <div className="space-y-4">
      {items.map(info => {
        const Icon = info.icon;
        return (
          <Link
            key={info.label}
            href={info.href}
            className="flex items-center gap-4 p-4 border border-border rounded-lg hover:border-foreground/40 transition-colors"
          >
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                {info.label}
              </p>
              <p className="text-base text-foreground wrap-break-word">
                {info.value}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function ContactInfoDesktop({ items }: { items: ContactInfoItem[] }) {
  return (
    <div className="border border-border overflow-hidden rounded-t-lg">
      <div className="grid md:grid-cols-3 divide-x divide-border">
        {items.map(info => {
          const Icon = info.icon;
          return (
            <Card key={info.label} className="border-0 rounded-none">
              <CardHeader style={{ paddingBottom: "0px" }}>
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  {info.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  href={info.href}
                  className="text-muted-foreground hover:text-foreground transition-colors wrap-break-word"
                >
                  {info.value}
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
