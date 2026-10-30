/**
 * Chrome paints its own beige background into an autofilled input, ignoring
 * the view's own `backgroundColor` — only a `:-webkit-autofill` box-shadow
 * can override it. Scoped to auth fields so it never touches the rest of the
 * app's web build.
 */
const CSS = `
  input:-webkit-autofill,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:focus {
    -webkit-text-fill-color: #3a2210;
    -webkit-box-shadow: 0 0 0px 1000px #fffdf6 inset;
    box-shadow: 0 0 0px 1000px #fffdf6 inset;
    caret-color: #3a2210;
    transition: background-color 9999s ease-in-out 0s;
  }
`;

if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.setAttribute("data-autofill-fix", "auth");
  style.textContent = CSS;
  document.head.appendChild(style);
}

export {};
