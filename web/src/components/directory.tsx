"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownWideNarrow, Coffee, Landmark, Leaf, MapPin, SlidersHorizontal, Sparkles } from "lucide-react";
import { useApiResource } from "../hooks/use-api-resource";
import type { PlaceSummary } from "../lib/types";
import { PlaceCard } from "./place-card";
import { useTraveller } from "./traveller-provider";
import { Button, StatusPanel } from "./ui";

const categories = [
  { value: "", label: "All places", icon: SlidersHorizontal }, { value: "History", label: "History", icon: Landmark },
  { value: "Food", label: "Food", icon: Coffee }, { value: "Nature", label: "Nature", icon: Leaf },
];

function DirectoryHeading() {
  return (
    <section className="directory-heading" aria-labelledby="directory-title">
      <div className="city-label"><MapPin size={14} aria-hidden="true" /> Addis Ababa, Ethiopia</div>
      <h1 id="directory-title">A city of stories.<br /><em>Find your next one.</em></h1>
      <p>Explore the history, flavours, and green spaces of Addis Ababa.<br className="desktop-break" /> A good place to start your next little adventure.</p>
    </section>
  );
}

function PlaceSkeletons() {
  return <div className="place-grid" role="status" aria-label="Loading places">{[1, 2, 3, 4, 5, 6].map((id) => (
    <div className="place-card skeleton-card" key={id} aria-hidden="true"><div className="skeleton skeleton-image" /><div className="place-card-content"><div className="skeleton skeleton-short" /><div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line" /></div></div>
  ))}</div>;
}

export function DirectoryLoading() {
  return <div className="page-container directory"><DirectoryHeading /><PlaceSkeletons /></div>;
}

export function Directory() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { userId } = useTraveller();
  const urlCategory = searchParams.get("category") ?? "";
  const urlSort = searchParams.get("sort") ?? "top-rated";
  const urlKey = JSON.stringify([urlCategory, urlSort]);
  const [filters, setFilters] = useState({ category: urlCategory, sort: urlSort });
  const latestFilters = useRef(filters);
  const pendingUrls = useRef<string[]>([]);

  useEffect(() => {
    const acknowledged = pendingUrls.current.lastIndexOf(urlKey);
    if (acknowledged >= 0) {
      pendingUrls.current = pendingUrls.current.slice(acknowledged + 1);
      // An earlier navigation may finish while a newer choice is still pending.
      if (pendingUrls.current.length > 0) return;
    } else {
      pendingUrls.current = [];
    }
    const next = { category: urlCategory, sort: urlSort };
    latestFilters.current = next;
    setFilters((current) => current.category === next.category && current.sort === next.sort ? current : next);
  }, [urlCategory, urlSort, urlKey]);

  useEffect(() => {
    function restoreHistory() {
      pendingUrls.current = [];
      const params = new URLSearchParams(window.location.search);
      const next = { category: params.get("category") ?? "", sort: params.get("sort") ?? "top-rated" };
      latestFilters.current = next;
      setFilters(next);
    }
    window.addEventListener("popstate", restoreHistory);
    return () => window.removeEventListener("popstate", restoreHistory);
  }, []);

  const { category, sort } = filters;
  const query = new URLSearchParams();
  if (category) query.set("category", category);
  query.set("sort", sort);
  const { data, loading, error, reload } = useApiResource<PlaceSummary[]>(`/api/places?${query}`, userId);
  function updateFilters(change: Partial<typeof filters>) {
    // Merge controls against the latest choice, not the URL from this render.
    const selected = { ...latestFilters.current, ...change };
    latestFilters.current = selected;
    setFilters(selected);
    pendingUrls.current.push(JSON.stringify([selected.category, selected.sort]));
    const next = new URLSearchParams();
    if (selected.category) next.set("category", selected.category);
    if (selected.sort !== "top-rated") next.set("sort", selected.sort);
    router.replace(next.size ? `/?${next}` : "/", { scroll: false });
  }
  return (
    <div className="page-container directory">
      <DirectoryHeading />
      <div className="directory-toolbar">
        <div className="category-filters" role="group" aria-label="Filter by category">{categories.map(({ value, label, icon: Icon }) => (
          <button key={value} type="button" className={`filter-chip ${category === value ? "filter-chip--selected" : ""}`} aria-pressed={category === value} onClick={() => updateFilters({ category: value })}><Icon size={16} aria-hidden="true" />{label}</button>
        ))}</div>
        <div className="sort-control"><ArrowDownWideNarrow size={16} aria-hidden="true" /><label htmlFor="place-sort">Sort by</label>
          <select id="place-sort" value={sort} onChange={(event) => updateFilters({ sort: event.target.value })}><option value="top-rated">Top rated</option><option value="name">Name</option></select>
        </div>
      </div>
      <aside className="ranking-note" aria-label="How rankings work"><Sparkles size={19} aria-hidden="true" />
        <p><strong>Good places earn their place.</strong> Top rated balances stars with review count, so one perfect review doesn’t tell the whole story.</p>
        <details><summary>How we rank</summary><p>We start with five reviews at 3.5 stars, then add the real ratings: (total stars + 17.5) ÷ (reviews + 5). Places with reviews appear first.</p></details>
      </aside>
      <section aria-label="Places" aria-busy={loading}>
        <div className="results-heading"><h2 className="eyebrow">{category || "Around the city"}</h2>{!loading && !error && data && <p aria-live="polite">{data.length} {data.length === 1 ? "place" : "places"} to explore</p>}</div>
        {loading ? <PlaceSkeletons /> : error ? (
          <StatusPanel title="We couldn’t load the places" tone="error" action={<Button variant="secondary" onClick={() => { void reload(); }}>Try again</Button>}><p>{error.message}</p></StatusPanel>
        ) : data?.length === 0 ? (
          <StatusPanel title="No places here yet" tone="empty" action={category ? <Button variant="secondary" onClick={() => updateFilters({ category: "" })}>Explore all places</Button> : undefined}><p>Try another category to find somewhere to explore.</p></StatusPanel>
        ) : <div className="place-grid">{data?.map((place) => <PlaceCard key={place.id} place={place} />)}</div>}
      </section>
    </div>
  );
}
