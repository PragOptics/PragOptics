<!--
  OmniSource Product Flyer · PragOptics, Field Instrumentation
  Cover = OmniSource_render.png (keep it beside this file).
  Theme = galactic/dark, matches the PragOptics brochure theme. cyan #1fe0ff · teal #21bca5 · purple #bf7dff · violet #a200ff · green #38ffb3 · amber #ffcc33.
  The <style> block themes the markdown for the Markdown→PDF export.
-->

<style>
:root{
  --bg:#05070d; --panel:#0d1320; --glass:rgba(12,20,34,0.72);
  --ink:#e6edf7; --muted:#9fb3c8; --line:rgba(255,255,255,0.10);
  --cyan:#1fe0ff; --teal:#21bca5; --purple:#bf7dff; --violet:#a200ff;
  --green:#38ffb3; --amber:#ffcc33; --red:#ff5d6c; --radius:16px;
}
html,body{ background:#05070d; }
body{
  background:
    radial-gradient(1200px 720px at 82% -8%, rgba(162,0,255,0.20), transparent 60%),
    radial-gradient(1000px 620px at -12% 8%, rgba(31,224,255,0.15), transparent 55%),
    linear-gradient(180deg,#05070d 0%, #070b14 55%, #04060b 100%);
  color:var(--ink);
  font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  line-height:1.62; max-width:880px; margin:0 auto; padding:30px 30px 56px;
  -webkit-font-smoothing:antialiased;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}
a{ color:var(--cyan); text-decoration:none; border-bottom:1px solid rgba(31,224,255,0.28); }
a:hover{ color:#fff; }
h1,h2,h3,h4{ font-weight:800; line-height:1.18; letter-spacing:.01em; page-break-after:avoid; }
h2{
  font-size:1.55rem; margin:2.3em 0 .7em; padding:.05em 0 .3em .65em;
  color:var(--cyan); border-left:4px solid var(--cyan);
  border-bottom:1px solid var(--line);
  text-shadow:0 0 18px rgba(31,224,255,0.30);
}
h2:nth-of-type(5n+1){ color:var(--cyan);   border-left-color:var(--cyan);   text-shadow:0 0 18px rgba(31,224,255,0.30); }
h2:nth-of-type(5n+2){ color:var(--teal);   border-left-color:var(--teal);   text-shadow:0 0 18px rgba(33,188,165,0.30); }
h2:nth-of-type(5n+3){ color:var(--purple); border-left-color:var(--purple); text-shadow:0 0 18px rgba(191,125,255,0.30); }
h2:nth-of-type(5n+4){ color:var(--green);  border-left-color:var(--green);  text-shadow:0 0 18px rgba(56,255,179,0.28); }
h2:nth-of-type(5n+5){ color:var(--amber);  border-left-color:var(--amber);  text-shadow:0 0 18px rgba(255,204,51,0.26); }
h3{ color:var(--cyan); font-size:1.16rem; margin-top:1.5em; }
h4{ color:var(--teal); }
p{ margin:.7em 0; }
strong{ color:#ffffff; }
em{ color:var(--muted); }
hr{ border:0; height:1px; margin:2.1em 0;
  background:linear-gradient(90deg,transparent,var(--cyan),var(--violet),transparent); opacity:.55; }
ul{ padding-left:1.25em; } li{ margin:.28em 0; }
code{ background:rgba(31,224,255,0.10); color:var(--cyan); padding:.08em .42em; border-radius:6px; font-size:.9em; }
pre{ background:rgba(4,7,14,0.9); border:1px solid var(--line); border-radius:12px; padding:16px 18px; overflow:auto;
  box-shadow:0 14px 36px rgba(0,0,0,0.4), 0 0 0 1px rgba(31,224,255,0.06) inset; }
pre code{ background:none; color:#cfe3f5; font-size:.92rem; line-height:1.6; }
table{ border-collapse:separate; border-spacing:0; width:100%; margin:1.3em 0; font-size:.94rem;
  border:1px solid var(--line); border-radius:12px; overflow:hidden; }
th{ background:linear-gradient(180deg,rgba(31,224,255,0.16),rgba(191,125,255,0.09));
  color:#fff; text-align:left; padding:10px 12px; border-bottom:1px solid var(--line); font-weight:700; }
td{ padding:9px 12px; border-bottom:1px solid rgba(255,255,255,0.06); }
tr:last-child td{ border-bottom:0; }
tbody tr:nth-child(even) td{ background:rgba(255,255,255,0.022); }
sub,.fine{ color:var(--muted); font-size:.78rem; }

.hero{ position:relative; margin:0 0 1.3em; padding:34px 32px; border-radius:20px;
  background:
    radial-gradient(620px 260px at 86% 0%, rgba(162,0,255,0.32), transparent 62%),
    linear-gradient(135deg, rgba(31,224,255,0.12), rgba(191,125,255,0.12));
  border:1px solid rgba(31,224,255,0.32);
  box-shadow:0 0 0 1px rgba(0,0,0,0.4) inset, 0 24px 70px rgba(0,0,0,0.55), 0 0 70px rgba(31,224,255,0.12); }
.hero .kicker{ color:var(--cyan); letter-spacing:.30em; font-size:.70rem; font-weight:700; opacity:.92; }
.hero h1{ font-size:3.1rem; margin:.06em 0 .04em; font-weight:900;
  background:linear-gradient(100deg,#fff, var(--cyan) 58%, var(--purple));
  -webkit-background-clip:text; background-clip:text; color:transparent; border:0; }
.hero .tag{ font-size:1.28rem; color:#fff; font-weight:800; letter-spacing:.03em; }
.hero .sub{ color:var(--teal); font-size:.78rem; letter-spacing:.16em; text-transform:uppercase; margin-top:.5em; }
.hero .lede{ margin-top:1em; font-size:1.08rem; color:var(--ink); }

.banner{ margin:1.6em 0; padding:18px 22px; border-radius:14px; color:#eaf1fb;
  background:linear-gradient(120deg, rgba(31,224,255,0.10), rgba(162,0,255,0.12));
  border:1px solid rgba(191,125,255,0.30); border-left:4px solid var(--cyan);
  box-shadow:0 12px 34px rgba(0,0,0,0.38); }
.banner .big{ display:block; font-size:1.2rem; font-weight:800; color:#fff; margin-bottom:.15em; }
.banner .setup{ display:block; color:var(--muted); font-size:1rem; }
.banner .punch{ display:block; margin-top:.3em; font-size:1.28rem; font-weight:700; letter-spacing:.015em; line-height:1.2; color:#ffd45a; }
.banner.green{ border-left-color:var(--green); background:linear-gradient(120deg,rgba(56,255,179,0.10),rgba(33,188,165,0.10)); }
.banner.amber{ border-left-color:var(--amber); background:linear-gradient(120deg,rgba(255,204,51,0.12),rgba(191,125,255,0.12)); }
.banner.amber .punch{ color:#ffd45a; text-shadow:0 0 16px rgba(255,204,51,0.45); }

/* Do / Don't safety guards — ghost green (do) and ghost red (don't) */
.guards{ display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:1.6em 0; align-items:start; }
.guard{ padding:18px 20px 16px; border-radius:16px; }
.guard-head{ display:flex; align-items:center; gap:10px; margin:0 0 .55em; font-size:1.06rem; font-weight:800; letter-spacing:.01em; }
.guard-badge{ width:26px; height:26px; border-radius:8px; flex:none; display:inline-flex; align-items:center; justify-content:center; font-size:1rem; font-weight:900; }
.guard ul{ margin:0; padding:0; list-style:none; }
.guard li{ position:relative; padding-left:1.7em; margin:.5em 0; font-size:.95rem; line-height:1.52; color:var(--ink); }
.guard li::before{ position:absolute; left:.1em; top:0; font-weight:900; }
.guard.do{ background:linear-gradient(180deg, rgba(56,255,179,0.10), rgba(56,255,179,0.02)); border:1px solid rgba(56,255,179,0.32); box-shadow:0 14px 34px rgba(0,0,0,0.34), 0 0 42px rgba(56,255,179,0.08) inset; }
.guard.do .guard-head{ color:var(--green); text-shadow:0 0 16px rgba(56,255,179,0.30); }
.guard.do .guard-badge{ background:rgba(56,255,179,0.15); color:var(--green); box-shadow:0 0 14px rgba(56,255,179,0.35); }
.guard.do li::before{ content:"✓"; color:var(--green); }
.guard.dont{ background:linear-gradient(180deg, rgba(255,93,108,0.10), rgba(255,93,108,0.02)); border:1px solid rgba(255,93,108,0.34); box-shadow:0 14px 34px rgba(0,0,0,0.34), 0 0 42px rgba(255,93,108,0.09) inset; }
.guard.dont .guard-head{ color:var(--red); text-shadow:0 0 16px rgba(255,93,108,0.30); }
.guard.dont .guard-badge{ background:rgba(255,93,108,0.15); color:var(--red); box-shadow:0 0 14px rgba(255,93,108,0.35); }
.guard.dont li::before{ content:"✕"; color:var(--red); }
@media (max-width:640px){ .guards{ grid-template-columns:1fr; } }

.flow{ display:flex; flex-direction:column; align-items:stretch; gap:10px; margin:1.5em 0; }
.flow-card{ padding:14px 16px; border-radius:14px; background:var(--glass);
  border:1px solid var(--line); border-top:3px solid var(--cyan); box-shadow:0 10px 26px rgba(0,0,0,0.30); }
.flow-card .t{ color:#fff; font-weight:800; font-size:1.02rem; }
.flow-card .s{ color:var(--muted); font-size:.82rem; margin-top:.35em; line-height:1.45; }
.flow-card.c1{ border-top-color:var(--cyan); }
.flow-card.c2{ border-top-color:var(--teal); }
.flow-card.c3{ border-top-color:var(--amber); }
.flow-card.c4{ border-top-color:var(--purple); }
.flow-card.c5{ border-top-color:var(--green); }
.flow-arrow{ align-self:center; color:var(--cyan); font-size:1.2rem; font-weight:800; opacity:.85; transform:rotate(90deg); margin:1px 0; }
@media (max-width:640px){
  table{ display:block; overflow-x:auto; -webkit-overflow-scrolling:touch; }
  .hero h1{ font-size:2.2rem; }
  .hero{ padding:24px 22px; }
  body{ padding:18px 16px 40px; }
}

.contact{ text-align:center; color:var(--muted); font-size:.92rem; margin:.4em 0 0; }
.contact a{ border:0; color:var(--cyan); }
.cover{ text-align:center; }
.cover-note{ max-width:560px; margin:10px auto 0; color:var(--muted); font-size:.74rem; line-height:1.5; font-style:italic; }
.pb{ page-break-after:always; }
@media print{ body{ padding:0 14px; } a{ color:var(--cyan); } }
</style>

<div class="cover">
  <img src="/docs/assets/OmniSourceProductFlyer.png" alt="OmniSource by PragOptics — Universal Loop Power Supply. Reliable. Compact. Efficient." style="max-width:100%; max-height:8.4in;">
</div>

<div class="pb"></div>

<div class="hero">
  <div class="kicker">PRAGOPTICS · FIELD INSTRUMENTATION · OPEN HARDWARE</div>
  <h1>OmniSource™</h1>
  <div class="tag">Pocket Loop Power</div>
  <div class="sub">Adjustable · Current-Limited · Build · Buy</div>
  <div class="lede">Energize any 4-20mA / HART transmitter off any USB port. Dial the voltage, clip on, watch it wake up. One job, done cleanly, in something that lives in your shirt pocket.</div>
</div>

<div class="contact">
  <a href="https://pragoptics.com">pragoptics.com</a> · <a href="https://bridgesindust.com">bridgesindust.com</a> · <a href="mailto:support@fortiviewholdings.com">support@fortiviewholdings.com</a> · <a href="tel:+18324250421">832-425-0421</a>
</div>

---

## Why it exists

A technician needs to power up a transmitter and confirm it comes alive. Today that means a bench supply, a mains cord, or a 24V brick rolling around the floor of the truck. None of that fits in a pocket, and none of it is where you happen to be standing when you need it.

**OmniSource is the loop in your shirt pocket.** Five volts off any USB port, stepped up to a clean, adjustable, current-limited instrument loop. Plug it into a phone charger, a power bank, a laptop, anything that hands out 5V, and OmniSource hands back a healthy 4-20mA loop. Dial the voltage, clip on, done.

<div class="banner">
  <span class="big">Just the loop, anywhere you're standing.</span>
  No bench supply. No mains cord. No 24V brick. The whole tool fits in a pocket and runs off the charger already in your bag.
</div>

It is deliberately the **dumb, reliable** end of the family. It sources the loop and nothing else: it does not measure the current, it does not talk HART, it does not log. The smart side — measurement, HART comms, and the audit trail — lives on other tools in the PragOptics line. Keeping OmniSource simple is the entire point. Fewer parts to fail, nothing to configure, nothing to charge. Hand it to anyone.

---

## How it works

A small boost converter steps your 5V up to the loop voltage you dial in. A self-resetting PTC stands guard, a 10µF cap steadies the boost output, and a single power resistor does the real work: it sets the HART loop load and caps the current. No glass fuse, no diode. That is the whole circuit.

<figure style="margin:1.3em 0;">
  <img src="/docs/assets/products/omnisource/OmniSource_Schematic.png" alt="OmniSource schematic" style="display:block;width:100%;max-width:760px;box-sizing:border-box;border:1px solid rgba(255,255,255,0.12);border-radius:12px;">
  <figcaption style="margin-top:.6em;color:#9fb3c8;font-size:.92rem;"><a href="/docs/assets/products/omnisource/OmniSource_Schematic.pdf" download>&#11015; Download schematic (PDF)</a></figcaption>
</figure>

<div class="flow">
  <div class="flow-card c1"><div class="t">1 · Five volts in</div><div class="s">Any USB-A port — power in only. The USB plug is wired so even a power-managed port lets go of enough current.</div></div>
  <div class="flow-arrow">▸</div>
  <div class="flow-card c2"><div class="t">2 · Boost to loop voltage</div><div class="s">An MT3608 steps 5V up to the loop voltage, set by an exposed multiturn trimpot. Ships set at 25V (24V typical); the exposed trimpot adjusts it up to a 28V ceiling.</div></div>
  <div class="flow-arrow">▸</div>
  <div class="flow-card c3"><div class="t">3 · The PTC: the resettable safety net</div><div class="s">A self-resetting Littelfuse 250R145 PTC (145mA hold, 290mA trip, 250V interrupt) in series on the + leg. It rides normal use cold, trips only on an outside overcurrent, and resets itself — nothing to replace.</div></div>
  <div class="flow-arrow">▸</div>
  <div class="flow-card c4"><div class="t">4 · The 270Ω: triple duty</div><div class="s">Sets the HART loop load, caps the forward current to a safe trickle, and is what makes the output touch-safe.</div></div>
  <div class="flow-arrow">▸</div>
  <div class="flow-card c5"><div class="t">5 · Loop out</div><div class="s">A center-positive DC barrel jack. Tip is loop+, sleeve is the return. Clip on and the transmitter wakes up.</div></div>
</div>

---

## Safe by design

OmniSource is a low-voltage tool, and that is what keeps it simple to handle. Two parts do the work.

The **270Ω resistor** sits in series in the + leg and caps the current the boost can ever push out the front — about **93mA at 25V** (~104mA at the 28V ceiling), into anything, a bolted dead short included. That keeps the 25V output **touch-safe** (SELV): grab the bare leads with dry skin and you feel nothing. A dead short just sits there at ~2.3W in the 3W resistor; nothing trips, nothing to reset. The current and the stored energy are both tiny, so the worst case is only ever a warm part — never a bang.

The **250R145 PTC** is a self-resetting safety net for the one thing that would otherwise matter: an outside voltage forced onto the output by mistake. It rides normal use cold and, only in that case, trips and then resets itself once the fault clears. Nothing to replace.

| If this happens | What OmniSource does |
|---|---|
| **Normal loop** (4-20mA) | Powers it cleanly. Output is touch-safe. |
| **Output dead-shorted** | The 270Ω holds it to ~93mA at 25V (~2.3W in the 3W resistor). Nothing trips, nothing to reset. |
| **Outside voltage on the output** | The PTC trips, then resets itself once the fault is cleared. |

<div class="banner green">
  <span class="big">Safe by design, not by warning label.</span>
  <span class="setup">A low-voltage tool: the 270Ω keeps the output touch-safe and current-limited, and the PTC is a resettable net for the one accidental case. Nothing to blow, nothing to replace.</span>
</div>

**Said plainly:** OmniSource is **non-isolated, floating-ground** — and for its one job, powering a **standalone, disconnected** instrument, it does not need to be; there is no other reference for that to matter against. The only rule is simple: keep the output off any live or mains circuit. Polarity is fixed for you — the barrel is center-positive and keyed, and with no diode in the build nothing can go in backwards. The flame-retardant case suits the industrial spaces these live in; it is not there because the tool is ever meant to see mains. The full writeup lives in the [technical doc](OmniSource-Technical.md).

---

## Before you connect anything

OmniSource has exactly one job — energize a **single two-wire instrument that is disconnected from everything else**, so you can confirm it powers up. Stay inside that one rule and it is a touch-safe pocket tool. Here is the whole safety envelope, in two short lists.

<div class="guards">
  <div class="guard do">
    <div class="guard-head"><span class="guard-badge">&#10003;</span>What to do</div>
    <ul>
      <li>Use it on a <strong>standalone instrument</strong> that isn't wired to anything else.</li>
      <li>Power it from <strong>any USB 5&thinsp;V source</strong> — a battery pack, a laptop, a phone charger. The input side is always fine; the rule is only about the output.</li>
      <li>Plug in USB, set the voltage with no load if needed, then clip the harness onto the one disconnected instrument. That is the whole job.</li>
    </ul>
  </div>
  <div class="guard dont">
    <div class="guard-head"><span class="guard-badge">&#10005;</span>What not to do</div>
    <ul>
      <li><strong>Never</strong> connect the barrel jack to any <strong>live, energized, powered, or ground-referenced</strong> loop or circuit.</li>
      <li><strong>Never</strong> connect it to <strong>mains or line voltage</strong>.</li>
      <li><strong>Don't</strong> rely on it for isolation. It is non-isolated (floating ground) — keep the output on a disconnected instrument, off anything that carries its own power or ground.</li>
    </ul>
  </div>
</div>

---

## Adjustable, not fixed

OmniSource is an *adjustable* supply, not a fixed-voltage brick. An **exposed multiturn trimpot** sets the loop voltage to whatever the instrument in front of you actually needs.

1. Power the stick from USB with **no instrument connected**.
2. Meter the barrel output, tip to sleeve.
3. Turn the pot until the meter reads your target (25V is the common default).
4. Connect the instrument.

The pot is multiturn, so it sets smoothly and holds. Because it stays accessible, the same unit re-tasks to a different instrument in seconds, with no tool beyond a small screwdriver.

---

## Built to be opened

OmniSource is meant to be taken apart. It is a handful of through-hole parts on a simple board, in a case that opens — nothing potted, nothing locked. Open it whenever you like to probe it, retune the voltage, or swap a part if you ever need to. It is a tool you own, not a sealed black box.

---

## Two ways to get one

OmniSource is **open hardware.** The design is yours; the assembled unit is for when you would rather not source parts and solder.

<div class="flow">
  <div class="flow-card c1"><div class="t">Build it</div><div class="s">The full plans are free: schematic, bill of materials, a step-by-step solder guide, and the enclosure STL — sliced and ready. A handful of leaded, through-hole parts plus a pre-built boost module; no fine-pitch SMD, no hot-air station. Print the case on whatever resin or FDM printer you own, an hour with an iron, and it is yours.</div></div>
  <div class="flow-card c2"><div class="t">Buy it</div><div class="s">Don't want to source and solder? Order one assembled, tested, and voltage-set, in its printed flame-retardant case with a test harness and finger-loop tether. It arrives ready to clip onto a loop, its printed case warranted for life.</div></div>
</div>

<div class="banner green">
  <span class="big">Build one or buy one.</span>
  Your call, same tool. The plans and the STL are always free — print your own case in any material and it is your own. Buy the finished unit and its case is warranted for life.
</div>

### The build-your-own license, in plain English

The plans are free, and you may build OmniSource for your **own use**, as many as you like. What you may not do is **sell units or the plans**, or reproduce it commercially. That is what the assembled units are for. Build one for your toolbag, print a case, share the link. Just don't open a competing shop with our drawing. *(The full personal-build license ships with the download.)* Warranty and liability terms for every PragOptics product live in **[Open Hardware, Warranty & Liability](/docs/#doc=PragOptics-Open-Hardware-and-Warranty.md)**.

---

## Specs at a glance

| | |
|---|---|
| **Input** | 5V USB-A (power in — input only) |
| **Output** | Center-positive DC barrel, voltage set by exposed trimpot |
| **Loop voltage** | Adjustable, ships set at 25 V (24 V typical); 28 V ceiling |
| **Loop load** | 270Ω 3W, inside the 230-600Ω HART window |
| **Forward limit** | ~93mA at 25V, ~104mA at the 28V ceiling (set by the 270Ω) |
| **Protection** | 270Ω current cap + self-resetting Littelfuse 250R145 PTC (145mA hold, 290mA trip, 250V interrupt) + 10µF output cap — no glass fuse |
| **Isolation** | None (non-isolated, floating ground) by design |
| **Build** | A handful of leaded / through-hole parts, no SMD, ~1 hour to solder |
| **Case** | Printable, STL included |
| **Scope** | Sources loop power only |

---

## What's in it

**The download (build path):** the wiring schematic, the full BOM with the exact parts, the step-by-step assembly guide, and the enclosure STL. Everything to build one and print a case.

**The box (buy path):** an assembled, tested, voltage-set OmniSource in its printed flame-retardant case, a test-lead harness and finger-loop tether, and a **warranty card** with your unique registration code. Register within 30 days of purchase; the printed case is **warranted for life**. Clip on and go.

---

## Get one

- **[ Download the plans ]** — schematic + BOM + assembly guide
- **[ Get the case STL ]** — sliced, print-ready
- **[ Buy one assembled ]** — tested and voltage-set, in its printed FR case (warranted for life)

<div class="banner">
  <span class="big">Plans free. Case free. Unit when you want it.</span>
  <span class="setup">Plans and STL are always free. Assembled units are available at <a href="https://pragoptics.com">pragoptics.com</a> — see the shop for current pricing.</span>
</div>

---

## One tool, one job, done right

OmniSource wakes a transmitter up, anywhere you can find a USB port, with a design that is honest about exactly what it is. If you need to *read* what the instrument is saying, that is a different box in the family. This one puts the loop on it.

**PragOptics™ · Field instrumentation for industrial automation.**

---

## Get in touch

**PragOptics™**

<div class="contact" style="text-align:left">
<a href="https://pragoptics.com">pragoptics.com</a> · <a href="https://bridgesindust.com">bridgesindust.com</a><br>
<a href="mailto:support@fortiviewholdings.com">support@fortiviewholdings.com</a><br>
<a href="tel:+18324250421">832-425-0421</a>
</div>

<sub>OmniSource and PragOptics are trademarks of PragOptics. OmniSource is a non-isolated, floating-ground tool intended for powering standalone, disconnected instruments; it is not galvanically isolated and is not intended for connection to mains or to a live, ground-referenced field loop. Specifications are subject to change. Contact PragOptics for configuration options and availability.</sub>
