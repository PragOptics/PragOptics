// src/components/agreement.modal.js

import { setAgreementAck } from "../runtime/state.js";
import { openLoginModal } from "../ui/login.modal.js";

export function initAgreementModal({ agreementUrl }) {
  const $mask  = document.getElementById("agreementMask");
  const $modal = document.getElementById("agreementModal");
  const $md    = document.getElementById("mdContainer");
  const $agree = document.getElementById("agreeChk");
  const $go    = document.getElementById("agreeGoBtn");

  if (!$mask || !$modal || !$md || !$agree || !$go) return;

  function esc(s) {
    return String(s).replace(/[&<>]/g, c =>
      ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[c])
    );
  }

  function mdToHtml(md) {
    md = md.replace(/\r\n?/g, "\n");

    md = md.replace(/^\s*(?:-{3,}|\*{3,})\s*$/gm, "<hr>");

    md = md.replace(/```([\s\S]*?)```/g, (_, code) =>
      `<pre><code>${esc(code)}</code></pre>`
    );

    md = md.replace(/`([^`]+)`/g, (_, c) => `<code>${esc(c)}</code>`);

    md = md.replace(/^######\s?(.*)$/gm,"<h6>$1</h6>")
           .replace(/^#####\s?(.*)$/gm,"<h5>$1</h5>")
           .replace(/^####\s?(.*)$/gm,"<h4>$1</h4>")
           .replace(/^###\s?(.*)$/gm,"<h3>$1</h3>")
           .replace(/^##\s?(.*)$/gm,"<h2>$1</h2>")
           .replace(/^#\s?(.*)$/gm,"<h1>$1</h1>");

    md = md.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>")
           .replace(/\*([^*]+)\*/g,"<em>$1</em>");

    md = md.replace(
      /(^\|.+\|\s*\n\|(?:\s*:?-+:?\s*\|)+\s*\n(?:\|.*\|\s*\n)+)/gm,
      block => {
        const lines = block.trim().split("\n");
        const header = lines[0].slice(1,-1).split("|").map(c => c.trim());
        const body = lines.slice(2).map(row =>
          row.slice(1,-1).split("|").map(c => c.trim())
        );

        const thead = `<thead><tr>${
          header.map(h => `<th>${h}</th>`).join("")
        }</tr></thead>`;

        const tbody = `<tbody>${
          body.map(r => `<tr>${
            r.map(c => `<td>${c}</td>`).join("")
          }</tr>`).join("")
        }</tbody>`;

        return `<table>${thead}${tbody}</table>`;
      }
    );

    const TABLE_PLACEHOLDER = "§§TABLE_BLOCK§§";
    const tables = [];
    md = md.replace(/<table[\s\S]*?<\/table>/g, match => {
      tables.push(match);
      return TABLE_PLACEHOLDER;
    });

    md = md.replace(
      /^(?!<h\d|<ul|<pre|<p|<table|<hr|<\/|\s*$)(.+)$/gm,
      "<p>$1</p>"
    );

    md = md.replace(new RegExp(TABLE_PLACEHOLDER, "g"), () => tables.shift());

    return md;
  }

  function openAgreementModal() {
    $agree.checked = false;
    $go.disabled = true;
    $md.innerHTML = `<p class="muted">Loading agreement…</p>`;

    $mask.classList.add("is-open");
    $modal.classList.add("is-open");
    $modal.setAttribute("aria-hidden", "false");

    fetch(agreementUrl, { cache: "no-store" })
      .then(r => r.text())
      .then(t => { $md.innerHTML = mdToHtml(t); })
      .catch(() => { $md.innerHTML = `<p class="muted">Unable to load agreement.</p>`; });
  }

  function closeAgreementModal() {
        // Move focus away before hiding modal (prevents aria-hidden violation)

    $mask.classList.remove("is-open");
    $modal.classList.remove("is-open");
    document.body.focus();
    
    // Defer aria-hidden until focus has settled
    queueMicrotask(() => {
      $modal.setAttribute("aria-hidden", "true");
    });

  }

  function submitAgreementAck() {
    if (!$agree.checked) return;

    setAgreementAck({
      agreementUrl,
      acceptedAt: new Date().toISOString(),
      userAgent: navigator.userAgent
    });
    

    closeAgreementModal();

    openLoginModal("signup");
    // Move focus away before hiding modal (prevents aria-hidden violation)
    document.getElementById("loginEmail")?.focus();
  }

  $agree.addEventListener("change", () => { $go.disabled = !$agree.checked;});
  $mask.addEventListener("click", closeAgreementModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $modal.classList.contains("is-open")) closeAgreementModal();
  });

  return {
    openAgreementModal,
    closeAgreementModal,
    submitAgreementAck
  };
}