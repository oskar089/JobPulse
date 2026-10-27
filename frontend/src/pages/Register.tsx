import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72;
const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, including an uppercase letter and a number (maximum ${PASSWORD_MAX_BYTES} bytes).`;

type RegisterField = "email" | "password" | "confirmPassword";

function getPasswordError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return `Password must be at most ${PASSWORD_MAX_BYTES} bytes`;
  }
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/\d/.test(password)) return "Password must contain at least one number";
  return null;
}

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [invalidFields, setInvalidFields] = useState<RegisterField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const errorId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const fieldRefs = {
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirmPassword: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    document.title = "Create Account | Search Jobs";
  }, []);

  const showError = (message: string, fields: RegisterField[] = []) => {
    flushSync(() => {
      setError(message);
      setInvalidFields(fields);
    });
    const target = fields.length > 0 ? fieldRefs[fields[0]].current : errorRef.current;
    target?.focus();
  };

  const fieldA11yProps = (field: RegisterField) =>
    invalidFields.includes(field)
      ? { "aria-invalid": true, "aria-describedby": errorId }
      : {};

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setInvalidFields([]);

    const missingFields: RegisterField[] = [];
    if (!email) missingFields.push("email");
    if (!password) missingFields.push("password");
    if (missingFields.length > 0) {
      showError("Email and password are required", missingFields);
      return;
    }
    const passwordError = getPasswordError(password);
    if (passwordError) {
      showError(passwordError, ["password"]);
      return;
    }
    if (password !== confirmPassword) {
      showError("Passwords do not match", ["confirmPassword"]);
      return;
    }

    setIsLoading(true);
    try {
      await register(name || email.split("@")[0], email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">Create Account</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            autoComplete="name"
          />

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
            placeholder="At least 8 characters"
            autoComplete="new-password"
            aria-required="true"
            hint={PASSWORD_HINT}
            {...fieldA11yProps("password")}
          />

          <Input
            ref={fieldRefs.confirmPassword}
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat your password"
            autoComplete="new-password"
            aria-required="true"
            {...fieldA11yProps("confirmPassword")}
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
            Create Account
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link
            to="/login"
            className="rounded text-blue-400 underline underline-offset-2 hover:text-blue-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            Sign in
          </Link>
        </p>
      </Card>
    </main>
  );
}
