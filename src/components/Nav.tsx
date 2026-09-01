import Link from "next/link";

export default function Nav() {
  return (
    <nav className="nav shell">
      <Link href="/" className="brand">
        <span className="brandMark">H</span><span>HPS</span>
      </Link>

      <div className="navLinks">
        <Link href="/create">Create</Link>
        <Link href="/verify">Verify</Link>
        <Link href="/records">Registry</Link><Link href="/institutional">Institutional</Link>
        <Link href="/docs">Standard</Link>
        <Link href="/developers">Developers</Link>
      </div>

      <div className="navActions">
        <Link className="navText" href="/account">Account</Link>
        <Link className="navCta" href="/create">Create record</Link>
      </div>
    </nav>
  );
}
