import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import { themes } from "prism-react-renderer";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

/**
 * The docs site.
 *
 * Two things here are not boilerplate and are the reason the docs cannot
 * quietly go stale:
 *
 * 1. `moderato` resolves to `../dist` — the REAL built package, the same
 *    files npm ships. Every live example on this site (the playground, the
 *    threshold explorer) runs the actual library, so a page that claims an
 *    API exists fails the build if it doesn't.
 * 2. the version banner is read from the library's own package.json, so it
 *    cannot disagree with what is published.
 */

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "..", "package.json"), "utf8"),
) as { version: string; description: string };

const config: Config = {
  title: "moderato",
  tagline: "Content moderation, in tempo.",
  favicon: "img/favicon.svg",

  // Cloud Run serves at the root of its own hostname, the same way loupe-web
  // does. DOCS_URL / DOCS_BASE_URL let a different host (a custom domain, a
  // preview revision, GitHub Pages at /moderato/) override without a code
  // change.
  url: process.env.DOCS_URL ?? "https://moderato-docs.run.app",
  baseUrl: process.env.DOCS_BASE_URL ?? "/",
  organizationName: "wiggapony0925",
  projectName: "moderato",
  trailingSlash: false,

  onBrokenLinks: "throw",
  markdown: { hooks: { onBrokenMarkdownLinks: "throw" } },

  customFields: { libraryVersion: pkg.version },

  // `future.v4` is deliberately off: it pulls in @docusaurus/faster (rspack +
  // swc), which is a large dependency to carry for a fourteen-page site.
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/wiggapony0925/moderato/tree/main/docs/",
          // Every published version keeps its own docs. A reader on 1.x must
          // never be shown 2.x's API — that is the single most common way
          // library documentation lies to people.
          lastVersion: "current",
          versions: {
            current: { label: pkg.version, path: "" },
          },
        },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/logo.svg",
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: "moderato",
      logo: { alt: "", src: "img/logo.svg" },
      items: [
        { to: "/quickstart", label: "Quickstart", position: "left" },
        { to: "/field-hook", label: "Guides", position: "left" },
        { to: "/api", label: "API", position: "left" },
        { to: "/playground", label: "Playground", position: "left" },
        { to: "/rehearsal", label: "Metrics", position: "left" },
        { type: "docsVersionDropdown", position: "right" },
        {
          href: "https://github.com/wiggapony0925/moderato",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Quickstart", to: "/quickstart" },
            { label: "Client or server?", to: "/client-or-server" },
            { label: "API reference", to: "/api" },
          ],
        },
        {
          title: "Evidence",
          items: [
            { label: "Playground", to: "/playground" },
            { label: "Rehearsal metrics", to: "/rehearsal" },
            { label: "What it does not do", to: "/limits" },
          ],
        },
        {
          title: "More",
          items: [
            { label: "GitHub", href: "https://github.com/wiggapony0925/moderato" },
            { label: "npm", href: "https://www.npmjs.com/package/moderato" },
            {
              label: "Changelog",
              href: "https://github.com/wiggapony0925/moderato/blob/main/CHANGELOG.md",
            },
          ],
        },
      ],
      copyright: `moderato ${pkg.version} · MIT`,
    },
    prism: {
      theme: themes.github,
      darkTheme: themes.dracula,
      additionalLanguages: ["bash", "json", "diff"],
    },
  } satisfies Preset.ThemeConfig,

  plugins: [
    function moderatoResolver() {
      return {
        name: "moderato-resolver",
        configureWebpack() {
          return {
            resolve: {
              alias: {
                // The built package, not the source. The examples on this
                // site therefore exercise exactly what a consumer installs.
                moderato$: resolve(__dirname, "..", "dist", "index.js"),
                "moderato/react$": resolve(__dirname, "..", "dist", "react", "index.js"),
                "moderato/web$": resolve(__dirname, "..", "dist", "web", "index.js"),
              },
            },
          };
        },
      };
    },
  ],
};

export default config;
