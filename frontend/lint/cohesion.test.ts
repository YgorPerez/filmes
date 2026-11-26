import { RuleTester } from 'vite-plus/lint/plugins-dev'
import { describe, it } from 'vite-plus/test'
import cohesion from './cohesion.ts'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'tsx' } },
})

tester.run('cohesion/hand-drawn-icons', cohesion.rules['hand-drawn-icons'], {
  valid: [
    "import { Link } from '@tanstack/react-router'",
    "import { Icon } from './kit/icon'",
  ],
  invalid: [
    {
      code: "import { ArrowRight } from 'lucide-react'",
      errors: [{ messageId: 'handDrawn' }],
    },
    {
      code: "import { CheckIcon } from '@heroicons/react/24/solid'",
      errors: [{ messageId: 'handDrawn' }],
    },
  ],
})

tester.run('cohesion/no-shadow', cohesion.rules['no-shadow'], {
  valid: [
    // DESIGN.md's ring: 2px, no blur, in the surface's colour.
    '<span className="rounded-full ring-2 ring-surface" />',
    '<div className="border border-rule bg-surface-2" />',
    // A word, not a class.
    '<p>a sombra do estojo</p>',
    '<p style={{ filter: "grayscale(1)" }} />',
  ],
  invalid: [
    {
      code: '<div className="rounded-card shadow-md" />',
      errors: [{ messageId: 'shadow' }],
    },
    {
      code: 'const c = `bg-surface hover:shadow`',
      errors: [{ messageId: 'shadow' }],
    },
    {
      code: '<div className="bg-linear-to-b from-case to-floor" />',
      errors: [{ messageId: 'shadow' }],
    },
    {
      code: '<div style={{ boxShadow: "0 2px 8px black" }} />',
      errors: [{ messageId: 'shadow' }],
    },
    {
      code: '<div style={{ background: "linear-gradient(red, blue)" }} />',
      errors: [{ messageId: 'shadow' }],
    },
    {
      code: '<img style={{ filter: "drop-shadow(0 1px 2px black)" }} />',
      errors: [{ messageId: 'shadow' }],
    },
  ],
})
