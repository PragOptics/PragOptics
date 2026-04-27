# PragOptics™ API Console

The **PragOptics API Console** is an interactive execution environment for issuing, inspecting, and understanding API requests.

It serves two primary roles:

- A first-class interface for exploring PragOptics platform APIs  
- A general-purpose JSON API terminal that can be used **without signing in**

The console is intentionally designed to make live API interaction **observable, deliberate, and understandable**.

---

## Purpose of the API Console

The API Console exists to:

- Provide a clear and observable way to interact with APIs
- Reduce friction when learning request shapes and payload formats
  - see **Syntax Engine** in Information for more details
- Make request and response behavior easy to reason about
- Serve as both a PragOptics API client and a general-purpose JSON terminal

**This is not a mock interface and does not simulate responses.**

---

## Global vs Platform Execution

The console operates in two broad modes.

### Global Execution Mode (Unauthenticated) 
![JSON Example](/images/toggle-global.png)

Global execution allows the console to be used **without signing in**.

In this mode:

- Requests can be sent to non‑PragOptics APIs
- The payload editor remains JSON-focused (application/json)
- Payloads are syntax-assisted for clarity while composing requests
- Responses are rendered using the same viewer system
- No subscription or authentication is required

Global execution does **not** bypass platform security. PragOptics endpoints that require authentication remain gated.

---

### PragOptics Platform Execution (Authenticated)
![JSON Example](/images/toggle-prag.png)

When interacting with PragOptics APIs:

- Most platform endpoints are gated behind authentication
- Access is scoped by role and subscription level
- Certain endpoints (such as authentication) are intentionally available without signing in

This document remains high-level; specific endpoint access and gating is covered elsewhere.

---

## Authentication Status Indicator

The console includes a persistent **status indicator** in the upper-right of the console header that reflects authentication state.

🟣 Not signed in
![JSON Example](/images/status-unsigned.png)
🟢 Signed in
![JSON Example](/images/status-signed.png)  

The indicator is always visible to remove ambiguity about whether platform‑gated calls can be executed.

---

## Request Methods

The API Console supports:

- **GET**
- **POST**
- **PUT**
- **PULL**
- **DELETE**

The editor and request surface adapt based on the selected method.

---

## Payload Editor & Syntax Assistance

The request payload editor includes a custom **syntax engine** designed to assist with composing JSON payloads.

The UX goals are:

- Make keys/fields visually distinct from values
- Differentiate strings, numbers, and booleans at a glance
- Keep structural characters (braces, brackets, commas) visually quiet
- Make malformed or incomplete structures easier to spot

This system is optimized for clarity and speed while composing payloads.

---

## Response Viewer Modes

Each request produces a response that can be inspected in two modes.

### Visual View

The **Visual View** renders API responses using structured presentation layers designed for readability and context.

There are two visual rendering paths depending on the request target:

- **Default Visual Rendering**
  All responses, including global requests and non-specialized endpoints, are rendered using a consistent, generic visual formatter.
  This formatter preserves structure, grouping, and hierarchy without assuming any platform-specific semantics.

- **PragOptics-Aware Visual Rendering**
  Responses from PragOptics APIs may be rendered using custom, schema-aware visualizations.
  These enhanced views provide richer structure, contextual grouping, and platform-specific visual cues where applicable.

In both cases:

- Nested data is grouped clearly
- Hierarchical relationships remain easy to follow
- Important response fields are easier to locate at a glance

The Visual View prioritizes comprehension and inspection while preserving the underlying response data exactly as returned.

### Raw View

Raw view shows the response payload exactly as returned by the API.

Raw view is useful for:

- Copying response payloads into external tools
- Verifying exact shapes and field names
- Comparing responses between executions

Users can switch between Visual and Raw without re-executing the request.

---

## Execution Control & Intentionality

Requests are executed intentionally.

The console is designed so that:

- Payloads can be reviewed before execution
- Accidental submissions are avoided
- Replays are explicit

This supports safe experimentation and clear debugging.

---

## Who the API Console Is For

The PragOptics API Console is useful for:

- Developers integrating with PragOptics APIs
- Partners validating request and response shapes
- Architects inspecting platform behavior
- Users learning the platform interactively
- Anyone needing a lightweight JSON request terminal

---

## A Deliberate Design

The console emphasizes:

- Visibility over abstraction
- Explicit execution over automatic behavior
- Structured payload composition over free-form input

These choices align with the broader PragOptics platform philosophy.

---

## Ongoing Evolution

The API Console will continue to evolve.

Potential future enhancements include:

- Additional request methods
- Expanded diagnostics and metadata
- Saved request presets
- More advanced response inspection tools

Despite ongoing iteration, the core goal remains unchanged:

**Make live API interaction clear, controlled, and understandable.**

---

_This document describes the current high-level behavior of the PragOptics™ API Console. Specific endpoint semantics and access rules are documented separately._
