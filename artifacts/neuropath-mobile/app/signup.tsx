import { Redirect } from "expo-router";

// Default free signup is the parent email/password flow. The previous wizard lives at /legacy-signup.
export default function SignupRedirect() {
  return <Redirect href={"/parent-welcome" as never} />;
}
