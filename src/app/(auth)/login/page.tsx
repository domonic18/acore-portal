import { Suspense } from "react";
import { getConfig } from "@/lib/config";
import { ContentPanel } from "@/components/site/content-panel";
import LoginForm from "./login-form";

/** RSC 下发 Turnstile 开关与 siteKey(M4 US2,T012);关态表单零 widget
 * 表单套内容区面板(ardot p09):页面背景图为全站装饰层,表单须有自身底色。 */
export default async function LoginPage() {
  const { turnstile } = await getConfig();
  return (
    <main className="flex min-h-screen items-center justify-center p-6 lg:p-8">
      <ContentPanel className="w-full max-w-md p-7 lg:p-8">
        <Suspense fallback={null}>
          <LoginForm
            turnstileEnabled={turnstile?.enabled ?? false}
            turnstileSiteKey={turnstile?.siteKey ?? ""}
          />
        </Suspense>
      </ContentPanel>
    </main>
  );
}
