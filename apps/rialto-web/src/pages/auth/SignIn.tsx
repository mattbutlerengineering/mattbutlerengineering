import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { Button, Checkbox, Divider, Input, useToast } from "@mbe/rialto";
import { AuthLayout } from "./AuthLayout";
import styles from "./AuthLayout.module.css";

export function SignIn() {
  const { toast } = useToast();
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    // Simulate network request
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setIsLoading(false);
    toast({ title: "Signed in successfully", variant: "success" });
  }

  return (
    <AuthLayout
      title="Sign in to your account"
      footer={
        <Link to="/signup" className={styles.footerLinkAccent}>
          Don&rsquo;t have an account? Sign up
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <Input
          label="Email address"
          type="email"
          required
          autoComplete="email"
          disabled={isLoading}
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
