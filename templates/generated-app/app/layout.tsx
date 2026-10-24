import "./style.css";
import product from "../product.json";
export const metadata = { title: product.spec.name, description: product.spec.summary };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
