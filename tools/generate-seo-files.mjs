import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const siteUrl =
  process.env.PUBLIC_SITE_URL ||
  process.env.CF_PAGES_URL ||
  "https://engrove-toolbox.pages.dev";

const baseUrl = siteUrl.replace(/\/$/, "");

const routes = [
  "/",
  "/tonearm-calculator",
  "/compliance",
  "/geometry-lab",
  "/vta-sra-lab",
  "/measurement-lab",
];

if (process.env.ENABLE_TONEARM_DESIGNER_PLUGIN === "true") {
  routes.push("/tonearm-designer");
}

const today = new Date().toISOString().slice(0, 10);

const publicDir = resolve(process.cwd(), "public");
mkdirSync(publicDir, { recursive: true });

const robots = `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) => `  <url>
    <loc>${baseUrl}${route}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${route === "/" ? "1.0" : "0.8"}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;

writeFileSync(resolve(publicDir, "robots.txt"), robots, "utf8");
writeFileSync(resolve(publicDir, "sitemap.xml"), sitemap, "utf8");

console.log(`Generated public/robots.txt and public/sitemap.xml for ${baseUrl}`);