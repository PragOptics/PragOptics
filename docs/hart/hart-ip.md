# What Is HART-IP? HART Over Ethernet and Wireless Gateways

<p><strong>HART-IP is the HART protocol carried over a standard TCP/IP network instead of over the analog 4-20 mA loop.</strong> It packs the same HART commands a technician already knows (HART stands for Highway Addressable Remote Transducer) into Ethernet, Wi-Fi, or cellular packets, commonly on TCP port 5094. HART-IP is an open FieldComm Group standard, so a tool that speaks it can reach a field instrument or a wireless gateway anywhere the network reaches, without clipping leads onto a pair of wires. This page explains what HART-IP is, how it differs from classic FSK HART on the loop, the two network topologies you will meet, and why HART over Ethernet matters for working many instruments across a plant.</p>

<h2>HART-IP definition: HART over TCP/IP</h2>
<p><strong>HART-IP is HART message frames wrapped in TCP/IP and exchanged over an Ethernet or wireless network, most commonly on port 5094.</strong> The application layer is unchanged: the same Universal, Common-Practice, and device-specific HART commands that ride the analog loop are the payload. What changes is the transport underneath them. Instead of modulating a current loop, the commands travel as network packets to an IP address.</p>
<p>A HART-IP exchange opens a TCP connection to the endpoint, runs a short session initiate handshake, then passes HART command frames back and forth (the same HART PDUs used on the loop) before closing the session. To the instrument logic above the wire, a HART command 0 read of device identity looks identical whether it arrived over a copper loop or a network socket. That is the point of the standard: same HART, different road.</p>
<p>Because HART-IP is defined by the FieldComm Group rather than any single vendor, instruments and gateways from different manufacturers (Emerson, Endress+Hauser, ABB, Yokogawa, Siemens, Vega, and others) can present the same wire-level behavior once the network reaches them.</p>

<h2>How HART-IP differs from classic FSK HART on the loop</h2>
<p><strong>Classic HART rides as a small FSK signal on top of a 4-20 mA analog loop, while HART-IP carries the same commands as network packets over TCP/IP.</strong> Classic HART is a physical-layer technique: a Frequency Shift Keying (FSK) tone is superimposed on the existing current loop, so the analog primary variable and the digital HART conversation share the same two wires. You reach the device by physically connecting a HART modem across the loop.</p>
<p>The differences that matter in the field:</p>
<table>
<thead>
<tr><th>Aspect</th><th>Classic FSK HART (on the loop)</th><th>HART-IP (over the network)</th></tr>
</thead>
<tbody>
<tr><td>Physical medium</td><td>FSK tone on a 4-20 mA wire pair</td><td>Ethernet, Wi-Fi, or cellular IP packets</td></tr>
<tr><td>Addressing</td><td>Polling address on the loop; physical access</td><td>IP address and TCP port (commonly 5094)</td></tr>
<tr><td>Reach</td><td>One device (or a short multidrop) per connection</td><td>Anywhere the network routes, including many devices behind one host</td></tr>
<tr><td>How you connect</td><td>Clip a HART modem onto the leads</td><td>Open a TCP session to the endpoint</td></tr>
<tr><td>Command set</td><td>Standard HART commands</td><td>The same standard HART commands</td></tr>
</tbody>
</table>
<p>The takeaway: HART-IP does not replace or change HART itself. It changes only the transport. The diagnostics, configuration, and calibration commands are the same in both worlds, which is why a well-built communicator can treat the loop and the network as two ports into one instrument model. For a refresher on the loop-side basics, see <a href="/hart/what-is-hart/">What is HART?</a></p>

<h2>The two HART-IP topologies: direct instrument vs gateway host</h2>
<p><strong>A HART-IP endpoint is either a single instrument that owns its own IP address, or a gateway host that fronts a whole mesh of wireless field devices.</strong> These two topologies look the same on the wire (a TCP connection on port 5094) but mean very different things, and a tool has to know which one it reached before it can present the right screen.</p>

<h3>Topology 1: a direct HART-IP instrument (one endpoint, one device)</h3>
<p>A direct HART-IP instrument is a single field device with its own Ethernet jack or Wi-Fi radio that speaks HART-IP itself. Examples include Ethernet-equipped flow meters, analyzers, and Coriolis transmitters. Here the IP endpoint is the device: you connect, read its identity with command 0, and work that one instrument the same way you would over the loop. One address, one transmitter.</p>

