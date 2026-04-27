// src/components/dropdown.js

export function initDropdownMenu() {
  document.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest(".dropdown-toggle");

    document.querySelectorAll(".dropdown").forEach(d => {
      if (toggleBtn && d.contains(toggleBtn)) d.classList.toggle("open");
      else d.classList.remove("open");
    });
  });
}