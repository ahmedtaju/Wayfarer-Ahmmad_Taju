"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Compass } from "lucide-react";
import { useTraveller } from "./traveller-provider";

export function Header() {
  const pathname = usePathname();
  const { users, user, userId, selectUser, loading, error, retry } = useTraveller();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="Wayfarer home">
          <span className="brand-mark"><Compass size={28} strokeWidth={1.5} aria-hidden="true" /></span>
          <span>Wayfarer<span className="brand-dot">.</span></span>
        </Link>
        <nav aria-label="Main navigation" className="main-navigation">
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>Explore places</Link>
        </nav>
        <div className="traveller-control">
          <span className="traveller-avatar" aria-hidden="true">{user?.name[0] ?? "?"}</span>
          <div className="traveller-select-wrap">
            <label htmlFor="traveller-select">Acting as</label>
            <div className="traveller-select-line">
              <select id="traveller-select" value={userId ?? ""} disabled={loading || Boolean(error) || users.length === 0} onChange={(event) => selectUser(Number(event.target.value))} aria-describedby="traveller-help">
                {!user && <option value="">{loading ? "Loading…" : "Unavailable"}</option>}
                {users.map((traveller) => <option key={traveller.id} value={traveller.id}>{traveller.name}</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
            <span id="traveller-help" className="sr-only">Choose a demo traveller for reviews and bookings.</span>
          </div>
          {error && <button className="traveller-retry" type="button" onClick={retry}>Retry travellers</button>}
        </div>
      </div>
    </header>
  );
}
