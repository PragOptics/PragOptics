# HART Glossary: Key Terms in HART Communication

<p>This HART glossary defines the key terms in HART communication, from the physical signaling layer up to device descriptions and calibration records. HART (Highway Addressable Remote Transducer) is a public, open digital protocol that rides on top of the standard 4 to 20 mA current loop, letting a master device read and configure a smart field instrument over the same two wires that already carry the analog measurement. The definitions below use American spelling and are written for working instrument and automation technicians. For a plain-language overview, see <a href="/hart/what-is-hart/">what is HART</a>, and for quick answers see the <a href="/hart/faq/">HART FAQ</a>.</p>

<h2>Protocol and signaling terms</h2>
<dl>
<dt>HART</dt>
<dd>HART stands for Highway Addressable Remote Transducer. It is an open, bidirectional digital communication protocol that superimposes a low-level digital signal on the 4 to 20 mA analog current loop, so a smart instrument can carry both its analog measurement and digital data on the same pair of wires. The standard is maintained by the FieldComm Group.</dd>

<dt>HART-IP</dt>
<dd>HART-IP carries HART messages over standard Ethernet and TCP/IP or UDP networks instead of an analog current loop. It is commonly used to reach HART gateways, I/O systems, and networked instruments, allowing a host to communicate with many devices across a plant network at higher speed.</dd>

<dt>WirelessHART</dt>
<dd>WirelessHART is the wireless version of HART that runs on a self-organizing, self-healing 2.4 GHz mesh network based on IEEE 802.15.4 radios. Each device can route messages for its neighbors, and a gateway connects the mesh back to the wired host system. It uses the same HART commands as wired HART.</dd>

<dt>4 to 20 mA loop</dt>
<dd>The 4 to 20 mA current loop is the analog signaling standard that HART is built on. A transmitter drives a current proportional to its measurement, where 4 mA represents 0 percent of the calibrated range and 20 mA represents 100 percent. HART adds digital data without disturbing this analog value.</dd>

<dt>Bell 202</dt>
<dd>Bell 202 is the telephone-modem signaling standard that HART borrows for its physical layer. It defines how the two frequency tones used by HART are transmitted, providing a proven, low-cost method for sending digital data over a current loop.</dd>

<dt>FSK (frequency shift keying)</dt>
<dd>FSK is the modulation method HART uses to encode digital bits as audio-frequency tones, with 1,200 Hz representing a logic 1 and 2,200 Hz representing a logic 0. Because these tones average to zero net current, the digital HART signal does not affect the analog 4 to 20 mA value it rides on.</dd>

<dt>Loop current</dt>
<dd>Loop current is the actual milliamp value flowing in the 4 to 20 mA circuit, which represents the instrument's primary variable in analog form. A HART device reports the current it intends to output, but the true loop current can only be confirmed by direct measurement, which is why documenting calibrators and tools like <a href="/">OmniBus</a> include an onboard mA measurement circuit.</dd>
</dl>

<h2>Network roles and addressing</h2>
<dl>
<dt>Primary master</dt>
<dd>The primary master is one of two host devices allowed on a HART loop at the same time, typically a permanently connected control system or asset-management host. Primary and secondary masters use different addresses so both can communicate with field devices without collision.</dd>

<dt>Secondary master</dt>
<dd>The secondary master is the second permitted host on a HART loop, usually a handheld field communicator or a temporary tool brought to the device. It coexists with the primary master, letting a technician work an instrument while the control system is still polling it.</dd>

<dt>Burst mode</dt>
<dd>Burst mode is a HART setting in which the field device repeatedly publishes a chosen message on its own, without waiting to be polled by a master. This increases the effective update rate of digital data, and it is the basis for how WirelessHART devices publish process values.</dd>

<dt>Polling address</dt>
<dd>The polling address is the short numeric address (0 through 63 in HART 7) used by a master to identify and talk to a specific device on the loop. Address 0 is used for a single device operating in analog 4 to 20 mA mode, while non-zero addresses are typically used for multidrop networks.</dd>

