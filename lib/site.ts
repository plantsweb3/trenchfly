/** Set this to the chosen RobinFly domain before production deployment. */
const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://robinfly.net";

function configuredOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an HTTPS origin, for example https://your-chosen-domain.com");
  }
  return url.origin;
}

export const SITE_URL = configuredOrigin(configured);
export const SITE_NAME = "RobinFly";

export const SOCIAL_HANDLE = "@RobinFlyPons";
export const SOCIAL_URL = "https://x.com/RobinFlyPons";
