import Link from "next/link";

export default function Footer() {
  return (
    <footer className="hpsFooter">
      <div className="hpsFooterInner">
        <div className="hpsFooterBrand">
          <span className="hpsFooterMark">H</span>
          <div>
            <strong>Human Provenance Standard</strong>
            <span>Verifiable human and AI provenance.</span>
          </div>
        </div>

        <nav className="hpsFooterLinks" aria-label="Footer navigation">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
        </nav>

        <div className="hpsFooterCopy">
          © 2026 Human Provenance Standard
        </div>
      </div>

      <style>{`
        .hpsFooter{
          border-top:1px solid #25272c;
          background:#0a0b0d;
          color:#f0eee8;
        }

        .hpsFooterInner{
          max-width:1240px;
          margin:0 auto;
          padding:26px 24px;
          display:grid;
          grid-template-columns:1fr auto auto;
          align-items:center;
          gap:28px;
        }

        .hpsFooterBrand{
          display:flex;
          align-items:center;
          gap:10px;
          min-width:0;
        }

        .hpsFooterMark{
          width:30px;
          height:30px;
          display:grid;
          place-items:center;
          border-radius:9px;
          background:#b42323;
          color:#fff;
          font-weight:900;
          flex:0 0 auto;
        }

        .hpsFooterBrand strong{
          display:block;
          font-size:12px;
          font-weight:750;
        }

        .hpsFooterBrand div > span{
          display:block;
          margin-top:2px;
          color:#6f7278;
          font-size:10px;
        }

        .hpsFooterLinks{
          display:flex;
          gap:18px;
          align-items:center;
        }

        .hpsFooterLinks a{
          color:#9a9da2;
          text-decoration:none;
          font-size:11px;
          font-weight:650;
          transition:color .15s ease;
        }

        .hpsFooterLinks a:hover{
          color:#f1eee7;
        }

        .hpsFooterCopy{
          color:#666970;
          font-size:10px;
          white-space:nowrap;
        }

        @media(max-width:780px){
          .hpsFooterInner{
            grid-template-columns:1fr;
            align-items:flex-start;
            gap:16px;
          }

          .hpsFooterLinks{
            flex-wrap:wrap;
          }
        }
      `}</style>
    </footer>
  );
}
