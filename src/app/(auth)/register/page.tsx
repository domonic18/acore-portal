import { getConfig } from "@/lib/config";
import RegisterForm from "./register-form";

/** RSC 下发 Turnstile 开关与 siteKey(M4 US2,T012);关态表单零 widget */
export default async function RegisterPage() {
  const { turnstile } = await getConfig();
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <RegisterForm
        turnstileEnabled={turnstile?.enabled ?? false}
        turnstileSiteKey={turnstile?.siteKey ?? ""}
      />
    </main>
  );
}
