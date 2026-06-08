<link rel="stylesheet" href="/hart/hart.css">

<main class="container">
<article class="prose">
<h1>HART Commands: Universal, Common-Practice, and Device-Specific</h1>
<h2>What are HART commands?</h2>
<p>HART commands are numbered requests a master device sends to a HART field instrument, and the instrument replies with data plus a two-byte response code. HART (Highway Addressable Remote Transducer) is a master-slave digital protocol, maintained as an open standard by the FieldComm Group, that rides on top of the same two wires carrying a 4-20 mA analog signal. The master (a handheld communicator, a control system, or an asset-management tool) asks; the slave (the transmitter or valve positioner) answers. Every exchange is keyed by a command number, so "read the primary variable" is a different number from "write the upper range value."</p>
<p>Commands fall into three classes by who defines them and who must support them: <strong>Universal</strong> (mandatory on every HART device), <strong>Common-Practice</strong> (widely implemented but optional), and <strong>Device-Specific</strong> (defined by the manufacturer for one device type). That tiering is the reason a single vendor-neutral communicator can work any HART instrument on the plant without per-vendor software.</p>

<h2>How a HART command exchange works</h2>
<p>A HART transaction is a request frame from the master and a response frame from the slave, and the response always carries a two-byte status field that tells you whether the command succeeded and how the device is feeling. The request frame names the device (by polling address or unique identifier), the command number, and any data the command needs (for example, the new range value you want to write). The device parses it, acts, and replies.</p>
<p>Those two status bytes are the part technicians often overlook. The first byte is <strong>communication / command response status</strong> (was the frame received cleanly, is the command supported, were the data values in range). The second byte is <strong>field device status</strong> (is the device malfunctioning, is a variable out of limits, has the configuration changed, is the loop current saturated or fixed). Reading those bytes is how a master knows the difference between "write accepted" and "write rejected because the device is write-protected."</p>
<dl>
<dt>Request frame</dt>
<dd>Address, command number, byte count, and any command-specific data, sent by the master.</dd>
<dt>Response frame</dt>
<dd>The same command number echoed, the two status bytes, and the requested data, sent by the device.</dd>
<dt>Response / status bytes</dt>
<dd>Two bytes that report communication health and field-device condition on every single reply.</dd>
</dl>

<h2>The three classes of HART commands</h2>
<p>HART defines three command classes: Universal commands that every device must implement, Common-Practice commands that most devices implement the same way, and Device-Specific commands unique to a manufacturer's model. The split is deliberate: it guarantees a baseline any tool can rely on, standardizes the most common field tasks, and still leaves room for vendors to expose features nothing else has.</p>

<h3>Universal commands (every HART device must support)</h3>
<p>Universal commands are the mandatory baseline implemented by every HART device regardless of manufacturer or type, and they are how any master identifies and reads any instrument cold. Because they are guaranteed present, a communicator can connect to a device it has never seen and immediately learn what it is and what it is measuring.</p>
<ul>
<li><strong>HART command 0 (Read unique identifier):</strong> returns the device's identity (manufacturer code, device type, and unique ID) plus protocol revision. This is the first command sent on connect and the anchor for a device profile. Command 0 is what makes HART "addressable."</li>
<li><strong>Command 1 (Read primary variable):</strong> returns the PV and its engineering units, the core measurement (pressure, level, temperature, flow).</li>
<li><strong>Command 2 (Read loop current and percent of range):</strong> returns the device's reported 4-20 mA value and percent of range.</li>
<li><strong>Command 3 (Read dynamic variables):</strong> returns the loop current plus up to four dynamic variables (PV, SV, TV, QV) in one exchange.</li>
<li><strong>Command 13 (Read tag, descriptor, date):</strong> returns the device's tag, descriptor, and date, the human-readable labels that populate an overview header.</li>
</ul>
<p>One important nuance: command 2 returns the milliamp value the device <em>thinks</em> it is putting out, not a measurement of the actual loop current. Confirming the real current takes an independent measurement, which is a recurring theme in calibration work.</p>

<h3>Common-Practice commands (widely implemented, optional)</h3>
<p>Common-Practice commands are optional commands defined by the standard so that frequent tasks behave the same way across vendors, even though no single device has to implement all of them. When a device does support one, it works to the published definition, which is why a generic communicator can offer range, trim, and loop-test workflows without vendor code.</p>
<ul>
<li><strong>Range and span:</strong> writing the lower and upper range values (LRV/URV), and the "set range from applied PV" method that captures the 4 mA and 20 mA points live from the process.</li>
<li><strong>Trims:</strong> PV zero trim and digital-to-analog (DAC) output trims that align the device's output to a known reference. DAC trims require a certified external milliamp measurement to be meaningful.</li>
<li><strong>Loop test:</strong> commanding a fixed output current (for example 4, 12, or 20 mA) to verify wiring and the receiving system, then releasing back to live tracking.</li>
<li><strong>Damping and transfer function:</strong> writing the damping time constant and the linear or square-root characteristic.</li>
<li><strong>Additional device status:</strong> reading extended diagnostic and status detail beyond the two standard status bytes.</li>
</ul>

