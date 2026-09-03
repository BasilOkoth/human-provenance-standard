"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    function closeOnResize() {
      if (window.innerWidth > 900) setOpen(false);
    }
    window.addEventListener("resize", closeOnResize);

    fetch("/api/notifications")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setUnread(Number(data.unread || 0)); })
      .catch(() => {});

    return () => window.removeEventListener("resize", closeOnResize);
  }, []);

  function closeMenu() { setOpen(false); }

  return (
    <nav className="nav shell">
      <Link href="/" className="brand" onClick={closeMenu}>
        <span className="brandMark">H</span>
        <span>HPS</span>
      </Link>

      <div className="navLinks">
        <Link href="/create">Create</Link>
        <Link href="/verify">Verify</Link>
        <Link href="/records">Registry</Link>
        <Link href="/institutional">Institutional</Link>
        <Link href="/docs">Standard</Link>
        <Link href="/developers">Developers</Link>
      </div>

      <div className="navActions">
        <Link className="navText" href="/notifications">
          Alerts{unread > 0 ? ` (${unread})` : ""}
        </Link>
        <Link className="navText" href="/account">Account</Link>
        <Link className="navCta" href="/create">Create record</Link>

        <button
          className={`mobileMenuButton ${open ? "mobileMenuButtonOpen" : ""}`}
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <span /><span /><span />
        </button>
      </div>

      <div id="mobile-navigation" className={`mobileMenu ${open ? "mobileMenuOpen" : ""}`}>
        <div className="mobileMenuInner">
          <Link href="/create" onClick={closeMenu}>Create</Link>
          <Link href="/verify" onClick={closeMenu}>Verify</Link>
          <Link href="/records" onClick={closeMenu}>Registry</Link>
          <Link href="/institutional" onClick={closeMenu}>Institutional</Link>
          <Link href="/docs" onClick={closeMenu}>Standard</Link>
          <Link href="/developers" onClick={closeMenu}>Developers</Link>
          <Link href="/notifications" onClick={closeMenu}>Alerts{unread > 0 ? ` (${unread})` : ""}</Link>
          <Link href="/account" onClick={closeMenu}>Account</Link>
          <Link className="mobileMenuCta" href="/create" onClick={closeMenu}>Create record</Link>
        </div>
      </div>
    </nav>
  );
}
