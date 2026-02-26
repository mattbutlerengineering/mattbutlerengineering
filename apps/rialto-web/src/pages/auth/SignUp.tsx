import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Checkbox, Input, useToast } from "@mbe/rialto";
import { AuthLayout } from "./AuthLayout";
import styles from "./AuthLayout.module.css";

export function SignUp() {
  const { toast } = useToast();
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agreedToTerms) return;
    toast({ title: "Account created successfully", variant: "success" });
  }

  return (
    <AuthLayout
      title="Create your account"
      footer={
        <Link to="/login" className={styles.footerLinkAccent}>
          Already have an account? Sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <Input label="Full name" type="text" required autoComplete="name" />
        <Input label="Email address" type="email" required autoComplete="email" />
        <Input label="Password" type="password" required autoComplete="new-password" />
        <Input label="Confirm password" type="password" required autoComplete="new-password" />

        <Checkbox
          label="I agree to the Terms of Service"
          checked={agreedToTerms}
          onCheckedChange={setAgreedToTerms}
        />

        <Button
          variant="primary"
          type="submit"
          className={styles.submitButton}
          disabled={!agreedToTerms}
        >
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
