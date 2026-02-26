import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Checkbox, Divider, Input, useToast } from "@mbe/rialto";
import { AuthLayout } from "./AuthLayout";
import styles from "./AuthLayout.module.css";

export function SignIn() {
  const { toast } = useToast();
  const [rememberMe, setRememberMe] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
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
        <Input label="Email address" type="email" required autoComplete="email" />
        <Input label="Password" type="password" required autoComplete="current-password" />

        <div className={styles.forgotRow}>
          <Checkbox label="Remember me" checked={rememberMe} onCheckedChange={setRememberMe} />
          <Link to="#" className={styles.forgotLink}>
            Forgot password?
          </Link>
        </div>

        <Button variant="primary" type="submit" className={styles.submitButton}>
          Sign in
        </Button>

        <Divider label="or" spacing="compact" />

        <div className={styles.socialRow}>
          <Button variant="secondary" type="button" className={styles.socialButton}>
            Google
          </Button>
          <Button variant="secondary" type="button" className={styles.socialButton}>
            GitHub
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
