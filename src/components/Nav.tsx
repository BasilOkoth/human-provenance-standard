import Link from "next/link";
export default function Nav(){
  return <nav className="nav shell pageNav">
    <Link href="/" className="brand"><span className="brandMark">H</span><span>HPS</span></Link>
    <div className="navLinks">
      <Link href="/create">Create</Link><Link href="/verify">Verify</Link>
      <Link href="/records">Records</Link><Link href="/docs">Standard</Link>
    </div>
    <Link className="navCta" href="/create">Create record</Link>
  </nav>
}