import {connection} from "next/server";
import type { Metadata } from "next";
import "./globals.css";
import "./professional.css";

export const metadata: Metadata = {
  title: "Revenia — Recupera cada oportunidad",
  description: "CRM seguro para recuperar presupuestos y automatizar seguimientos.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
