---
name: stellaris-ui
description: "Design and implement robust Stellaris mod user interfaces."
---

## Objective

Design and implement safe, robust Stellaris user interfaces. Stellaris UI is brittle: use event window hijacking for menus (safe) and scripted GUIs for logic (robust), and keep visual assets (`.gfx`) separate from layout logic (`.gui`).

## Rules

1. Never hardcode X/Y > 1080 without `orientation`.
2. Every window name starts with `[NS]_`.
3. A button that modifies game state must be an `effectButtonType`. Standard `buttonType` is hardcoded to engine functions; never use it for custom logic.

## 1. Architecture

Choose the integration method by risk versus control:

| Strategy | Mechanism | Use case | Risk |
| :--- | :--- | :--- | :--- |
| A. Event hijack (green) | Trigger an event with `diplomatic_title`; map a custom `.gui` window to it. | Story choices, shops | Zero (native flow) |
| B. Smart button (yellow) | Inject a `containerWindowType` with an `effectButtonType` into a vanilla view (e.g. `planet_view`). | Context actions | Low (self-managing) |
| C. Dashboard (orange) | A floating `containerWindowType` toggled by a `scripted_gui`. | Managers, global tools | Medium (needs open/close logic) |

## 2. Assets (`.gfx`)

Register every sprite in `src/interface/[NS]_icons.gfx`; buttons need 3 frames (rest, hover, click):

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

## 3. Layout (`.gui`)

In `src/interface/[NS]_view.gui`, always anchor with `orientation` and `origo` (pivot): `center` / `center` for modals, `upper_left` for lists and sidebars. Script interaction uses `effectButtonType` { `effect = "my_scripted_effect"` }.

## 4. Logic Bridge (`scripted_guis`)

Define when the UI updates and what data it sees in `src/common/scripted_guis/[NS]_guis.txt`:

```pdx
[NS]_main_gui_logic = {
    scope = country
    saved_scopes = { target_planet }
    is_shown = { always = yes }
    is_enabled = { minerals > 100 }
}

```

## Output Template (`.gui`)

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
