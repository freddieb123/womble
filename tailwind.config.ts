import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        display: ["Fraunces", "Iowan Old Style", "Georgia", "serif"],
        sans: ["IBM Plex Sans", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
      colors: {
        forest: {
          50: "hsl(var(--forest-50))", 100: "hsl(var(--forest-100))",
          200: "hsl(var(--forest-200))", 300: "hsl(var(--forest-300))",
          400: "hsl(var(--forest-400))", 500: "hsl(var(--forest-500))",
          600: "hsl(var(--forest-600))", 700: "hsl(var(--forest-700))",
          800: "hsl(var(--forest-800))", 900: "hsl(var(--forest-900))",
        },
        honey: {
          50: "hsl(var(--honey-50))", 100: "hsl(var(--honey-100))",
          200: "hsl(var(--honey-200))", 300: "hsl(var(--honey-300))",
          400: "hsl(var(--honey-400))", 500: "hsl(var(--honey-500))",
          600: "hsl(var(--honey-600))", 700: "hsl(var(--honey-700))",
          800: "hsl(var(--honey-800))", 900: "hsl(var(--honey-900))",
        },
        warm: {
          50: "hsl(var(--warm-50))", 100: "hsl(var(--warm-100))",
          200: "hsl(var(--warm-200))", 300: "hsl(var(--warm-300))",
          400: "hsl(var(--warm-400))", 500: "hsl(var(--warm-500))",
          600: "hsl(var(--warm-600))", 700: "hsl(var(--warm-700))",
          800: "hsl(var(--warm-800))", 900: "hsl(var(--warm-900))",
        },
        mark: {
          DEFAULT: "hsl(var(--mark))",
          foreground: "hsl(var(--mark-ink))",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
