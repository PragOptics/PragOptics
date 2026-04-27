    function ensureGhostBubble() {
    if (!editorRoot) return null;
    let el = editorRoot.querySelector(".po-json-ghost");
    if (!el) {
        el = document.createElement("div");
        el.className = "po-json-ghost hidden";
        editorRoot.appendChild(el);
    }
    return el;
    }

    // Measure caret pixel position inside textarea using an offscreen mirror
    function getCaretXY() {
    const cs = window.getComputedStyle(textarea);

    const mirror = document.createElement("div");
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = cs.whiteSpace;       // pre or pre-wrap (mode-aware)
    mirror.style.wordBreak = cs.wordBreak;
    mirror.style.overflowWrap = cs.overflowWrap;

    mirror.style.fontFamily = cs.fontFamily;
    mirror.style.fontSize = cs.fontSize;
    mirror.style.lineHeight = cs.lineHeight;
    mirror.style.letterSpacing = cs.letterSpacing;

    mirror.style.padding = cs.padding;
    mirror.style.border = cs.border;
    mirror.style.boxSizing = cs.boxSizing;

    mirror.style.width = `${textarea.clientWidth}px`;

    const before = textarea.value.slice(0, caretPos);
    const after = textarea.value.slice(caretPos);

    // Use a marker span to locate caret
    const marker = document.createElement("span");
    marker.textContent = "\u200b"; // zero-width space

    mirror.textContent = before;
    mirror.appendChild(marker);

    // Append a tiny bit of after so wrapping matches real layout
    mirror.appendChild(document.createTextNode(after.slice(0, 1)));

    document.body.appendChild(mirror);

    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    document.body.removeChild(mirror);

    // Convert to textarea-local coordinates
    const x = markerRect.left - mirrorRect.left - textarea.scrollLeft;
    const y = markerRect.top - mirrorRect.top - textarea.scrollTop;

    return { x, y };
    }

    function renderGhostBubble(ghostText) {
    const bubble = ensureGhostBubble();
    if (!bubble) return;

    if (!ghostText) {
        bubble.classList.add("hidden");
        bubble.textContent = "";
        return;
    }

    bubble.classList.remove("hidden");
    bubble.innerHTML = `Tab: <code>${esc(ghostText)}</code>`;

    const { x, y } = getCaretXY();
    const taRect = textarea.getBoundingClientRect();
    const rootRect = editorRoot.getBoundingClientRect();

    // Position near caret; prefer below, but flip above if needed
    const left = (taRect.left - rootRect.left) + x;
    const topBelow = (taRect.top - rootRect.top) + y + 24;
    const topAbove = (taRect.top - rootRect.top) + y - 38;

    const maxTop = editorRoot.clientHeight - 10;
    const top = (topBelow < maxTop) ? topBelow : Math.max(8, topAbove);

    bubble.style.left = `${Math.max(8, Math.min(left, editorRoot.clientWidth - 60))}px`;
    bubble.style.top = `${top}px`;
    }