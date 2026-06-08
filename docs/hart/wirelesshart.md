<link rel="stylesheet" href="/hart/hart.css">

<main class="container">
<article class="prose">
<h1>WirelessHART explained: mesh networks, gateways, and adapters</h1>
<h2>What is WirelessHART?</h2>
<p>WirelessHART is the wireless version of the HART protocol: a 2.4 GHz, self-organizing, self-healing mesh network that carries the same HART commands and device data over the air instead of over a wire pair. It is published as the international standard <strong>IEC 62591</strong> and is maintained by the <a href="https://www.fieldcommgroup.org/">FieldComm Group</a>, the same organization that owns wired HART. HART stands for Highway Addressable Remote Transducer, and WirelessHART keeps the "HART" part fully intact: the application layer and the command set are the same as the wired protocol you already know.</p>
<p>The practical idea is simple. Instead of running new cable to a transmitter in a hard-to-reach spot, you let that instrument talk wirelessly to its neighbors, and those neighbors relay the traffic, hop by hop, back to a central <strong>WirelessHART gateway</strong> that connects the mesh to your host or control system. Every device that can hear the network helps carry it.</p>
<p>If you are new to the protocol family, start with <a href="/hart/what-is-hart/">what HART is</a> and then read this page for the wireless layer on top of it.</p>

<h2>How does WirelessHART relate to wired HART?</h2>
<p>WirelessHART shares the same application and command layer as wired HART but uses a different physical and data-link layer. A HART command such as "read the primary variable" or "read device identity" looks the same to the application whether it arrives over a 4-20 mA pair, over <a href="/hart/hart-ip/">HART-IP</a>, or over a 2.4 GHz radio mesh. That shared command set is why a single tool philosophy can span all three.</p>
<p>The differences sit underneath the commands:</p>
<dl>
<dt>Physical layer</dt>
<dd>Wired HART rides a frequency-shift-keyed digital signal on top of the 4-20 mA analog loop. WirelessHART uses 2.4 GHz radio in the same license-free band as many other industrial and consumer wireless systems.</dd>
<dt>Data-link layer</dt>
<dd>Wired HART uses token-passing on a point-to-point or multidrop wire. WirelessHART uses a time-synchronized, channel-hopping mesh designed to coexist with other 2.4 GHz traffic and to route around interference and failed nodes.</dd>
<dt>Topology</dt>
<dd>Wired HART is one transmitter on a pair of wires (or a few in multidrop). WirelessHART is a many-device mesh where each routing-capable device can relay for others, with no single fixed path.</dd>
</dl>
<p>The takeaway for a technician: the <em>data</em> and the <em>commands</em> are HART. The <em>delivery</em> is a radio mesh. Your mental model of "identify the device, read its variables, configure it, verify it" carries straight over.</p>

<h2>What are the pieces of a WirelessHART network?</h2>
<p>A WirelessHART network has three main building blocks: wireless field devices, adapters that bring existing wired instruments onto the mesh, and a gateway that bridges the mesh to the host system. A network manager function (typically inside the gateway) schedules and routes the traffic.</p>

<h3>Wireless field devices</h3>
<p>These are instruments with WirelessHART radios built in: transmitters for pressure, temperature, level, flow, and similar measurements that join the mesh directly. Many are battery or power-module powered so they can be installed without running signal or power cable, which is much of their appeal. Each one can also act as a routing node, relaying traffic for neighbors so the mesh stays connected as devices come and go.</p>

<h3>WirelessHART adapters</h3>
<p>A WirelessHART adapter connects an existing wired HART instrument to the wireless mesh, so you can get a stranded 4-20 mA transmitter onto the network without rewiring it. The adapter attaches to the wired device, speaks HART to it over the loop, and presents it (and its variables) on the WirelessHART mesh. This is how brownfield plants pull historical, already-installed smart instruments into a wireless monitoring layer: the field device stays wired, the adapter does the radio work.</p>

<h3>The WirelessHART gateway</h3>
<p>The gateway is the bridge between the radio mesh and your host, control system, or historian. It is the device that aggregates every wireless field device and adapter on the mesh and exposes their data to the outside world. It commonly also hosts the network manager and security manager functions that schedule communication slots, assign routes, and manage encryption keys. Crucially, <strong>a gateway is not a single instrument: it fronts a whole network of devices.</strong> When you connect to a gateway, you are reaching dozens of field devices through one address.</p>

<h2>How does WirelessHART relate to HART-IP?</h2>
<p>WirelessHART gateways very often speak HART-IP to the host, so HART-IP is how the wireless mesh usually reaches your control system or software tools. HART-IP is HART carried over a standard TCP/IP network (Ethernet or Wi-Fi). A WirelessHART gateway sits at the seam: WirelessHART radio on the field side, HART-IP on the network side. The host asks the gateway for a device's variables over HART-IP, and the gateway answers using data it collected from the mesh.</p>
<p>That is why, in practice, "talking to a WirelessHART network" from a host or a modern field tool usually means opening a HART-IP connection to the gateway. The gateway then routes requests to individual subdevices on the mesh on your behalf. For the full picture of HART over a network, see <a href="/hart/hart-ip/">HART-IP explained</a>.</p>

<table>
<thead>
<tr><th>Layer</th><th>Wired HART</th><th>WirelessHART (IEC 62591)</th><th>HART-IP</th></tr>
</thead>
<tbody>
<tr><td>Command set</td><td>HART</td><td>HART (same commands)</td><td>HART (same commands)</td></tr>
<tr><td>Physical medium</td><td>4-20 mA wire pair (FSK)</td><td>2.4 GHz radio</td><td>TCP/IP (Ethernet / Wi-Fi)</td></tr>
<tr><td>Topology</td><td>Point-to-point / multidrop</td><td>Self-organizing mesh</td><td>Networked, client to server</td></tr>
<tr><td>Typical role</td><td>One instrument on a loop</td><td>Many wireless devices, relayed</td><td>Bridge from gateway to host</td></tr>
</tbody>
</table>

