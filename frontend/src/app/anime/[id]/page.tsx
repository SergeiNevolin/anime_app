import { AnimePageContent } from "@/app/anime/[id]/anime-page-content";

/**
 * The page of a single anime.
 *
 * The page itself is a server component: it resolves the parameters of the
 * route and hands the identifier to the interactive part.
 */
export default async function AnimePage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;

  return <AnimePageContent animeId={id} />;
}
