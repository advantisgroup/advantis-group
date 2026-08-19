import Image from "next/image";
import { notFound } from "next/navigation";

import { type Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import sanitizeHtml from "sanitize-html";

import { Link } from "@/i18n/navigation";
import { type Locale } from "@/i18n/request";
import { getPost } from "@/lib/blog";

// Re-fetch from Convex periodically instead of freezing the post at build time.
export const revalidate = 60;

// sanitize-html has no DOM dependency (unlike isomorphic-dompurify's jsdom,
// which doesn't bundle reliably for the Vercel Node runtime), so it's the
// safe choice for sanitizing server-rendered HTML here.
const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["kbd"]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    "*": ["class"],
    a: ["href", "target", "rel"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
};

function blogLanguage(locale: Locale): "de" | "en" {
  return locale === "de" ? "de" : "en";
}

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getPost(blogLanguage(locale), slug);

  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  const [t, post] = await Promise.all([
    getTranslations({ locale, namespace: "blog" }),
    getPost(blogLanguage(locale), slug),
  ]);

  if (!post) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 pt-24 pb-24">
        <article className="max-w-3xl mx-auto space-y-8">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("back")}
          </Link>

          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold">{post.title}</h1>
            <p className="text-sm text-muted-foreground">
              {new Date(post.publishedAt).toLocaleDateString(locale)}
              {post.author ? ` — ${post.author}` : ""}
            </p>
          </div>

          {post.mainImageUrl ? (
            <div className="relative aspect-video rounded-md overflow-hidden">
              <Image
                src={post.mainImageUrl}
                alt={post.title}
                fill
                sizes="(min-width: 768px) 768px, 100vw"
                className="object-cover"
                priority
              />
            </div>
          ) : null}

          {post.body ? (
            <div
              className="prose prose-neutral dark:prose-invert max-w-none"
              // The composer's RichTextEditor only ever produces constrained
              // HTML through normal use, but the stored string is a raw
              // Convex mutation arg with no server-side sanitization in
              // front of it, and this renders on the public site —
              // sanitizing again here is defense in depth, not scope creep.
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.body, sanitizeOptions) }}
            />
          ) : null}
        </article>
      </main>
    </div>
  );
}
