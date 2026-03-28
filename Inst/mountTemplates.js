export async function mountTemplatesOnce({
  gridId = 'grid',
  templates = []
} = {}) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  // Guard: already mounted
  if (document.getElementById('instrumentSetup')) return;

  for (const tpl of templates) {
    console.log('[mount] fetching:', tpl.src);

    const res = await fetch(tpl.src);
    console.log('[mount] status:', res.status);

    const html = await res.text();
    console.log('[mount] html length:', html.length);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();

    console.log('[mount] child count:', wrapper.childNodes.length);

    while (wrapper.firstChild) {
      grid.appendChild(wrapper.firstChild);
    }
  }
}