<dt>Multidrop</dt>
<dd>Multidrop is a HART wiring arrangement in which several devices share one pair of wires, each with a unique polling address. In multidrop mode the analog current is usually parked at a fixed low value (such as 4 mA) and all process data is exchanged digitally, since the loop can no longer represent multiple analog signals.</dd>
</dl>

<h2>Commands and variables</h2>
<dl>
<dt>Universal command</dt>
<dd>Universal commands are the set of HART commands that every compliant HART device must support, regardless of manufacturer or device type. They cover basic functions like reading the primary variable, device identity, and status, which is what makes vendor-neutral communication possible.</dd>

<dt>Common-practice command</dt>
<dd>Common-practice commands are a standardized set of HART commands that many devices implement for typical tasks such as setting the range, selecting units, or performing trims. They are not mandatory like universal commands, but they behave consistently across the many devices that support them.</dd>

<dt>Device-specific command</dt>
<dd>Device-specific commands are custom HART commands defined by a manufacturer for features unique to a particular instrument. Accessing them generally requires the device's Device Description or DTM, since their meaning is not defined by the HART standard itself.</dd>

<dt>PV / SV / TV / QV (process and device variables)</dt>
<dd>PV, SV, TV, and QV are the primary, secondary, tertiary, and quaternary variables a HART device can report. The PV is the main measurement (and the value mapped to the 4 to 20 mA loop), while SV, TV, and QV carry additional values such as sensor temperature or a second measured quantity.</dd>

<dt>Primary variable (PV)</dt>
<dd>The primary variable is the main measured value a transmitter reports and the value that drives its analog loop current. Setting the PV range determines what physical span maps to 4 to 20 mA.</dd>

<dt>Damping</dt>
<dd>Damping is a configurable time constant that smooths a device's output by filtering out rapid fluctuations and noise in the measurement. A longer damping value produces a steadier reading but a slower response to real process changes.</dd>
</dl>

<h2>Ranging and calibration terms</h2>
<dl>
<dt>Primary variable range (URV / LRV)</dt>
<dd>The primary variable range defines what part of a sensor's capability maps onto the 4 to 20 mA output. The Lower Range Value (LRV) is the measured value that produces 4 mA, and the Upper Range Value (URV) is the value that produces 20 mA. The difference between them is the calibrated span.</dd>

<dt>LRV (Lower Range Value)</dt>
<dd>The LRV is the process value assigned to the 4 mA (0 percent) end of the output. For example, a pressure transmitter ranged 0 to 100 psi has an LRV of 0 psi.</dd>

<dt>URV (Upper Range Value)</dt>
<dd>The URV is the process value assigned to the 20 mA (100 percent) end of the output. For the same 0 to 100 psi transmitter, the URV is 100 psi.</dd>

<dt>HART trim (sensor trim, D/A trim, loop current trim)</dt>
<dd>A HART trim is a digital adjustment that aligns a device's internal readings or output to a known reference, without rewiring or mechanical zeroing. Sensor trim corrects the device's reading of the measured input, while D/A trim (also called loop current trim or current output trim) corrects the actual milliamp output so it matches a precise reference ammeter at 4 mA and 20 mA.</dd>

<dt>Sensor trim</dt>
<dd>Sensor trim adjusts how a HART device interprets its physical sensor input, correcting the digital reading of the primary variable against an applied reference. It affects what the device reports as the measurement, both digitally and through the loop.</dd>

<dt>D/A trim (loop current trim)</dt>
<dd>D/A trim, also called digital-to-analog trim or loop current trim, calibrates the device's analog output stage so its actual loop current precisely matches the intended 4 mA and 20 mA points. It is verified against an accurate external mA measurement, not against the value the device reports.</dd>

<dt>Loop test</dt>
<dd>A loop test commands a HART device to drive a fixed, known current (for example 4, 12, or 20 mA) so a technician can verify the wiring and the response of every device downstream in the loop, such as the control system input. The device holds the forced value until it is released back to live measurement.</dd>

<dt>As-Found</dt>
<dd>As-Found is the recorded condition of an instrument before any adjustment is made, captured at the start of a calibration. It documents how the device was actually performing in service, which is essential evidence for quality and compliance records.</dd>

