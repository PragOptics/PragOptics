# OmniSource — Technical Documentation

> OmniSource is published hardware from PragOptics, a division of Bridges Industrial LLC.
> © 2025-2026 Bridges Industrial LLC. Source-available under CC BY-NC-SA 4.0 plus an
> express in-house permission: build for yourself or your employer, not for resale.
> Firmware is proprietary and unpublished. See `omni-LICENSE.md` beside the design files.

---

## Intended use

**OmniSource is a pocket loop-power supply intended solely for powering a single,
standalone, disconnected 4-20 mA / HART instrument off a USB source.** It is
intended for use by qualified instrument technicians during bench check-out of a
transmitter that is not connected to a live process loop, ground reference, or
mains-adjacent wiring.

**OmniSource is not intended, sold, or represented as any of the following:**

- A galvanically isolated power supply.
- A meter, calibrator, or HART communicator.
- A tool for splicing into a live, energized, or ground-referenced field loop.
- A tool for use on or near mains, medical, aviation, life-safety, or hazardous-location systems.
- A general-purpose consumer power supply.

OmniSource does not measure current, does not talk HART, and does not log. The
measurement, HART communications, and audit-trail roles belong to a separate,
isolated measurement-and-comms tool in the PragOptics line. Nothing in
OmniSource couples to that tool.

---

## Disclaimer of liability

Read this section before building, buying, or using an OmniSource.

**Build-your-own — no warranty.** The schematic, bill of materials, assembly
guide, and enclosure files are published as open reference material for
personal, non-commercial construction. Bridges Industrial and PragOptics make
**NO WARRANTY, EXPRESS OR IMPLIED,** of merchantability, fitness for any
particular purpose, safety, regulatory compliance, or freedom from defect of
any device the reader chooses to build from these materials. **You assume all
risk** — of injury, property damage, fire, or economic loss — resulting from
designing, sourcing parts for, building, testing, powering, or using any device
constructed from this publication. Anyone who constructs, modifies, or uses a
device based on these plans is solely responsible for that device's safety,
performance, regulatory compliance, and fitness for their application.
Bridges Industrial and PragOptics are not the manufacturer of any unit you
build yourself, and accept no obligation of support, replacement, refund, or
indemnity for user-constructed units.

**Misuse: no liability.** Bridges Industrial and PragOptics are not liable for
any injury, damage, or loss, direct or consequential, arising from the use of
OmniSource — whether built from the plans or purchased as an assembled unit —
outside its **Intended use** described above. This includes, without
limitation:

- connection to mains-powered, ground-referenced, high-voltage, or otherwise energized circuits;
- use on medical, aviation, marine, automotive-safety, life-safety, or hazardous-location equipment;
- operation by untrained personnel or by any person who does not understand the safety envelope described in this document;
- modification or servicing beyond what this document expressly permits;
- combination with third-party components or accessories not tested by PragOptics;
- use in violation of applicable local codes, standards, or workplace safety regulations.

**You are the qualified operator.** OmniSource is a tool designed for
technicians who understand what a 4-20 mA loop is, what a HART instrument is,
what an ungrounded floating supply implies, and what a mains-contact hazard
looks like. It is not designed for consumer, novice, or unattended use, and
must not be represented as such by any reseller.

**Trademarks and reproduction.** OmniSource and PragOptics are trademarks of
PragOptics. The design is published solely for
personal, non-commercial construction. Commercial reproduction or resale of
units or plans, and use of the PragOptics or OmniSource marks in connection
with a competing or derivative product, are prohibited.

By constructing, purchasing, or using an OmniSource — or by downloading,
distributing, or acting on the plans — you acknowledge that you have read and
accepted this Intended Use statement and this Disclaimer of Liability.

