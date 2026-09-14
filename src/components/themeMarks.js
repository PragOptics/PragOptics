// src/components/themeMarks.js
//
// The theme's two marks and its two phrases, shared by the footer toggle and
// the Profile section's Appearance card so they never drift apart. Cameron's
// own marks (svgrepo "sun" and "ball"), one fill, currentColor, so the
// surrounding text's color is the icon's color: the primary (teal on dark,
// purple on light), no gradient, the same rule as every other accent.

export const LIGHT_LABEL = "Show me the Light";
export const DARK_LABEL = "Enter Darkness";

/** The sun: the offer of the light theme. `cls` is the class the surface styles it by. */
export function sunSvg(cls) {
  return `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M23.395 14.106c2.958-1.383 2.828-6.068 5.758-5.884-4.125-2.74-4.019 3.106-9.089 1.235 1.107-3.068-2.292-6.286-0.091-8.227-4.855 0.979-0.645 5.039-5.555 7.301-1.384-2.958-6.068-2.828-5.884-5.758-2.74 4.125 3.106 4.019 1.235 9.089-3.068-1.107-6.286 2.292-8.227 0.091 0.979 4.855 5.039 0.645 7.301 5.555-2.958 1.384-2.828 6.068-5.758 5.884 4.125 2.74 4.019-3.106 9.089-1.235-1.107 3.068 2.292 6.286 0.091 8.227 4.855-0.979 0.645-5.039 5.555-7.301 1.384 2.958 6.068 2.828 5.884 5.758 2.74-4.125-3.106-4.019-1.235-9.089 3.068 1.107 6.286-2.292 8.226-0.091-0.979-4.855-5.039-0.645-7.301-5.555z"/>
    </svg>`;
}
/** The moon: the offer of the dark theme. */
export function moonSvg(cls) {
  return `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M16.098 1.686c-7.827 0-14.172 6.345-14.172 14.173s6.345 14.172 14.172 14.172 14.172-6.345 14.172-14.172-6.345-14.173-14.172-14.173zM24.345 24.964c2.169-3.191 2.57-7.678 0.91-11.874-0.621 1.292-1.942 2.185-3.471 2.185-2.125 0-3.848-1.723-3.848-3.848 0-1.213 0.562-2.294 1.439-3-0.576-0.277-0.989-0.838-1.056-1.502-0.316 0.373-0.788 0.611-1.316 0.611-0.953 0-1.725-0.772-1.725-1.725 0-0.569 0.275-1.073 0.699-1.387-0.994-0.272-2.004-0.41-3.004-0.405 1.036-0.285 2.128-0.439 3.255-0.439 6.757 0 12.234 5.478 12.234 12.234 0 3.641-1.591 6.91-4.115 9.151z"/>
    </svg>`;
}
