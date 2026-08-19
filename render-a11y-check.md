# Accessibility check

Run the app with `npm start`, then inspect it at mobile and desktop widths with the browser accessibility tree.

Required checks before release:

- Every route has one meaningful `h1` and a logical heading order.
- Form controls have visible labels and useful autocomplete attributes.
- Keyboard focus is visible and every action is reachable without a pointer.
- Status and error messages use `role="status"` or `role="alert"` and are announced.
- Course rows expose their action semantics and have a large touch target.
- Text and controls meet WCAG AA contrast and reflow without horizontal scrolling at 390px.
- Test with Windows high contrast mode and reduced motion.

The current client includes labelled login controls, live network status, busy button semantics, and alert messaging. A full release gate should add axe-core/Playwright in CI once the team chooses a browser test runner.
