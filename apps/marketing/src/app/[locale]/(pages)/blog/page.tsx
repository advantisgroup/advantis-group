import Image from "next/image";

import { type Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { CategoryEyebrow, PostMeta } from "@/components/blog/PostMeta";
import { Display, PageField } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { type Locale } from "@/i18n/request";
import { BLOG_CATEGORIES, isBlogCategory } from "@/lib/blog-categories";
import { getPosts, type BlogPostSummary } from "@/lib/blog";
import { cn } from "@/lib/utils";

// Re-fetch from Convex periodically instead of freezing the list at build time.
export const revalidate = 60;

function blogLanguage(locale: Locale): "de" | "en" {
  return locale === "de" ? "de" : "en";
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function readingLabel(post: BlogPostSummary, t: Translator): string | null {
  return post.readingMinutes ? t("readingTime", { minutes: post.readingMinutes }) : null;
}

function categoryLabel(category: string | null, t: Translator): string | null {
  return isBlogCategory(category) ? t(`categories.${category}`) : null;
}

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blog" });

  return { title: t("title"), description: t("subtitle") };
}

/**
 * The lead story. Gets the full width and display-scale type so the page has
 * an obvious entry point instead of nine equal-weight tiles; falls back to a
 * text-only treatment when there's no cover image, which is the common case
 * here — the layout is built to look intentional without artwork, not to
 * leave a hole where a picture should be.
 */
function HeroPost({ post, locale, t }: { post: BlogPostSummary; locale: Locale; t: Translator }) {
  const category = categoryLabel(post.category, t);

  return (
    <Link href={`/blog/${post.slug}`} className="group block">
      <article
        className={cn("grid items-center gap-8", post.mainImageUrl && "lg:grid-cols-2 lg:gap-12")}
      >
        <div className={cn("space-y-5", !post.mainImageUrl && "max-w-3xl")}>
          {category ? <CategoryEyebrow label={category} /> : null}
          <h2
            className={cn(
              "font-[family-name:var(--font-outfit)] font-bold leading-[1.05] tracking-tight transition-colors group-hover:text-primary",
              post.mainImageUrl ? "text-3xl md:text-5xl" : "text-4xl md:text-6xl",
            )}
          >
            {post.title}
          </h2>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {post.excerpt}
          </p>
          <PostMeta
            author={post.author}
            authorAvatarUrl={post.authorAvatarUrl}
            publishedAt={post.publishedAt}
            readingMinutes={post.readingMinutes}
            readingLabel={readingLabel(post, t)}
            locale={locale}
            size="md"
          />
        </div>

        {post.mainImageUrl ? (
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border/60 lg:order-last">
            <Image
              src={post.mainImageUrl}
              alt=""
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              priority
            />
          </div>
        ) : null}
      </article>
    </Link>
  );
}

/**
 * Secondary stories: hairline-separated rows rather than bordered cards.
 * Rules carry the same grouping a box does at a fraction of the visual
 * weight, and they don't collapse into a wall of rectangles once there are
 * more than a handful of posts.
 */
function PostRow({ post, locale, t }: { post: BlogPostSummary; locale: Locale; t: Translator }) {
  const category = categoryLabel(post.category, t);

  return (
    <Link href={`/blog/${post.slug}`} className="group block py-8 first:pt-0">
      <article className="grid gap-5 md:grid-cols-[1fr_13rem] md:items-start md:gap-8">
        <div className="order-2 space-y-3 md:order-1">
          {category ? <CategoryEyebrow label={category} /> : null}
          <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold leading-snug tracking-tight transition-colors group-hover:text-primary md:text-[1.75rem]">
            {post.title}
          </h2>
          <p className="line-clamp-2 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            {post.excerpt}
          </p>
          <PostMeta
            author={post.author}
            authorAvatarUrl={post.authorAvatarUrl}
            publishedAt={post.publishedAt}
            readingMinutes={post.readingMinutes}
            readingLabel={readingLabel(post, t)}
            locale={locale}
          />
        </div>

        {post.mainImageUrl ? (
          <div className="relative order-1 aspect-[16/9] overflow-hidden rounded-lg border border-border/60 md:order-2 md:aspect-[4/3]">
            <Image
              src={post.mainImageUrl}
              alt=""
              fill
              sizes="(min-width: 768px) 13rem, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          </div>
        ) : null}
      </article>
    </Link>
  );
}

/** Server-rendered filter: each pill is a plain link carrying `?category=`,
 *  so a filtered view is shareable and needs no client-side state. */
function CategoryFilter({
  categories,
  active,
  t,
}: {
  categories: string[];
  active: string | null;
  t: Translator;
}) {
  const pill = "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors";

  return (
    <nav
      aria-label={t("filterLabel")}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Link
        href="/blog"
        className={cn(
          pill,
          active === null
            ? "border-foreground bg-foreground text-background"
            : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
        )}
      >
        {t("filterAll")}
      </Link>
      {categories.map((category) => (
        <Link
          key={category}
          href={{ pathname: "/blog", query: { category } }}
          className={cn(
            pill,
            active === category
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
          )}
        >
          {t(`categories.${category}`)}
        </Link>
      ))}
    </nav>
  );
}

function EmptyState({ t, filtered }: { t: Translator; filtered: boolean }) {
  return (
    <div className="border-t border-border py-24 text-center">
      <p className="font-[family-name:var(--font-outfit)] text-2xl font-bold tracking-tight">
        {filtered ? t("emptyFiltered") : t("empty")}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {filtered ? t("emptyFilteredSubtitle") : t("emptySubtitle")}
      </p>
      {filtered ? (
        <Button asChild variant="outline" className="mt-6">
          <Link href="/blog">{t("filterAll")}</Link>
        </Button>
      ) : (
        <Button asChild variant="outline" className="group mt-6">
          <Link href="/contact">
            {t("emptyCta")}
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      )}
    </div>
  );
}

export default async function BlogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const [{ locale }, { category }] = await Promise.all([params, searchParams]);
  const [t, allPosts] = await Promise.all([
    getTranslations({ locale, namespace: "blog" }),
    getPosts(blogLanguage(locale)),
  ]);

  const activeCategory = isBlogCategory(category) ? category : null;
  const posts = activeCategory
    ? allPosts.filter((post) => post.category === activeCategory)
    : allPosts;

  // Only offer a filter for categories that actually have posts — an empty
  // pill is a dead end, and with one category the whole row is noise.
  const usedCategories = BLOG_CATEGORIES.filter((c) =>
    allPosts.some((post) => post.category === c),
  );

  const [hero, ...rest] = posts;

  return (
    <div className="relative min-h-screen bg-background">
      <PageField />

      <main className="relative mx-auto w-full max-w-5xl px-5 pt-32 pb-24 md:px-10 md:pt-40">
        <header className="space-y-4 border-b border-rule pb-10">
          <Display as="h1" size="lg">
            {t("title")}
          </Display>
          <p className="max-w-2xl text-lg text-muted-foreground">{t("subtitle")}</p>
          {usedCategories.length > 1 ? (
            <div className="pt-2">
              <CategoryFilter categories={usedCategories} active={activeCategory} t={t} />
            </div>
          ) : null}
        </header>

        {posts.length === 0 ? (
          <EmptyState t={t} filtered={activeCategory !== null} />
        ) : (
          <>
            <section className="py-12 md:py-16">
              <HeroPost post={hero} locale={locale} t={t} />
            </section>

            {rest.length > 0 ? (
              <section className="divide-y divide-rule border-t border-rule">
                {rest.map((post) => (
                  <PostRow key={post._id} post={post} locale={locale} t={t} />
                ))}
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
