import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = { title: "Sign in - PROVN" };

export default function SignInPage() {
  return (
    <div className="mx-auto w-full max-w-sm px-4 py-16 sm:py-24">
      <h1 className="text-3xl font-extrabold tracking-tight">Sign in to PROVN</h1>
      <p className="mt-2 text-slate">
        Enter your email to receive a secure sign-in link. No password needed. New here? The same
        link creates your account.
      </p>
      <Suspense fallback={<div className="mt-8 h-64" />}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