<h2>How secure is WirelessHART?</h2>
<p>WirelessHART includes security as part of the standard, using AES-128 encryption with managed keys rather than leaving it as an optional add-on. At a high level, traffic on the mesh is encrypted and authenticated so that data cannot be trivially read or spoofed off the air.</p>
<ul>
<li><strong>AES-128 encryption.</strong> The protocol uses 128-bit AES as its encryption building block to protect messages across the mesh.</li>
<li><strong>Join keys.</strong> A device must present the correct join key to be admitted to a particular network. This is what keeps an unauthorized radio from simply associating with your mesh, and it is the credential a technician configures into a new device so it can be accepted by the network and security manager.</li>
<li><strong>Managed keys and a security manager.</strong> Beyond the initial join, the network manages session keys for ongoing communication, so the network operator controls who is allowed on and how traffic is protected.</li>
</ul>
<p>The practical point: when you commission a WirelessHART device, getting the join key and network ID right is part of the job, the same way getting a polling address right matters on a wired loop. (This page describes the security model at a high level; consult the IEC 62591 specification and your vendor's documentation for exact provisioning steps.)</p>

<h2>When is WirelessHART used?</h2>
<p>WirelessHART is used when running wire is impractical, expensive, or too slow, and a measurement is valuable enough to capture but not safety-critical in a way that demands a hard-wired loop. It is most common for monitoring and supplemental measurements rather than fast closed-loop control.</p>
<ul>
<li><strong>Hard-to-reach or remote points.</strong> Tank farms, rotating equipment, distant skids, and spots where a cable run would cost far more than the measurement.</li>
<li><strong>Brownfield additions.</strong> Adding measurements to an existing plant where conduit is full or trenching is disruptive. WirelessHART adapters are the bridge for existing wired instruments here.</li>
<li><strong>Temporary or trial installs.</strong> Process studies, energy audits, and short-term troubleshooting where you want data without a permanent wiring project.</li>
<li><strong>Health and condition monitoring.</strong> Secondary variables and diagnostics (vibration, temperature, corrosion, steam-trap status) that enrich a reliability program without touching the primary control loop.</li>
</ul>
<p>For control loops that demand deterministic, fast, fault-tolerant signaling, a traditional wired loop is still the default. WirelessHART complements the wired plant; it does not replace every wire.</p>

<h2>How OmniBus works with WirelessHART gateways</h2>
<p>OmniBus reaches WirelessHART gateways over HART-IP and presents the gateway's full device roster from one screen, instead of forcing you onto a laptop and the gateway's own web page. <a href="/">OmniBus</a> by PragOptics (Fortiview Holdings) is a universal, vendor-neutral handheld HART communicator, calibration recorder, and field node, and its HART-IP path is multi-modal: it works out what it is connected to before it draws a screen.</p>
<p>According to the OmniBus product brochure, you give OmniBus the device address. It configures its own network side automatically (its port and subnet), polls the endpoint, and detects the device class: a gateway host, or a single direct instrument. Then it adapts to what it actually found.</p>
<ul>
<li><strong>If it is a gateway,</strong> OmniBus opens the gateway view: every wireless field device in one live roster (name, PV, SV, TV, QV, last update, and state shown as Live, Late, Stale, or Unreachable), device-status counts, gateway load and network health, and one tap into any device for full diagnostics.</li>
<li><strong>If it is a single instrument,</strong> OmniBus lands you in the standardized instrument workspace, the same one every transport uses.</li>
</ul>
<p>The brochure frames the value plainly: a gateway is not one instrument, it is a whole network of them, and working a wireless network usually means a laptop, the gateway's own web page, and yet another tool for the devices behind it. OmniBus reads the whole mesh and walks into any device on it from one screen. Values refresh on a steady round-robin, only for what is on screen, and the heartbeat flips to offline the instant the gateway stops answering, so no stale number is ever shown as live.</p>
<p>Because OmniBus speaks standard, universal HART on the wire and the same command set spans wired HART, HART-IP, and the gateway path, the technician experience stays consistent whether the device is on a wire pair or behind a WirelessHART mesh. For the wider protocol family, see the <a href="/hart/">HART hub</a>, and check the <a href="/hart/faq/">HART FAQ</a> or <a href="/hart/glossary/">glossary</a> for quick definitions.</p>

<h2>Key takeaways</h2>
<ul>
<li>WirelessHART is the 2.4 GHz, self-organizing mesh version of HART, standardized as <strong>IEC 62591</strong> and maintained by the FieldComm Group.</li>
<li>It shares the HART application and command layer with wired HART; only the physical and data-link layers differ.</li>
<li>The pieces are wireless field devices, WirelessHART adapters (for existing wired instruments), and a gateway that bridges the mesh to the host.</li>
<li>Gateways commonly speak HART-IP to hosts, so reaching a WirelessHART network usually means a HART-IP connection to the gateway.</li>
<li>Security is built in via AES-128 encryption and join keys managed by the network.</li>
<li>OmniBus reaches gateways over HART-IP, auto-detects gateway-host versus single instrument, and presents the gateway's live device roster from one handheld.</li>
</ul>
</article>
<aside class="cta-box">
  <h2>Meet OmniBus</h2>
  <p>OmniBus by PragOptics is a universal, vendor-neutral HART communicator and calibration recorder in one rugged handheld. Configure, calibrate, and document any HART instrument, with the audit trail built in.</p>
  <a class="cta" href="/">Explore OmniBus</a>
</aside>
</main>
