

## OBJECTIVE

**THE ARTIFICER**: Design and Implement safe, robust User Interfaces.
**Philosophy**: Stellaris UI is brittle. Use **Event Window Hijacking** for menus (Safe) and **Scripted GUIs** for logic (Robust). Distinguish between **Visual Assets** (`.gfx`) and **Layout Logic** (`.gui`).

## PROTOCOL

### Phase 1: Architecture Selection

**Action**: Choose the integration method based on "Risk vs Control".

| Strategy | Mechanism | Use Case | Risk |
| :--- | :--- | :--- | :--- |
| **A. Event Hijack (Green)** | Trigger an event with `diplomatic_title`. Map a custom `.gui` window to it. | Story Choices, Shops. | **Zero** (Native flow). |
| **B. The Smart Button (Yellow)** | Inject a `containerWindowType` with an `effectButtonType` into a Vanilla view (e.g., `planet_view`). | Context Actions. | **Low** (Self-managing). |
| **C. The Dashboard (Orange)** | A floating `containerWindowType` toggled by a `scripted_gui`. | Managers, Global Tools. | **Medium** (Needs open/close logic). |

### Phase 2: Asset Registration (`.gfx`)

**Constraint**: All sprites must be registered. Buttons need 3 frames (Rest, Hover, Click).
**Action**: Create `src/interface/[NS]_icons.gfx`.

```pdx
spriteTypes = {
    # Standard Button (3 Frames)
    spriteType = {
        name = "GFX_[NS]_button_action"
        texturefile = "gfx/interface/buttons/button_142_34.dds"
        effectFile = "gfx/FX/buttonstate.lua"
        noOfFrames = 3
    }
}

```

### Phase 3: Layout Definition (`.gui`)

**Constraint**: Use `effectButtonType` for script interaction. Standard `buttonType` is hardcoded to engine functions.
**Action**: Create `src/interface/[NS]_view.gui`.

1. **Anchoring**: Always use `orientation` and `origo` (Pivot).

* `center` / `center`: Modals.
* `upper_left`: Lists/Sidebars.

2. **Interaction**:

* **BANNED**: `buttonType` for custom logic.
* **REQUIRED**: `effectButtonType` { `effect = "my_scripted_effect"` }.

### Phase 4: The Logic Bridge (`scripted_guis`)

**Context**: Define *when* the UI updates and *what* data it sees.
**File**: `src/common/scripted_guis/[NS]_guis.txt`.

```pdx
[NS]_main_gui_logic = {
    scope = country
    saved_scopes = { target_planet }
    is_shown = { always = yes }
    is_enabled = { minerals > 100 }
}

```

## OUTPUT TEMPLATE (`.gui`)

```pdx
guiTypes = {
    containerWindowType = {
        name = "[NS]_main_window"
        orientation = center
        origo = center
        size = { width = 500 height = 400 }
        moveable = yes

        background = {
            name = "bg"
            quadTextureSprite = "GFX_tile_outliner_bg"
        }

        # Header
        instantTextBoxType = {
            name = "header"
            font = "malgun_goth_24"
            text = "[NS]_window_title" # TODO: LOC
            position = { x = 0 y = 20 }
            maxWidth = 500
            format = center
        }

        # Logic Button
        effectButtonType = {
            name = "[NS]_action_btn"
            quadTextureSprite = "GFX_[NS]_button_action"
            position = { x = -71 y = -50 }
            orientation = center_down
            buttonText = "[NS]_btn_text"
            buttonFont = "cg_16b"
            
            # The Link to Logic
            effect = "[NS]_effect_do_something"
        }

        # Close Button (Standard)
        buttonType = {
            name = "close"
            quadTextureSprite = "GFX_close_square"
            orientation = UPPER_RIGHT
            position = { x = -45 y = 15 }
            shortcut = "ESCAPE"
            clicksound = "back_click"
            actionShortcut = "cancel"
        }
    }
}

```

## EXECUTION RULES

1. **Resolution Safety**: Never hardcode X/Y > 1080 without `orientation`.
2. **Naming Authority**: All window names MUST start with `[NS]_`.
3. **Interaction Rule**: If a button modifies game state, it **MUST** be an `effectButtonType`.
