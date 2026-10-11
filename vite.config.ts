import { defineConfig } from "vite-plus";

const ignorePatterns = [
  "**/route-tree.gen.ts",
  "**/node_modules",
  "**/dist",
  "**/*.md",
  ".agents/**",
  ".codex/**",
  ".github/**",
  ".output/**",
  ".stitch/**",
  ".wt/**",
  ".vite-hooks/**",
  "docs/**",
  "pnpm-lock.yaml",
];

export default defineConfig({
  run: {
    enablePrePostScripts: true,
    cache: {
      tasks: true,
    },
  },

  fmt: {
    ignorePatterns,

    printWidth: 100,
    sortImports: true,
    sortPackageJson: true,

    overrides: [
      {
        files: ["apps/console/**"],
        options: {
          sortTailwindcss: true,
          sortImports: {
            customGroups: [
              {
                groupName: "tocsin",
                elementNamePattern: ["@tocsin/**"],
              },
            ],
            groups: [
              "builtin",
              "external",
              "tocsin",
              ["internal", "subpath"],
              ["parent", "sibling", "index"],
              "style",
              "unknown",
            ],
            internalPattern: ["~~/", "~/", "#/", "@/"],
          },
        },
      },
    ],
  },

  lint: {
    ignorePatterns,

    options: {
      typeAware: true,
      typeCheck: true,
    },

    plugins: ["typescript", "unicorn", "oxc"],

    categories: {},

    env: {
      builtin: true,
    },

    settings: {
      react: {
        version: "19.3.0",
      },
      vitest: {
        typecheck: false,
      },
    },

    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
    },

    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],

    overrides: [
      {
        files: ["apps/console/**"],
        plugins: ["react", "react-perf", "vitest", "node"],
        jsPlugins: [
          {
            name: "tanstack-router",
            specifier: "@tanstack/eslint-plugin-router",
          },
        ],
        rules: {
          "tanstack-router/create-route-property-order": "error",
          "typescript/only-throw-error": [
            "error",
            {
              allow: [
                {
                  from: "package",
                  package: "@tanstack/router-core",
                  name: "Redirect",
                },
                {
                  from: "package",
                  package: "@tanstack/router-core",
                  name: "NotFoundError",
                },
              ],
            },
          ],
        },
      },
    ],
  },

  check: {
    fmt: true,
    lint: true,
  },

  staged: {
    "*.{js,jsx,ts,tsx,mjs,cjs}": ["vp check --fix"],
    "*.{json,css,yaml,yml}": ["vp fmt --write"],
  },
});
