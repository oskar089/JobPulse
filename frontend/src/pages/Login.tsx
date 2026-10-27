import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

type LoginField = "email" | "password";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [invalidFields, setInvalidFields] = useState<LoginField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const errorId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const fieldRefs = {
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    document.title = "Sign In | Search Jobs";
  }, []);

  const showError = (message: string, fields: LoginField[] = []) => {
    flushSync(() => {
      setError(message);
      setInvalidFields(fields);
    });
    const target = fields.length > 0 ? fieldRefs[fields[0]].current : errorRef.current;
    target?.focus();
  };

  const fieldA11yProps = (field: LoginField) =>
    invalidFields.includes(field)
      ? { "aria-invalid": true, "aria-describedby": errorId }
      : {};

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setInvalidFields([]);

    const missingFields: LoginField[] = [];
    if (!email) missingFields.push("email");
    if (!password) missingFields.push("password");
    if (missingFields.length > 0) {
      showError("Email and password are required", missingFields);
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">Sign In</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            ref={fieldRefs.email}
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            aria-required="true"
            {...fieldA11yProps("email")}
          />

          <Input
            ref={fieldRefs.password}
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            aria-required="true"
            {...fieldA11yProps("password")}
          />

          {error && (
            <p
              id={errorId}
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="text-sm text-red-400 bg-red-900/30 rounded-lg px-3 py-2"
            >
              {error}
            </p>
          )}

          <Button type="submit" isLoading={isLoading} className="w-full">
            Sign In
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-400">
          Don&apos;t have an account?{" "}
          <Link
            to="/register"
            className="rounded text-blue-400 underline underline-offset-2 hover:text-blue-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            Create one
          </Link>
        </p>
      </Card>
    </main>
  );
}
