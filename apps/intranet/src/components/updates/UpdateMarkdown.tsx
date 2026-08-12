"use client";

import type { ComponentProps, ReactNode } from "react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { headingAnchor, intranetLinkLabel } from "@/lib/intranet-links";

function textContent(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textContent).join("");
  if (children && typeof children === "object" && "props" in children) {
    return textContent((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

function UpdateLink({ href = "", children, ...props }: ComponentProps<"a">) {
  const label = intranetLinkLabel(href);
  const isRawUrl = textContent(children).trim() === href;

  return (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      {...(label ? { "data-intranet-link-url": href, title: href } : {})}
    >
      {label && isRawUrl ? label : children}
    </a>
  );
}

function UpdateHeading({
  level,
  children,
  ...props
}: ComponentProps<"h1"> & { level: "h1" | "h2" | "h3" }) {
  const Tag = level;
  const id = headingAnchor(textContent(children));
  return (
    <Tag {...props} id={id} data-hash-anchor>
      {children}
    </Tag>
  );
}

export function UpdateMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: UpdateLink,
        h1: (props) => <UpdateHeading {...props} level="h1" />,
        h2: (props) => <UpdateHeading {...props} level="h2" />,
        h3: (props) => <UpdateHeading {...props} level="h3" />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
