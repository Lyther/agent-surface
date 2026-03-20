## OBJECTIVE

**THE GLASS COCKPIT.**
You are building the Interface between Carbon (User) and Silicon (Logic).
This is NOT just "HTML". This is an Event-Driven, State-Managed, Async Application running in a hostile environment (The Browser).
**Constraint**: You must respect the **Stack Decision** from `01-ARCH`. Approved UI stacks: **Rust (Leptos)** or **Python (Reflex)**. JS/TS/CSS/HTML raw assets are disallowed except minimal interop shims.
**Goal**: High Performance, Accessibility (A11y), Observability, and Multi-Device Fluidity.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*UI code is verbose. Don't read the whole tree.*

1. **Isolation**:
    - When building `Button`, do NOT read `App.rs`.
    - **Prompt**: "Show me the `Button` requirements and theme tokens."
2. **Visual Context**:
    - If possible, reference a screenshot or wireframe (text description).

## VIBE CODING INTEGRATION

UI is **highly iterative** — perfect for vibe coding:

```text
sketch idea → spec (test) → component → visual check → iterate
```

**Key**: Keep components small. Single-purpose. No god-components.

## PROTOCOL

### Phase 1: Architecture Alignment (The Stack Check)

*Before writing a pixel, know where you exist.*

1. **Check Stack**: Read `docs/architecture.md` + `Cargo.toml` / `pyproject.toml`.
2. **Check Boundary (Crucial)**:
    - **Client-Side**: Fetch via API endpoints (`arch-api`). **NEVER** import DB drivers.
    - **Data Shapes**: Use types from `arch-model` (or equivalent shared types).
    - **Server-Side (SSR)**: Fetch data in server context; serialize to client.
    - **Interop**: JS/TS allowed only for FFI shims; keep tiny and vendored.

### Phase 2: State Topology (The Brain)

*Where does the data live?*

1. **Local State**: UI transients (isDropdownOpen). Use signals/state primitives.
2. **Server State**: Async data. Use framework resources (Leptos Resources / Reflex State).
    - *Why?* Caching, deduping, revalidation are hard; use the framework.
3. **Global State**: App-wide config (Theme, Auth). Use Context/Signals. Avoid prop drilling (> 2 levels).

### Phase 3: The View Implementation (Atomic & Multi-Device)

*Implement the visual layer.*

1. **Atomic Design**:
    - **Atom** (Button) → **Molecule** (SearchField) → **Organism** (Header)
    - Keep Atoms dumb; Organisms coordinate.
2. **Responsiveness**:
    - **Mobile First**
    - **Breakpoints**: Defined tiers (`sm`, `md`, `lg`)
    - **Touch Targets**: Min 44x44px
3. **Accessibility (WCAG 2.2)**:
    - Focus management; keyboard nav; visible focus ring
    - Semantic elements; ARIA only when needed
    - Color contrast ≥ 4.5:1 for text

### Phase 4: Debuggability & Observability (The Helper)

*Help the human debug your mess.*

1. **Dev Hooks**:
    - Add `data-component="LoginForm"` to root
    - Testing selectors: `data-testid="submit-btn"`
2. **Error Boundaries**:
    - Wrap data-fetchers; prevent app-wide crashes

### Phase 5: Performance Hygiene

1. **Avoid Over-Rendering**: Fine-grained reactivity (signals/memos)
2. **Network**: Debounce/throttle high-frequency actions
3. **Assets**: No inline large assets; lazy-load heavy UI chunks
4. **Latency**: Optimistic UI where safe; show skeletons/spinners

## OUTPUT FORMAT

**Scenario: Rust (Leptos) - Signal Based**

```rust
// src/components/login_form.rs
use leptos::*;
use crate::api::auth::login; // Defined in endpoint

#[component]
pub fn LoginForm() -> impl IntoView {
    // 1. State (Signals)
    let (email, set_email) = create_signal(String::new());
    let (loading, set_loading) = create_signal(false);

    // 2. Handler (Async Action)
    let on_submit = create_action(move |_| async move {
        set_loading.set(true);
        let result = login(email.get()).await; // API Call
        set_loading.set(false);
        result
    });

    // 3. View (Macro)
    view! {
        // data-component for DevTools
        <form on:submit=on_submit data-component="LoginForm" class="p-4 space-y-4">
            <label for="email" class="sr-only">Email</label>
            <input
                type="email"
                id="email"
                // Two-way binding
                on:input=move |ev| set_email.set(event_target_value(&ev))
                prop:value=email
                class="input-field"
            />
            <button type="submit" disabled=loading class="btn-primary">
                <Show when=move || loading.get() fallback=|| "Sign In">
                    "Loading..."
                </Show>
            </button>
        </form>
    }
}
```

## EXECUTION RULES

1. **NO RAW WEB ASSETS**: No raw JS/TS/CSS/HTML except interop shims.
2. **NO MAGIC Z-INDEX**: Use a defined stacking context.
3. **CONSOLE HYGIENE**: No `console.log` in production; use structured logs or remove.
4. **COMPOSITION OVER INHERITANCE**: Prefer composition; avoid boolean prop explosions.
5. **HANDLE ALL ASYNC STATES**: loading, error, empty, success.

## AI GUARDRAILS

| ⛔ Banned | ✅ Required |
|----------|-------------|
| Inline styles for layout | Utility classes/tokens |
| `any` in props | Explicit prop types |
| Fetching in render | Data resources/actions |
| Hardcoded strings | i18n keys/constants |
| Giant components (>150 lines) | Split into smaller components |
| Ignoring a11y | Keyboard + screen reader friendly |
