import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { Check, Eye, EyeOff, Fingerprint } from "lucide-react";
import {
  Button,
  Checkbox,
  Divider,
  Input,
  PinInput,
  Steps,
  Text,
  useMotionPreset,
  useToast,
} from "@mattbutlerengineering/rialto";
import type { MotionPreset } from "@mattbutlerengineering/rialto";
import { AuthLayout } from "./AuthLayout";
import { DEMO_ROUTES } from "../../data/demo-routes";
import { isAcceptedMfaCode, isValidEmail, MFA_CODE_LENGTH } from "./auth-validation";
import styles from "./AuthLayout.module.css";

const SIGN_IN_STEPS = [{ label: "Credentials" }, { label: "Verification" }];

/** Simulated network round-trip — everything on this page is demo-only. */
const SIMULATED_NETWORK_MS = 900;
/** How long the "Verified" settle is visible before the success toast. */
const VERIFIED_SETTLE_MS = 700;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── Credentials step ─────────────────────────── */

interface CredentialsStepProps {
  email: string;
  setEmail: Dispatch<SetStateAction<string>>;
  emailError: boolean;
  setEmailError: Dispatch<SetStateAction<boolean>>;
  isLoading: boolean;
  onSubmit: (event: FormEvent) => void;
  onPasskey: () => void;
}

function CredentialsStep({
  email,
  setEmail,
  emailError,
  setEmailError,
  isLoading,
  onSubmit,
  onPasskey,
}: CredentialsStepProps) {
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    // noValidate: the page owns validation so its error affordances render,
    // instead of the browser's native bubble pre-empting them.
    <form onSubmit={onSubmit} className={styles.form} noValidate>
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
        autoComplete="current-password"
        disabled={isLoading}
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

      <div className={styles.forgotRow}>
        <Checkbox
          label="Remember me"
          checked={rememberMe}
          onCheckedChange={setRememberMe}
          disabled={isLoading}
        />
        <Link to="#" className={styles.forgotLink}>
          Forgot password?
        </Link>
      </div>

      <Button
        variant="primary"
        type="submit"
        className={styles.submitButton}
        isLoading={isLoading}
        loadingText="Signing in..."
      >
        Sign in
      </Button>

      <Button
        variant="secondary"
        type="button"
        className={styles.passkeyButton}
        onClick={onPasskey}
        disabled={isLoading}
      >
        <Fingerprint size={16} aria-hidden="true" />
        Use a passkey instead
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
  );
}

/* ── Verification step ────────────────────────── */

interface VerificationStepProps {
  code: string;
  codeError: boolean;
  isVerifying: boolean;
  isVerified: boolean;
  motionPreset: MotionPreset;
  onCodeChange: (value: string) => void;
  onVerify: (value: string) => void;
  onBack: () => void;
}

function VerificationStep({
  code,
  codeError,
  isVerifying,
  isVerified,
  motionPreset,
  onCodeChange,
  onVerify,
  onBack,
}: VerificationStepProps) {
  return (
    <div className={styles.verifyPanel}>
      <Text className={styles.verifyIntro}>
        Enter the {MFA_CODE_LENGTH}-digit code from your authenticator
      </Text>
      <PinInput
        label="Authenticator code"
        length={MFA_CODE_LENGTH}
        type="numeric"
        value={code}
        onChange={onCodeChange}
        onComplete={onVerify}
        error={codeError}
        hint={
          codeError
            ? "That code didn’t match — try again"
            : "Demo: every code verifies, except 000000"
        }
        disabled={isVerifying || isVerified}
      />
      {isVerified ? (
        <motion.div
          className={styles.verifiedRow}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={motionPreset.spring}
        >
          <Check size={16} aria-hidden="true" />
          Verified
        </motion.div>
      ) : (
        <Button
          variant="primary"
          type="button"
          className={styles.submitButton}
          isLoading={isVerifying}
          loadingText="Verifying..."
          disabled={code.length < MFA_CODE_LENGTH}
          onClick={() => onVerify(code)}
        >
          Verify code
        </Button>
      )}
      <Button
        variant="ghost"
        type="button"
        className={styles.backButton}
        onClick={onBack}
        disabled={isVerifying}
      >
        Use a different account
      </Button>
    </div>
  );
}

/* ── Page ─────────────────────────────────────── */

export function SignIn() {
  const { toast } = useToast();
  const motionPreset = useMotionPreset();
  const [step, setStep] = useState<"credentials" | "verification">("credentials");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  async function handleCredentialsSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setEmailError(true);
      return;
    }

    setIsLoading(true);
    await delay(SIMULATED_NETWORK_MS);
    setIsLoading(false);
    setStep("verification");
  }

  async function handleVerify(candidate: string) {
    setIsVerifying(true);
    await delay(SIMULATED_NETWORK_MS);
    setIsVerifying(false);

    if (!isAcceptedMfaCode(candidate)) {
      setCodeError(true);
      return;
    }

    setIsVerified(true);
    await delay(VERIFIED_SETTLE_MS);
    toast({ title: "Signed in successfully", variant: "success" });
  }

  function handleCodeChange(value: string) {
    setCode(value);
    if (codeError) setCodeError(false);
  }

  function handlePasskey() {
    toast({ title: "Signed in with your passkey", variant: "success" });
  }

  function handleBack() {
    setStep("credentials");
    setCode("");
    setCodeError(false);
    setIsVerified(false);
  }

  return (
    <AuthLayout
      title="Sign in to your account"
      footer={
        <>
          <Link to={DEMO_ROUTES.signUp} className={styles.footerLinkAccent}>
            Don&rsquo;t have an account? Sign up
          </Link>
          <Link to={DEMO_ROUTES.sessionExpired} className={styles.footerLink}>
            Session expired? See how we handle it
          </Link>
        </>
      }
    >
      <Steps
        steps={SIGN_IN_STEPS}
        currentStep={step === "credentials" ? 0 : 1}
        compact
        className={styles.stepsIndicator}
      />
      {step === "credentials" ? (
        <motion.div
          key="credentials"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={motionPreset.springGentle}
        >
          <CredentialsStep
            email={email}
            setEmail={setEmail}
            emailError={emailError}
            setEmailError={setEmailError}
            isLoading={isLoading}
            onSubmit={handleCredentialsSubmit}
            onPasskey={handlePasskey}
          />
        </motion.div>
      ) : (
        <motion.div
          key="verification"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={motionPreset.springGentle}
        >
          <VerificationStep
            code={code}
            codeError={codeError}
            isVerifying={isVerifying}
            isVerified={isVerified}
            motionPreset={motionPreset}
            onCodeChange={handleCodeChange}
            onVerify={handleVerify}
            onBack={handleBack}
          />
        </motion.div>
      )}
    </AuthLayout>
  );
}
