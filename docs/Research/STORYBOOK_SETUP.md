# Storybook Setup for Component Documentation

> Research Summary - January 2026

## Overview

[Storybook](https://storybook.js.org/) for React & Vite provides an isolated environment for developing, testing, and documenting UI components.

## Installation

```bash
# In existing Vite/React project
npx storybook@latest init

# Or install manually
npm install -D @storybook/react-vite storybook
```

## Configuration

### .storybook/main.ts

```typescript
import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-onboarding',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    reactDocgen: 'react-docgen', // Faster than react-docgen-typescript
  },
}

export default config
```

### .storybook/preview.ts

```typescript
import type { Preview } from '@storybook/react'
import '../src/styles/globals.css' // Import global styles

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#1e1e2e' },
        { name: 'light', value: '#ffffff' },
      ],
    },
  },
}

export default preview
```

### Custom Vite Config

```typescript
// .storybook/main.ts
import { mergeConfig } from 'vite'

const config: StorybookConfig = {
  // ...
  viteFinal: async (config) => {
    return mergeConfig(config, {
      resolve: {
        alias: {
          '@': '/src',
        },
      },
    })
  },
}
```

## Writing Stories

### Basic Component Story

```typescript
// src/components/common/Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline', 'ghost'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Button>

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Primary Button',
  },
}

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary Button',
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex gap-4">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
    </div>
  ),
}

export const Loading: Story = {
  args: {
    loading: true,
    children: 'Loading...',
  },
}
```

### Interactive Story with Actions

```typescript
// src/components/common/Input.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { Input } from './Input'

const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
  args: {
    onChange: fn(),
    onBlur: fn(),
  },
}

export default meta
type Story = StoryObj<typeof Input>

export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
  },
}

export const WithLabel: Story = {
  args: {
    label: 'Email',
    placeholder: 'you@example.com',
  },
}

export const WithError: Story = {
  args: {
    label: 'Password',
    error: 'Password is required',
  },
}
```

### Documentation with MDX

````mdx
{/* src/components/common/Button.mdx */}
import { Meta, Story, Canvas, Controls } from '@storybook/blocks'
import \* as ButtonStories from './Button.stories'

<Meta of={ButtonStories} />

# Button

The Button component is used for user interactions.

## Usage

```tsx
import { Button } from '@/components/common/Button'

;<Button variant="primary" onClick={() => console.log('clicked')}>
  Click me
</Button>
```
````

## Examples

<Canvas of={ButtonStories.Primary} />

## Props

<Controls />

## Accessibility

- Uses native `<button>` element
- Supports keyboard navigation
- Has appropriate ARIA attributes when loading/disabled

````

## Recommended Addons

```bash
npm install -D \
  @storybook/addon-essentials \
  @storybook/addon-a11y \
  @storybook/addon-interactions \
  @storybook/addon-themes \
  @storybook/addon-viewport
````

| Addon                | Purpose                           |
| -------------------- | --------------------------------- |
| `addon-essentials`   | Controls, actions, docs, viewport |
| `addon-a11y`         | Accessibility auditing            |
| `addon-interactions` | Test user interactions            |
| `addon-themes`       | Theme switching                   |
| `addon-viewport`     | Responsive preview                |

## Running Storybook

```bash
# Development
npm run storybook

# Build static site
npm run build-storybook
```

Add to package.json:

```json
{
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  }
}
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Deploy Storybook

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Build Storybook
        run: npm run build-storybook

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./storybook-static
```

## Visual Testing Integration

Integrate with Chromatic for visual regression testing:

```bash
npm install -D chromatic
npx chromatic --project-token=<token>
```

Add to CI:

```yaml
- name: Publish to Chromatic
  uses: chromaui/action@latest
  with:
    projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
```

## Claude Pilot Implementation Plan

1. Install Storybook with Vite framework
2. Configure to match project's dark theme
3. Document core components first:
   - Button, Input, Select, Modal
   - Card, Badge, Spinner
   - Layout components
4. Add accessibility addon
5. Deploy to GitHub Pages
6. Consider Chromatic for visual testing

## Sources

- [Storybook for React with Vite](https://storybook.js.org/docs/get-started/frameworks/react-vite)
- [Vite Builder](https://storybook.js.org/docs/builders/vite)
- [@storybook/react-vite npm](https://www.npmjs.com/package/@storybook/react-vite)
- [Storybook Setup Guide](https://storybook.js.org/docs/get-started/setup)
