import Image from "next/image";
import { notFound } from "next/navigation";

import { type Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import sanitizeHtml from "sanitize-html";

import { BlogTableOfContents } from "@/components/blog/BlogTableOfContents";
import { CategoryEyebrow, PostMeta } from "@/components/blog/PostMeta";
import { SharePost } from "@/components/blog/SharePost";
import { Link } from "@/i18n/navigation";
import { type Locale } from "@/i18n/request";
import { addHeadingIds } from "@/lib/blog-headings";
import { isBlogCategory } from "@/lib/blog-categories";
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
      type: "article",
      title: post.title,
      description: post.excerpt,
      publishedTime: new Date(post.publishedAt).toISOString(),
      authors: post.author ? [post.author] : undefined,
      // Without this a shared link renders as a bare text card everywhere.
      images: post.mainImageUrl ? [{ url: post.mainImageUrl }] : undefined,
    },
    twitter: {
      card: post.mainImageUrl ? "summary_large_image" : "summary",
      title: post.title,
      description: post.excerpt,
      images: post.mainImageUrl ? [post.mainImageUrl] : undefined,
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

  const category = isBlogCategory(post.category) ? t(`categories.${post.category}`) : null;
  const { html: bodyHtml, headings } = post.body
    ? addHeadingIds(sanitizeHtml(post.body, sanitizeOptions))
    : { html: "", headings: [] };

  return (
    <div className="min-h-screen">
      <main className="relative container mx-auto max-w-3xl px-4 pt-28 pb-24">
        <div className="absolute left-full top-0 ml-10 w-56">
          <BlogTableOfContents headings={headings} />
        </div>

        <Link
          href="/blog"
          className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          {t("back")}
        </Link>

        <article className="mt-10">
          <header className="space-y-6 border-b border-border pb-10">
            {category ? <CategoryEyebrow label={category} /> : null}
            <h1 className="font-[family-name:var(--font-outfit)] text-4xl font-bold leading-[1.1] tracking-tight md:text-5xl">
              {post.title}
            </h1>
            {/*
             * The excerpt doubles as the article's lede. It's written for the
             * list card, so it can run long — the live post opens with 724
             * characters of it. At display size in muted grey that reads as a
             * wall before the reader has started: hence body-size type, near
             * full-strength colour, and the same measure as the article
             * itself, so it reads as a first paragraph rather than a banner.
             */}
            <p className="max-w-[50ch] text-lg leading-[1.75] text-foreground/75">{post.excerpt}</p>
            <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
              <PostMeta
                author={post.author}
                authorAvatarUrl={post.authorAvatarUrl}
                publishedAt={post.publishedAt}
                readingMinutes={post.readingMinutes}
                readingLabel={
                  post.readingMinutes ? t("readingTime", { minutes: post.readingMinutes }) : null
                }
                locale={locale}
                size="md"
              />
              <SharePost shareCode={post.shareCode} longPath={`/${locale}/blog/${post.slug}`} />
            </div>
          </header>

          {post.mainImageUrl ? (
            <div className="relative mt-12 aspect-[16/9] overflow-hidden rounded-xl border border-border/60">
              <Image
                src={post.mainImageUrl}
                alt=""
                fill
                sizes="(min-width: 768px) 48rem, 100vw"
                className="object-cover"
                priority
              />
            </div>
          ) : null}

          {bodyHtml ? (
            /*
             * `max-w-[50ch]` rather than the old `max-w-none`. Unconstrained,
             * the body filled the full 736px container — which in this font
             * measures 99 characters a line, way past the ~75 where the eye
             * starts losing its place on the return sweep. (Note `ch` is the
             * width of "0", not of an average letter: 50ch lands at ~74 real
             * characters here, not 50.) The container stays wide, so the
             * heading and hero image still use all of it; only the reading
             * column narrows.
             */
            <div
              className="prose prose-neutral mt-12 max-w-[50ch] scroll-mt-24 dark:prose-invert prose-headings:font-[family-name:var(--font-outfit)] prose-headings:tracking-tight prose-h2:mt-14 prose-h2:mb-4 prose-h3:mt-10 prose-h3:mb-3 prose-p:leading-[1.75] prose-a:text-primary prose-img:rounded-lg md:prose-lg [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24"
              // The composer's RichTextEditor only ever produces constrained
              // HTML through normal use, but the stored string is a raw
              // Convex mutation arg with no server-side sanitization in
              // front of it, and this renders on the public site —
              // sanitizing again here is defense in depth, not scope creep.
              // Sanitizing happens above, before heading ids are stamped in.
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          ) : null}
        </article>
      </main>
    </div>
  );
}
