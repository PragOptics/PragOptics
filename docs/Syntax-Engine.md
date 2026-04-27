# Syntax Engine & Visual Language

The PragOptics API Console includes a purpose-built **syntax engine** designed to improve readability and reduce cognitive load when composing and inspecting JSON requests and responses.

The syntax system is not intended to enforce strict language rules or act as a validator. Instead, it uses a consistent **visual language** to help users understand structure, nesting, and data types at a glance.

---

## Design Goals

The syntax engine is designed to:

- Make deeply nested structures easier to read
- Clearly separate structure from values
- Visually distinguish data types without overwhelming contrast
- Keep editing fast and low-friction

The emphasis is on **clarity through color and spacing**, not on restricting input.

---

## Brace & Nesting Color Rotation

Nested objects and arrays are visually distinguished using **rotating brace colors**.

Each nesting level is assigned a different accent color. As structures become deeper, brace colors cycle in a predictable sequence. This allows users to:

- Track the start and end of nested objects quickly
- Understand scope without counting indentation or brackets
- Identify mismatched or unbalanced braces more easily

The rotation is purely visual; it does not affect the underlying payload.

---

## Data Type Color Coordination

Each JSON data type is assigned a distinct color treatment. This makes payloads easier to scan and reduces ambiguity while editing.

### Syntax Color Legend

 **Object / Array Braces**  
  Color-rotated accents by nesting level

 ![syntax](https://img.shields.io/badge/Property-Name-7fcdec?style=flat-square&labelColor=7fcdec)  
  *Consistent accent color to distinguish structure from values*

 ![syntax](https://img.shields.io/badge/String-Values-ec9345?style=flat-square&labelColor=ec9345)   
   *Soft, high-contrast tone to emphasize textual content*

 ![syntax](https://img.shields.io/badge/Numeric-Values-85e29a?style=flat-square&labelColor=85e29a) 
  *Distinct numerical color for immediate recognition*

 ![syntax](https://img.shields.io/badge/Boolean-Values-fa79e9?style=flat-square&labelColor=fa79e9)  
  *Unified boolean color to avoid confusion with strings*

 ![syntax](https://img.shields.io/badge/Null-Values-ffdd1d?style=flat-square&labelColor=ffdd1d)  
  *High Visibility color to indicate absence of value*

 ![syntax](https://img.shields.io/badge/Punctation-Separators-c6d0f0?style=flat-square&labelColor=c6d0f0)  
  *High Visibility color to indicate absence of value*

This coordination ensures that structure remains visible without distracting from the actual data.

### Example JSON Payload

The following example demonstrates all supported JSON token types as rendered by the syntax engine.

![JSON Example](/images/syntax-nested.png)

---

## Editing Experience

The syntax engine is designed to remain helpful **while editing**, not only after payloads are complete.

![JSON Example](/images/syntax-building.png)


As users type:

- Incomplete structures remain readable
- Nested scopes remain visually traceable
- Data types are immediately recognizable

This supports iterative editing and experimentation without forcing full completion of the payload.

![JSON Example](/images/syntax-error.png)

---

## Relationship to Response Rendering

The same visual language principles used in the syntax engine inform the **Visual View** of responses.

This consistency allows users to move smoothly between:

- Writing a request payload
- Executing the request
- Inspecting the response

Without needing to mentally re-parse structure or formatting.

---

## Intentional Constraints

The syntax engine intentionally avoids:

- Aggressive validation
- Automatic reformatting
- Opinionated schema enforcement

Those concerns are handled at the API layer or by external tooling. The console’s goal is to remain a **transparent and predictable workspace**.

---

## Summary

The PragOptics syntax engine uses color, spacing, and controlled visual hierarchy to make JSON payloads easier to understand and safer to work with.

It is designed to support both quick inspection and more complex, deeply nested request construction—without adding friction or obscuring intent.
