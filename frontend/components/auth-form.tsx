"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/auth-provider";
import type { LoginPayload, RegisterPayload } from "@/lib/api";

type AuthMode = "login" | "register";

type AuthFormProps = {
  mode: AuthMode;
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const { login, register } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      if (mode === "register") {
        const payload: RegisterPayload = {
          username: String(formData.get("username") || ""),
          email: String(formData.get("email") || ""),
          password: String(formData.get("password") || ""),
          is_creator: formData.get("is_creator") === "on",
        };
        await register(payload);
        setMessage("Account created. You are now signed in.");
      } else {
        const payload: LoginPayload = {
          username: String(formData.get("username") || ""),
          password: String(formData.get("password") || ""),
        };
        await login(payload);
        setMessage("Signed in successfully.");
      }

      router.push("/");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-card stack">
      <div className="stack">
        <span className="eyebrow">
          {mode === "register" ? "Create account" : "Welcome back"}
        </span>
        <div className="stack">
          <h1 className="section-title">
            {mode === "register" ? "Start streaming." : "Sign in to Live MVP."}
          </h1>
          <p className="section-copy">
            {mode === "register"
              ? "Register a creator or viewer account against the Django API."
              : "Authenticate with the token-based backend and restore your session locally."}
          </p>
        </div>
      </div>

      <form
        className="stack"
        action={async (formData) => {
          await handleSubmit(formData);
        }}
      >
        <div className="field">
          <label htmlFor="username">Username</label>
          <input id="username" name="username" required />
        </div>

        {mode === "register" ? (
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required />
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required />
        </div>

        {mode === "register" ? (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.7rem",
              color: "var(--muted)",
            }}
          >
            <input type="checkbox" name="is_creator" defaultChecked />
            Create as creator
          </label>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="form-success">{message}</p> : null}

        <button className="button" disabled={isSubmitting} type="submit">
          {isSubmitting
            ? "Working..."
            : mode === "register"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <p className="muted">
        {mode === "register" ? "Already have an account?" : "Need an account?"}{" "}
        <Link href={mode === "register" ? "/login" : "/register"}>
          {mode === "register" ? "Sign in" : "Register"}
        </Link>
      </p>
    </section>
  );
}
