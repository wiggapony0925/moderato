import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

/**
 * Ordered by what somebody actually does, not by module layout: decide
 * where screening goes, get it running, wrap a field, then tune it.
 */
const sidebars: SidebarsConfig = {
  docs: [
    "intro",
    "quickstart",
    "client-or-server",
    {
      type: "category",
      label: "Guides",
      collapsed: false,
      items: [
        "field-hook",
        "submit-hook",
        "uploads",
        "server",
        "policy",
        "providers",
        "personal-data",
        "any-backend",
      ],
    },
    "algorithm",
    {
      type: "category",
      label: "Evidence",
      collapsed: false,
      items: ["playground", "rehearsal"],
    },
    "api",
    "limits",
    "deploying",
    "upgrading",
  ],
};

export default sidebars;
