export function collapseForwarded(html: string): string {
  if (!html) return html;

  // Gmail-like markers
  const markers = [
    /---------- Forwarded message ----------/i,
    /On .* wrote:/i,
    /<blockquote[\s\S]*?>/i,
    /border-left:\s*2px/i
  ];

  let splitIndex = -1;

  for (const marker of markers) {
    const match = html.search(marker);
    if (match !== -1) {
      splitIndex = match;
      break;
    }
  }

  // Nothing to collapse
  if (splitIndex === -1) return html;

  const visible = html.slice(0, splitIndex);
  const hidden = html.slice(splitIndex);

  return `
    ${visible}
    <details class="gmail-collapse">
      <summary class="gmail-summary">⋯</summary>
      <div class="gmail-quoted">
        ${hidden}
      </div>
    </details>
  `;
}
