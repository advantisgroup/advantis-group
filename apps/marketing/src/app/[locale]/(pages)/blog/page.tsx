import Image from "next/image";

import { type Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { type Locale } from "@/i18n/request";
import { getPosts, urlForImage } from "@/lib/sanity";

function blogLanguage(locale: Locale): "de" | "en" {
  return locale === "de" ? "de" : "en";
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
          <p className="text-center text-muted-foreground">{t("empty")}</p>
        ) : (
          <section className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
            {posts.map((post) => (
              <Link key={post._id} href={`/blog/${post.slug}`}>
                <Card
                  nested
                  className="h-full overflow-hidden hover:border-primary/40 transition-colors"
                >
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
                  <CardHeader>
                    <CardTitle className="text-xl">{post.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-3">{post.excerpt}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(post.publishedAt).toLocaleDateString(locale)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
