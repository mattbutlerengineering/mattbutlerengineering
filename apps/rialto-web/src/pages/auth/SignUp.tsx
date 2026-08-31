import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Check, Eye, EyeOff, Minus } from "lucide-react";
import {
  Button,
  Checkbox,
  Divider,
  Handshake,
  Input,
  Meter,
  Text,
  useToast,
} from "@mattbutlerengineering/rialto";
import type { HandshakeState } from "@mattbutlerengineering/rialto";
import { AuthLayout } from "./AuthLayout";
import { DEMO_ROUTES } from "../../data/demo-routes";
import { isValidEmail } from "./auth-validation";
import {
  scorePassword,
  meterVariantForScore,
  MIN_PASSWORD_LENGTH,
  STRENGTH_LABELS,
  type PasswordRequirements,
} from "./score-password";
import styles from "./AuthLayout.module.css";

/** Simulated network round-trip — everything on this page is demo-only. */
const SIMULATED_NETWORK_MS = 1500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Stations the sign-up credential travels between — Browser and Identity. */
const HANDSHAKE_STATIONS = ["Browser", "Identity"] as const;

type SignUpPhase = "idle" | "submitting" | "created";

const SIGN_UP_PHASES: Record<
  SignUpPhase,
  { state: HandshakeState; status: string; ariaLabel: string }
> = {
  idle: { state: "idle", status: "", ariaLabel: "Sign-up exchange at rest" },
  submitting: {
    state: "negotiating",
    status: "Creating your account",
    ariaLabel: "Creating your account with Identity",
  },
  created: {
    state: "settled",
    status: "Account created",
    ariaLabel: "Account created",
  },
};

const REQUIREMENT_LINES: { key: keyof PasswordRequirements; text: string }[] = [
  { key: "minLength", text: `At least ${MIN_PASSWORD_LENGTH} characters` },
  { key: "mixedCase", text: "Upper and lower case letters" },
  { key: "numberOrSymbol", text: "A number or symbol" },
];

/* ── Password strength feedback ───────────────── */

function PasswordStrength({ password }: { password: string }) {
  const { score, satisfied } = scorePassword(password);

  return (
    <div className={styles.strengthBlock}>
      <div className={styles.strengthHeader}>
        <Meter
          label="Password strength"
          value={score}
          max={4}
          size="sm"
          variant={meterVariantForScore(score)}
        />
        <Text className={styles.strengthLabel}>{STRENGTH_LABELS[score]}</Text>
      </div>
      <ul className={styles.checklist}>
        {REQUIREMENT_LINES.map(({ key, text }) => (
          <li
            key={key}
            data-satisfied={satisfied[key]}
            className={satisfied[key] ? styles.checklistItemMet : styles.checklistItem}
          >
            {satisfied[key] ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Minus size={14} aria-hidden="true" />
            )}
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Page ─────────────────────────────────────── */

export function SignUp() {
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [phase, setPhase] = useState<SignUpPhase>("idle");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);

  const isLoading = phase === "submitting";
  const confirmMismatch = confirmTouched && confirm !== password;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setEmailError(true);
      return;
    }
    if (confirm !== password) {
      setConfirmTouched(true);
      return;
    }

    setPhase("submitting");
    await delay(SIMULATED_NETWORK_MS);
    setPhase("created");
    toast({ title: "Account created successfully", variant: "success" });
  }

  return (
    <AuthLayout
      title="Create your account"
      footer={
        <Link to={DEMO_ROUTES.signIn} className={styles.footerLinkAccent}>
          Already have an account? Sign in
        </Link>
      }
    >
      <div className={styles.instrumentSlot}>
        <Handshake
          size="md"
          stations={HANDSHAKE_STATIONS}
          lane={0}
          state={SIGN_UP_PHASES[phase].state}
          aria-label={SIGN_UP_PHASES[phase].ariaLabel}
        />
      </div>
      <div role="status" aria-live="polite" className={styles.statusLine}>
        <Text variant="caption" color="tertiary">
          {SIGN_UP_PHASES[phase].status}
        </Text>
      </div>
      {/* noValidate: the page owns validation so its error affordances render,
          instead of the browser's native bubble pre-empting them. */}
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <Input label="Full name" type="text" required autoComplete="name" disabled={isLoading} />
        <Input
          label="Email address"
          type="email"
          required
          autoComplete="email"
          disabled={isLoading}
          value={email}
          error={emailError}
          hint={emailError ? "Enter a valid email address" : undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError(false);
          }}
          onBlur={() => setEmailError(email !== "" && !isValidEmail(email))}
        />
        <Input
          label="Password"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="new-password"
          disabled={isLoading}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          endIcon={
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </Button>
          }
        />
        {password !== "" && <PasswordStrength password={password} />}
        <Input
          label="Confirm password"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="new-password"
          disabled={isLoading}
          value={confirm}
          error={confirmMismatch}
          hint={confirmMismatch ? "Passwords don’t match" : undefined}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => setConfirmTouched(confirm !== "")}
        />

        <div className={styles.termsRow}>
          <Checkbox
            label={
              <Text className={styles.termsText}>
                I agree to the <Link to="#">Terms of Service</Link> and{" "}
                <Link to="#">Privacy Policy</Link>
              </Text>
            }
            disabled={isLoading}
          />
        </div>

        <Button
          variant="primary"
          type="submit"
          className={styles.submitButton}
          isLoading={isLoading}
          loadingText="Creating account..."
        >
          Create account
        </Button>

        <Divider label="or" spacing="compact" />

        <div className={styles.socialRow}>
          <Button
            variant="secondary"
            type="button"
            className={styles.socialButton}
            disabled={isLoading}
          >
            Google
          </Button>
          <Button
            variant="secondary"
            type="button"
            className={styles.socialButton}
            disabled={isLoading}
          >
            GitHub
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