<dt>As-Left</dt>
<dd>As-Left is the recorded condition of an instrument after any trims or adjustments are complete. Comparing As-Found to As-Left proves what changed and confirms the device was left within tolerance. OmniBus captures both states automatically as a finished calibration record.</dd>

<dt>Calibration tolerance</dt>
<dd>Calibration tolerance is the maximum allowable error, usually stated as a percentage of span (for example plus or minus 0.25 percent), that determines whether a device passes or fails at each test point. A reading whose error meets or exceeds the tolerance is flagged as out of tolerance.</dd>
</dl>

<h2>Device descriptions and host tools</h2>
<dl>
<dt>DD (Device Description)</dt>
<dd>A Device Description is a manufacturer-supplied file that tells a host system how to communicate with a specific HART device, including its commands, parameters, menus, and units. It lets a host present a device's full capabilities without the host being preprogrammed for that exact model.</dd>

<dt>Device descriptor</dt>
<dd>Device descriptor is a general term for the data, such as a DD or DTM, that describes a HART device's commands and parameters to a host. Some communicators require the correct vendor descriptor to be installed before they can fully work a given instrument.</dd>

<dt>EDDL</dt>
<dd>EDDL (Electronic Device Description Language) is the standardized language used to write Device Description files. It defines device parameters, menus, and display logic in a host-independent way, so the same DD works across different compliant host systems.</dd>

<dt>DTM (Device Type Manager)</dt>
<dd>A DTM is a software component, supplied by the device manufacturer, that provides a device's configuration interface inside an FDT-based host application. It can offer richer graphics and logic than a basic DD, and it runs within an FDT frame application.</dd>

<dt>FDT</dt>
<dd>FDT (Field Device Tool) is an open standard that defines a common framework, the frame application, in which device-specific DTMs run. It lets one host application manage devices from many vendors and across multiple protocols by hosting each device's DTM.</dd>

<dt>Field communicator</dt>
<dd>A field communicator is a handheld tool a technician connects to a HART loop to read, configure, calibrate, and test instruments in the field. It typically acts as a secondary master on the loop. Universal, vendor-neutral communicators like OmniBus work across manufacturers without per-vendor descriptor licensing.</dd>
</dl>

<h2>Diagnostics, status, and safety</h2>
<dl>
<dt>NAMUR NE43</dt>
<dd>NAMUR NE43 is a recommendation that standardizes how 4 to 20 mA transmitters signal a fault by driving the loop current outside the normal measurement band. Currents at or below about 3.6 mA or at or above about 21 mA indicate a failure, so the control system can distinguish a genuine measurement from a sensor or device fault.</dd>

<dt>NE107</dt>
<dd>NAMUR NE107 is a recommendation that classifies device diagnostic status into four standardized categories: Failure, Function Check, Out of Specification, and Maintenance Required. It gives operators a consistent, vendor-neutral way to interpret the health signals a smart instrument reports.</dd>

<dt>Failure mode</dt>
<dd>Failure mode describes how a device behaves when it detects an internal fault, typically by driving its analog output to a configured fail-high or fail-low value per NAMUR NE43. The chosen failure direction tells the control system that the reading is invalid rather than a real process value.</dd>

<dt>Intrinsic safety</dt>
<dd>Intrinsic safety is a protection method for hazardous (explosive) areas that limits the electrical energy in a circuit so it cannot ignite a flammable atmosphere, even under fault conditions. HART instruments and the tools used on them are commonly rated for intrinsically safe installation in classified areas.</dd>

<dt>Smart instrument / transmitter</dt>
<dd>A smart instrument, or smart transmitter, is a field device with an onboard microprocessor that can be digitally configured, calibrated, and diagnosed, in addition to producing an analog output. HART is one of the most common protocols used to communicate with smart instruments over the existing 4 to 20 mA wiring.</dd>
</dl>

<p>Looking for more? Explore <a href="/hart/what-is-hart/">what HART is</a>, browse the <a href="/hart/faq/">HART FAQ</a>, or see how a universal, vendor-neutral HART communicator and calibration recorder captures these terms in practice at <a href="/">PragOptics OmniBus</a>.</p>