<h3>Device-Specific commands (vendor-defined)</h3>
<p>Device-Specific commands are defined by the manufacturer for a particular device model and exposed to tools through that device's descriptor. They cover features the standard never anticipated: a radar level transmitter's echo curve, a Coriolis meter's drive gain, a temperature transmitter's sensor-matching coefficients. Their command numbers and data layouts are not interchangeable between vendors or even between models from the same vendor.</p>
<p>Historically, the way a master learned these commands was the <strong>Device Description (DD)</strong>, defined in the Electronic Device Description Language (EDDL): a vendor-supplied file that tells the tool which numbers exist, what data they carry, and how to render them. A communicator without the right DD could still do everything Universal and Common-Practice, but the vendor's special features stayed dark until the descriptor was loaded.</p>

<h2>A short HART command list</h2>
<p>A few of the most recognized HART commands, by number, name, and class. This is a reference sample, not the full HART command list, which runs to hundreds of entries across the three classes.</p>
<table>
<thead>
<tr><th>Number</th><th>Name</th><th>Class</th></tr>
</thead>
<tbody>
<tr><td>0</td><td>Read unique identifier (device identity)</td><td>Universal</td></tr>
<tr><td>1</td><td>Read primary variable</td><td>Universal</td></tr>
<tr><td>2</td><td>Read loop current and percent of range</td><td>Universal</td></tr>
<tr><td>3</td><td>Read dynamic variables (PV/SV/TV/QV)</td><td>Universal</td></tr>
<tr><td>13</td><td>Read tag, descriptor, date</td><td>Universal</td></tr>
<tr><td>35</td><td>Write range values (LRV/URV)</td><td>Common-Practice</td></tr>
<tr><td>40</td><td>Enter / exit fixed current mode (loop test)</td><td>Common-Practice</td></tr>
<tr><td>48</td><td>Read additional device status</td><td>Common-Practice</td></tr>
<tr><td>Vendor</td><td>Echo curve, sensor matching, drive gain, etc.</td><td>Device-Specific</td></tr>
</tbody>
</table>

<h2>Why this tiering lets a universal communicator work</h2>
<p>The three-class structure is exactly what allows one tool to work any HART instrument without per-vendor software, because the Universal and Common-Practice tiers are guaranteed to behave the same everywhere. A communicator can connect, send command 0 to learn the device's identity, read its measurement with command 1 or 3, read its labels with command 13, and then offer ranging, trimming, and loop testing through Common-Practice commands, all without knowing the manufacturer in advance.</p>
<p>Device-Specific features are the only part that historically required vendor-supplied descriptors. So the practical truth is: the overwhelming majority of day-to-day instrument work (identify, read, configure, range, calibrate, loop test) lives in the two standardized tiers. A well-built universal communicator covers that work for every device on the bus and only needs vendor descriptors to reach the long tail of proprietary features.</p>

<h2>How OmniBus uses universal and common-practice HART</h2>
<p>OmniBus speaks universal and common-practice HART so the screen shows instrument behavior, not raw command numbers or byte payloads. OmniBus is a universal, vendor-neutral handheld HART communicator, calibration recorder, and field node from PragOptics (Fortiview Holdings). Rather than locking to one manufacturer's descriptors, it works from the standardized command tiers and presents tasks the way a technician thinks about them: "range it, trim it, verify it, prove it."</p>
<p>That choice is what makes it manufacturer-independent. The brochure puts it plainly: OmniBus communicates with HART field instruments regardless of manufacturer, with no per-vendor handheld and no descriptor licensing, and organizes commands by device family (Temperature, Level, Pressure, PID Control) so the screen only shows what the connected instrument can actually do. Under the hood, a single command logic layer drives what the operator sees, what the backend executes, and what the historian records, so behavior stays consistent across every device class.</p>
<p>It also handles the command 2 caveat head-on. Because a HART device's reported milliamp value is only what the device thinks it is putting out, OmniBus measures the real loop current with its own onboard milliamp circuit and writes that trusted value into the As-Found / As-Left calibration record, rather than trusting the device's self-report. And on the network side, its multi-modal HART-IP engine auto-detects whether it is connected to a wireless gateway host or a single instrument and adapts the screen accordingly, while keeping the same command vocabulary underneath.</p>
<blockquote>OmniBus speaks standard, universal HART on the wire, with no proprietary protocol games. The innovation is above the wire: in visualization, in orchestration, and in the audit trail.</blockquote>

<h2>Related reading</h2>
<p>For the protocol fundamentals behind these commands, start with <a href="/hart/what-is-hart/">what HART is</a> and the <a href="/hart/glossary/">HART glossary</a>. Common questions are answered in the <a href="/hart/faq/">HART FAQ</a>, and the full set of topics lives on the <a href="/hart/">HART hub</a>. To see how a universal communicator applies these command tiers in the field, visit the <a href="/">OmniBus product page</a>.</p>
</article>
<aside class="cta-box">
  <h2>Meet OmniBus</h2>
  <p>OmniBus by PragOptics is a universal, vendor-neutral HART communicator and calibration recorder in one rugged handheld. Configure, calibrate, and document any HART instrument, with the audit trail built in.</p>
  <a class="cta" href="/">Explore OmniBus</a>
</aside>
</main>
