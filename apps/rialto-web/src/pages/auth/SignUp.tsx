import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { Button, Checkbox, Divider, Input, useToast, AuthMascot, Text } from "@mattbutlerengineering/rialto";
import type { MascotState } from "@mattbutlerengineering/rialto";
import { AuthLayout } from "./AuthLayout";
import styles from "./AuthLayout.module.css";

export function SignUp() {
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mascotState, setMascotState] = useState<MascotState>("neutral");
  const [emailValue, setEmailValue] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    // Simulate network request
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setIsLoading(false);
    setMascotState("success");
    toast({ title: "Account created successfully", variant: "success" });

    // Reset to neutral after celebration
    setTimeout(() => setMascotState("neutral"), 1500);
  }

  return (
    <AuthLayout
      title="Create your account"
      footer={
        <Link to="/signin" className={styles.footerLinkAccent}>
          Already have an account? Sign in
        </Link>
      }
    >
      <AuthMascot
        state={mascotState}
        progress={Math.min(emailValue.length / 20, 1)}
      />

      <form onSubmit={handleSubmit} className={styles.form}>
        <Input
          label="Full name"
          type="text"
          required
          autoComplete="name"
          disabled={isLoading}
          onFocus={() => setMascotState("active")}
          onBlur={() => setMascotState("neutral")}
        />
        <Input
          label="Email address"
          type="email"
          required
          autoComplete="email"
          disabled={isLoading}
          value={emailValue}
          onChange={(e) => {
            setEmailValue(e.target.value);
            setMascotState("active");
          }}
          onFocus={() => setMascotState("active")}
          onBlur={() => setMascotState("neutral")}
        />
        <Input
          label="Password"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="new-password"
          disabled={isLoading}
          onFocus={() => setMascotState("shy")}
          onBlur={() => setMascotState("neutral")}
          endIcon={
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={styles.passwordToggle}
              onClick={() => {
                setShowPassword(!showPassword);
                setMascotState(!showPassword ? "peek" : "shy");
              }}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </Button>
          }
        />

        <div className={styles.termsRow}>
          <Checkbox
            label={
              <Text className={styles.termsText}>
                I agree to the <Link to="#">Terms of Service</Link> and <Link to="#">Privacy Policy</Link>
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