**Platform-wide terms.** The warranty and liability terms that apply across all
PragOptics hardware live in the platform document **PragOptics Published Hardware,
Warranty & Liability** ([open it in the Codex](/docs/#doc=PragOptics-Published-Hardware-and-Warranty.md)).
The device-specific intended-use and safety envelope above sits on top of that
document; where this document is stricter, this document governs.

---

## Overview

**OmniSource is a pocket loop-power stick.** It takes 5 V off any USB port and delivers an adjustable, current-limited DC loop
to a single two-wire instrument. One job, done cleanly: put a healthy loop on
a 4-20 mA / HART transmitter so a tech can power it up anywhere, off a phone
charger or a power bank, with nothing else on the bench.

Keeping OmniSource simple is the point: fewer parts to fail, nothing to
configure, hand it to anyone qualified.

---

## How it works

<figure style="margin:1.2em 0;">
  <img src="/docs/assets/products/omnisource/OmniSource_Schematic.png" alt="OmniSource schematic" style="display:block;width:100%;max-width:820px;box-sizing:border-box;border:1px solid rgba(255,255,255,0.12);border-radius:12px;">
  <figcaption style="margin-top:.5em;font-size:.9em;"><a href="/docs/assets/products/omnisource/OmniSource_Schematic.pdf" download>&#11015; Download schematic (PDF)</a></figcaption>
</figure>

Three parts past the boost: a self-resetting PTC, an output capacitor, and one
resistor. No glass fuse, no diode. That is the whole circuit.

- **Input.** 5 V from any USB-A port — power in only; the barrel jack is the
  output, never an input. On the USB plug, D+ is shorted to D− so a
  power-managed port releases more than 100 mA.
- **Boost.** An MT3608 steps 5 V up to the loop voltage, set by an accessible
  multiturn trimpot (see below). Every unit ships set to 25 V (24 V is the
  typical loop voltage), with a 28 V ceiling. The trimpot is intentionally
  exposed so a tech can dial the voltage the instrument in front of them needs —
  drop it, or raise it for a long cable — anywhere across the boost range up to
  the 28 V ceiling.
- **Output capacitor (C1).** A 10 µF, 50 V electrolytic straight across VOUT+ and
  VOUT−, on the boost side of the resistor. It steadies the boost output and
  rides load transients. Because it sits behind the 270 Ω from the loop's point
  of view, it does not shunt the HART signal.
- **Resettable PTC (F1).** A Littelfuse 250R145 radial PolySwitch (145 mA hold,
  290 mA trip, 250 VAC interrupt, UL94V-0 body) in series off VOUT+, ahead of the
  resistor. Normal loop current is well below its 145 mA hold, so it never
  nuisance-trips; it is the resettable safety net for an outside overcurrent and
  self-resets once the fault clears — nothing to replace (see Safe by design).
- **Loop resistor.** A 270 Ω 3 W wirewound resistor (measured ~263 Ω) in series
  after the PTC, feeding the barrel +. It gives the loop its HART-compatible
  resistance (inside the 230 – 600 Ω window) and, the real point, it caps the
  forward current. The boost physically cannot push more than V<sub>out</sub>/270
  out the front (**~93 mA at 25 V, ~104 mA at the 28 V ceiling**) into any load,
  including a bolted short. At 20 mA it drops ~5.4 V, leaving plenty of
  compliance.
- **Output.** A center-positive DC barrel jack. Tip is loop+, sleeve is the
  return.

---

## Setting the voltage (one-time bench setup)

**This is a bench-only setup performed once per unit at build, or once per re-tasking. It is never performed in the field.** OmniSource ships nominally set to 25.0 V (bench tolerance ±0.1 V). The trimpot is a multiturn mechanical device that retains its setting under normal handling; no thread-locker, witness mark, or fixative is required. The pot does not drift under normal handling; routine re-verification is not required. If a unit has been subjected to impact, extreme temperature, or long storage, verify the setting with a voltmeter before deploying it.

The field-use sequence is:

1. Inspect the OmniSource and the test-lead harness for visible damage; confirm the harness polarity marking (red = +, black = −).
2. Plug OmniSource into a USB source (5 V, at least 500 mA).
3. Clip the test-lead harness onto the instrument loop: red (+) grabber clip to the loop-positive terminal, black (−) grabber clip to the loop-negative / return terminal.

Voltage setting is not part of the field-use sequence and must not be performed in the field.

### When to run this procedure

Run the procedure below only in these cases (the pot does not drift on its own, so routine re-verification is not required):

- Initial factory bench-set of a newly built unit.
- One-time bench re-tasking of a unit that will be permanently dedicated to an instrument requiring a loop voltage other than 25 V. The target is derived from the instrument's minimum loop-compliance voltage plus expected cable drop, and stays at or below the 28 V ceiling. This is a bench operation performed once at re-tasking, not a per-instrument or per-session adjustment.

**Ceiling: 28 V. Do not set the output above the 28 V ceiling.** OmniSource ships set to 25 V (24 V is the typical loop voltage); the exposed trimpot lets a tech dial anywhere across the boost range up to that ceiling for the instrument and cable in front of them. Running the pot to the top is never necessary — at the 28 V ceiling a dead short brings the 270 Ω to ~2.9 W, essentially its full 3 W rating. Setting the output above the instrument's needs, or above the ceiling, is outside the intended-use envelope, voids any implied fitness for purpose, and may damage the connected instrument or the OmniSource itself.

### Procedure

1. With no instrument connected to the harness and no harness connected to the OmniSource, plug OmniSource's USB input into a USB source rated at least 500 mA at 5 V (wall charger, laptop port, or power bank all work). This bare-USB step lets you confirm the unit powers cleanly before loading the barrel jack.
2. Take the test-lead harness (center-positive barrel plug on one end, two hook-style grabber clips on the other — red = +, black = −). Insert the harness barrel plug into the OmniSource output barrel jack. Let the two grabber clips hang free, not touching each other and not touching any conductive surface.
3. Set a digital multimeter to DC volts (VDC), 0-50 V range or autorange. Confirm the function switch is on VDC, not VAC. Clip or hold the red (+) meter probe onto the red (+) grabber clip and the black (−) meter probe onto the black (−) grabber clip. The grabber clips remain otherwise free-hanging.
4. Locate the multiturn trimpot on the OmniSource PCB (labeled VR1 on the silkscreen). Using a 2 mm flathead jeweler's screwdriver, turn the trimpot slowly: clockwise increases voltage, counter-clockwise decreases voltage. Adjust until the meter reads 25.0 V ±0.1 V, measured unloaded. The specified target is 25.0 V ±0.1 V; any other setting must stay at or below the 28 V ceiling and is applied at the operator's discretion and risk. Do not force the pot past its end-stops.
5. Unplug USB from the OmniSource first. Then remove the meter probes from the grabber clips. Then unplug the harness barrel plug from the OmniSource barrel jack.
6. Reconnect the harness barrel plug and reapply USB. Re-measure across the grabber clips with the meter to confirm the reading matches the target within ±0.1 V. If the reading has shifted, repeat step 4. Then unplug USB and remove the harness as in step 5.

Once step 6 has confirmed the setting, the unit is ready for field use per the sequence above, subject to the operator confirming correct polarity (red = +, black = −) and the absence of visible damage before each use. To verify a shipped or previously-set unit without adjusting it, perform steps 1-3 and read the meter; do not turn the trimpot.

---

## Safe by design

OmniSource is a low-voltage tool, which is what keeps it simple to handle. Two
parts carry the safety.

- **The 270 Ω 3 W resistor caps the forward side.** In series in the + leg, it
  limits the current the boost can push out the front to V<sub>out</sub>/270 —
  ~93 mA at 25 V, ~104 mA at the 28 V ceiling — into any load, a dead short
  included. A dead short simply sits at ~2.3 W at 25 V (~2.9 W at the ceiling),
  both under the resistor's 3 W rating, so it holds indefinitely: nothing trips,
  nothing to reset. Normal loop current is 4 – 20 mA, far below all of this. That
  same 270 Ω keeps the 25 V output **touch-safe** (SELV): even a wet-skin body
  path (a few kΩ finger-to-finger) draws only a few mA through it, below the
  perception threshold. Current and stored energy are both tiny, so the worst
  case is a warm part — never a bang.

- **The 250R145 PTC is a resettable safety net.** It rides normal use cold and
  engages only on the one thing that would otherwise matter — an outside voltage
  forced onto the output by mistake. In that case it trips, limits the fault, and
  resets itself once the fault is cleared. There is nothing to replace.

- **Non-isolated, by design.** OmniSource is non-isolated (floating ground), and
  for its one job — powering a standalone, disconnected instrument — it does not
  need to be: there is no other reference for isolation to matter against. The
  only operating rule is the one in *Intended use*: keep the output off any live
  or mains circuit. True mains-isolation is a different tool.

- **Polarity.** Center-positive barrel, keyed by the jack so it cannot mate
  backwards; with no diode in the build, nothing else can go in backwards either.

- **Case and layout.** The flame-retardant case suits the industrial spaces these
  live in — it is not there because the tool is ever meant to see mains. Give R1 a
  few mm of air off the case wall so it runs cool.

- **Servicing.** The PTC is self-resetting, so there is no fuse to replace and no
  hatch. The board is a handful of through-hole parts in a case that opens — open
  it to probe, retune the voltage, or swap a part. Do not substitute the resistor,
  the PTC, or the cap with different ratings; that changes the safety envelope and
  returns the unit to "user-constructed" status for liability purposes.

---

## Printing the parts

Three printed parts, two materials. Every file ships **pre-oriented for resin
printing** — plate them as they arrive. These are designed to be easy prints;
the profiles below are the exact setups we run in production.

| File | Contains | Material | Supports |
|---|---|---|---|
| `OmniSource.stl` | Enclosure + lid, print-oriented | FR resin | None |
| `OmniSource_Enclosure.3mf` | Enclosure | FR resin | None |
| `OmniSource_Lid.3mf` | Lid | FR resin | None |
| `OmniSource_Case.stl` | Case, supports included | Silicone-like resin | Included |
| `OmniSource_Case.3mf` | Case | Silicone-like resin | Included |

The machine-readable version of these profiles lives at
[print-profiles.json](/docs/assets/products/omnisource/print/print-profiles.json)
— plain JSON anyone can view, download, or script against. It updates whenever
the tables below do.

### Enclosure + lid — FR resin

The housing prints in **FR (flame-retardant) resin**, using **TSMC (two-stage
motion control)** lift and retract. The enclosure and lid print **unsupported**
without issues. This is the exact production profile: **30 µm** layers,
**5 bottom layers**, **5 transition layers**, light intensity **100%**
throughout. Speeds are mm/min; two-stage values read as first stage *then*
second stage.

| Setting | Bottom layers (5) | Normal layers |
|---|---|---|
| Exposure | 18 s | 1.8 s |
| Lift (two-stage) | 0.05 mm then 8 mm | 0.05 mm then 6 mm |
| Lift speed | 40 then 240 mm/min | 40 then 240 mm/min |
| Retract (two-stage) | 4.05 mm then 4 mm | 2.05 mm then 4 mm |
| Retract speed | 100 then 10 mm/min | 180 then 60 mm/min |
| Wait before print | 2 s | 2 s |
| Wait after print | 0.05 s | 0.05 s |

### Case — silicone-like resin

The soft case prints in a **silicone-like resin** and is **supported** — the
supports are already in the files, so print it exactly as plated. This is the
exact production profile: **50 µm** layers, **4 bottom layers**,
**6 transition layers**, light intensity **100%** throughout. The flexible
part gets the same full-height lift on every layer.

| Setting | Bottom layers (4) | Normal layers |
|---|---|---|
| Exposure | 30 s | 6 s |
| Lift (two-stage) | 0.05 mm then 8 mm | 0.05 mm then 8 mm |
| Lift speed | 40 then 240 mm/min | 40 then 240 mm/min |
| Retract (two-stage) | 4.05 mm then 4 mm | 4.05 mm then 4 mm |
| Retract speed | 100 then 10 mm/min | 120 then 30 mm/min |
| Wait before print | 3 s | 3 s |
| Wait after print | 0.05 s | 0.05 s |

<!-- FILL: drop the build-plate photos in
     docs/assets/products/omnisource/print/ and embed them below — resin parts
     shown released, unbroken. -->


### The build plate matters

We print on a **flexible magnetic build plate from Wham Bam** — specifically
Wham Bam, because their plates are proven, trusted, and the coating does not
flake paint off into your resin vat. The flexible plate is what lets parts
with a large plate footprint **release by flexing, without breaking**: peel
the plate, the parts pop free.

That is our recommendation, not a hard requirement. The pieces print fine on a
rigid plate — but parts printed flat are more susceptible to breaking during
release when you cannot flex the plate under them. If you are prying flat parts
off a rigid plate, go slowly and work from a corner.

### FDM

We publish **no FDM profile**. The enclosure and lid are deliberately simple
prints, and on an FDM machine they go down flat on the bed with ordinary
settings (the orientation may need adjusting to suit your machine) — the FDM
process is actually friendlier to the housing than resin is. The soft case is
a different story: it depends on the silicone-like resin's flexibility, and
there is no FDM equivalent we would put our name on. We still recommend the
resin prints throughout: the material science behind today's engineering
resins has made them a genuine competitor to the polypropylenes and urethanes
on the market, and the resin parts are the ones we test and ship.

*Printed one? <a href="/#mode=builds" target="_top">Share your build</a> — anonymously or with your account.*

---

## What OmniSource is not

- Not a meter, a calibrator, or a HART communicator.
- Not a galvanically isolated supply.
- Not a tool for connecting to a live, ground-referenced, or mains-adjacent loop.
- Not a consumer power supply.

The measurement and communication roles belong to a separate, isolated
measurement-and-comms tool in the PragOptics line. OmniSource is independent of
it; nothing here couples to that tool.

---

## One line

A pocket, adjustable, current-limited loop-power stick that runs off any USB
port and wakes up a single, disconnected two-wire instrument: an exposed trimpot
sets the voltage, a 270 Ω 3 W resistor keeps the output touch-safe and
current-limited, a self-resetting 250R145 PTC backs it up, and a 10 µF cap keeps
it steady. Published hardware, free to build, and built to be opened.
