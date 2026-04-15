import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="shell">
      <AuthForm mode="login" />
    </main>
  );
}
