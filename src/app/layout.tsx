import "./styles.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title:"Human Provenance Standard — HPS",
  description:"Proof of human contribution in an AI-assisted world."
};
export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}</body></html>
}