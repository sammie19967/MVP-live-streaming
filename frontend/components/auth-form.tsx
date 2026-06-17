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
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
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
          <div className="password-field">
            <input
              id="password"
              name="password"
              type={isPasswordVisible ? "text" : "password"}
              required
            />
            <button
              aria-label={isPasswordVisible ? "Hide password" : "Show password"}
              className="password-toggle"
              onClick={() => setIsPasswordVisible((visible) => !visible)}
              title={isPasswordVisible ? "Hide password" : "Show password"}
              type="button"
            >
              {isPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
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

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="m3 3 18 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M9.9 5.4A9.7 9.7 0 0 1 12 5c6.2 0 9.5 7 9.5 7a14.2 14.2 0 0 1-3 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M14.1 14.3a3.2 3.2 0 0 1-4.4-4.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M6.6 6.8C3.9 8.6 2.5 12 2.5 12s3.3 7 9.5 7c1.4 0 2.7-.4 3.8-1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