<h3>Topology 2: a gateway host (one endpoint, many wireless devices)</h3>
<p>A gateway host is not one instrument at all. It is a host that sits at one IP address and fronts a whole mesh of wireless field devices behind it. When you connect to the gateway over HART-IP, the single endpoint represents dozens of downstream instruments. Reaching any one of them means routing a command through the host to the addressed sub-device, so the gateway behaves like a roster and a router rather than a single transmitter.</p>
<p>That distinction drives everything downstream. Point a tool at a direct instrument and it should land in an instrument workspace. Point it at a gateway and it should open the full device roster of the mesh. Confusing the two is one of the classic field frustrations HART over Ethernet introduces.</p>

<h2>WirelessHART gateways: the common gateway-host case</h2>
<p><strong>WirelessHART gateways are the most common gateway-host endpoint, fronting a self-organizing mesh of battery-powered wireless field devices and exposing them over HART-IP.</strong> WirelessHART (defined in the HART 7 standard) lets field instruments form a redundant mesh network, and the gateway is the bridge between that mesh and the plant network. To a HART-IP client, the gateway is one IP address; behind it can be many wireless transmitters reporting primary, secondary, tertiary, and quaternary variables.</p>
<p>Common gateway-host products include:</p>
<ul>
<li><strong>Emerson Wireless 1410 and 1420 gateways</strong> (the Emerson SmartWireless family), which bridge a WirelessHART mesh to the network and serve both a HART-IP interface and their own web UI.</li>
<li><strong>Endress+Hauser FieldGate</strong> (for example the FieldGate FXA42), which fronts WirelessHART or wired field devices and exposes them over IP.</li>
</ul>
<p>In practice, working a wireless network the traditional way often means a laptop, the gateway's own web page for the network and the host devices behind it. The reward for that effort is reach: one gateway can put a whole mesh of instruments on the network at once. See the <a href="/hart/glossary/">HART glossary</a> for definitions of WirelessHART, gateway, and mesh, and the <a href="/hart/faq/">HART FAQ</a> for common gateway questions.</p>

<h2>Why HART-IP matters</h2>
<p><strong>HART-IP matters because it lets you work many instruments across the network instead of physically reaching each loop, turning HART from a one-device-at-a-time task into a networked one.</strong> Once an instrument or a gateway is on the network, a technician or a host system can read variables, run diagnostics, change configuration, and pull device status without standing at the device. The practical benefits:</p>
<ul>
<li><strong>Reach.</strong> Connect over Ethernet, Wi-Fi, or cellular to instruments that are hard to access in person.</li>
<li><strong>Scale.</strong> A single gateway endpoint can expose an entire mesh of wireless devices, so one connection covers many instruments.</li>
<li><strong>Standardization.</strong> Because HART-IP is a FieldComm Group standard, the same command set works across vendors, with no proprietary wire protocol to reverse-engineer.</li>
<li><strong>Integration.</strong> Asset-management software, historians, and field tools can speak the same HART-IP transport to gather data plant-wide.</li>
</ul>
<p>The catch is the topology question above: a tool that connects over HART-IP must work out whether it reached a single instrument or a gateway full of them, or it will show the wrong thing.</p>

<h2>OmniBus multi-modal HART-IP: auto-detect gateway vs instrument</h2>
<p><strong>OmniBus by PragOptics reaches both HART-IP topologies with one multi-modal engine, auto-detecting on connect whether the endpoint is a gateway host or a single direct instrument, then adapting the screen to match.</strong> OmniBus is a universal, vendor-neutral handheld HART communicator, calibration recorder, and field node. According to the OmniBus product brochure, you give the device the endpoint address and it configures its own network side automatically (its port and subnet), polls the endpoint, and classifies what answered before it draws a screen.</p>
<p>From there it branches based on what it actually found:</p>
<ul>
<li><strong>A gateway?</strong> OmniBus opens the gateway view: every wireless field device in one live roster (name, PV, SV, TV, QV, last update, and state shown as Live, Late, Stale, or Unreachable), device-status counts, gateway load and network health, and one tap into any device for full diagnostics.</li>
<li><strong>A single instrument?</strong> OmniBus lands in the standardized instrument workspace, the same one every transport uses, with the login to match (a gateway takes a username and password; an Endress+Hauser device takes its serial number).</li>
</ul>
<p>Per the brochure, live values refresh on a steady round-robin only for what is on screen, and the truth-grade heartbeat flips to offline the instant the gateway stops answering, so no stale number is ever shown as live. The brochure frames the result plainly: a gateway is not one instrument, it is a whole network of them, and OmniBus reads the whole mesh and walks into any device on it from one screen. HART-IP over Ethernet is one of several transports OmniBus treats identically, alongside USB HART, the on-board two-wire loop, Wi-Fi, and Bluetooth, all feeding the same audit trail. Learn more about the OmniBus field node on the <a href="/">PragOptics homepage</a>, or return to the <a href="/hart/">HART knowledge hub</a> for related topics.</p>
