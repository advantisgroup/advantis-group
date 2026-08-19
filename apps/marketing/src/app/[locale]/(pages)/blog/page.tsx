import Image from "next/image";

import { type Metadata } from "next";
import { ArrowRight, Newspaper } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { type Locale } from "@/i18n/request";
import { getPosts, urlForImage, type BlogPost } from "@/lib/sanity";

function blogLanguage(locale: Locale): "de" | "en" {
  return locale === "de" ? "de" : "en";
}

function formatDate(date: string, locale: Locale) {
  return new Date(date).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blog" });

  return {
    title: t("title"),
    description: t("subtitle"),
  };
}

function PostCard({ post, locale }: { post: BlogPost; locale: Locale }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group block h-full">
      <article className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-primary/40">
        {post.mainImage ? (
          <div className="relative aspect-video">
            <Image
              src={urlForImage(post.mainImage).width(600).height(340).url()}
              alt={post.title}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        ) : null}
        <div className="flex flex-1 flex-col gap-3 p-6">
          <p className="text-xs text-muted-foreground">{formatDate(post.publishedAt, locale)}</p>
          <h2 className="text-lg font-bold leading-snug transition-colors group-hover:text-primary">
            {post.title}
          </h2>
          <p className="text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>
          {post.author ? (
            <p className="mt-auto pt-2 text-xs text-muted-foreground">{post.author}</p>
          ) : null}
        </div>
      </article>
    </Link>
  );
}

function EmptyState({ t }: { t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <div className="mx-auto max-w-xl">
      <div className="flex flex-col items-center gap-4 rounded-md border border-border bg-card px-8 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10">
          <Newspaper className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-semibold">{t("empty")}</p>
          <p className="text-sm text-muted-foreground">{t("emptySubtitle")}</p>
        </div>
        <Button asChild variant="outline" className="group mt-2">
          <Link href="/contact">
            {t("emptyCta")}
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default async function BlogPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const [t, posts] = await Promise.all([
    getTranslations({ locale, namespace: "blog" }),
    getPosts(blogLanguage(locale)),
  ]);

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 pt-24 pb-24 space-y-16">
        <section className="max-w-4xl mx-auto space-y-4 text-center">
          <h1 className="text-5xl md:text-7xl font-bold">{t("title")}</h1>
          <p className="text-lg text-muted-foreground">{t("subtitle")}</p>
        </section>

        {posts.length === 0 ? (
          <EmptyState t={t} />
        ) : (
          <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
            {posts.map((post) => (
              <PostCard key={post._id} post={post} locale={locale} />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
