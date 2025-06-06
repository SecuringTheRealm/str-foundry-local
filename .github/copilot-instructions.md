# Project coding standards

## TypeScript Guidelines
- Use TypeScript for all new code
- Follow functional programming principles where possible
- Use interfaces for data structures and type definitions
- Prefer immutable data (const, readonly)
- Use optional chaining (?.) and nullish coalescing (??) operators

## Writing and labelling guidelines
- Use US English for all code and documentation
- Write clear and concise comments

## React Guidelines
- Use functional components with hooks
- Follow the React hooks rules (no conditional hooks)
- Use React.FC type for components with children
- Keep components small and focused
- Use CSS modules for component styling
- Develop reusable components when possible

## Naming Conventions
- Use PascalCase for component names, interfaces, and type aliases
- Use camelCase for variables, functions, and methods
- Prefix private class members with underscore (_)
- Use ALL_CAPS for constants

## Error Handling
- Use try/catch blocks for async operations
- Implement proper error boundaries in React components
- Always log errors with contextual information

## Answering Questions
- Answer all questions in the style of a friendly colleague, using informal language.
- Answer all questions in less than 1000 characters, and words of no more than 12 characters.
## UI Theming Guidelines

### General Practices
- Use CSS variables for consistent and flexible theming across all components.
- Ensure responsiveness across all UI components to support various screen sizes and devices.
- Always lead prominently with Avanade Orange (`#FF5800`) to highlight key elements and never use the colour black.

### Colour Usage in UI Components
- **Titles & Headlines**:
  - Use Avanade Orange (`#FF5800`) or Avanade Dark Orange (`#DC4600`) to highlight titles, section headers, and primary call-to-action buttons.
  - Maintain consistent usage for visual hierarchy.

- **Backgrounds & Containers**:
  - Employ lighter shades of gray (`#F7F7F7`, `#E5E5E5`) and white (`#FFFFFF`) for backgrounds to provide clean, neutral spaces that enhance readability and contrast.
  - Utilize medium to dark shades of gray (`#999999`, `#666666`, `#4C4C4C`) for subtle delineations, borders, or UI separators.

- **Text & Typography**:
  - Primary text should be dark gray (`#333333`) for readability.
  - Secondary and supportive text can use medium gray tones (`#666666`, `#7F7F7F`) for a clear visual hierarchy.
  - All typography should follow the Avanade standards:
    - Headlines: **Segoe UI Bold**
    - Body text: **Segoe UI Regular**
    - Avoid Segoe UI Light for smaller text elements to maintain accessibility.

- **Interactive & Highlight Elements**:
  - Buttons, links, and interactive highlights should consistently use Avanade Orange (`#FF5800`) to reinforce brand identity and clearly indicate actionable items.
  - Consider Avanade Dark Orange (`#DC4600`) for hover states and secondary interactions.

- **Charts, Graphs & Data Visualisations**:
  - Prioritise tertiary colours specifically for data visualisation:
    - Greens (`#47800A`, `#356008`)
    - Teals (`#008376`, `#1C6062`)
  - Limit their usage strictly to these scenarios to maintain brand integrity.

- **Gradients & Visual Accents**:
  - Apply only approved Avanade gradients for decorative UI elements or backgrounds where appropriate:
    - Solar (primary): `#FFB314` → `#FF5800`
    - Aurora: `#FF5800` → `#890078`
    - Glow: `#FF5800` → `#CE0569`
    - Flame: `#FF5800` → `#C80000`
  - Do not create gradients outside of these combinations to ensure consistency.

By adhering to these guidelines, you'll maintain a cohesive, vibrant, and accessible user interface that aligns closely with Avanade’s distinctive brand.
