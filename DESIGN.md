---
name: Theimposterissus station interface
description: Clear crew operations within the established Hollow station identity
colors:
  primary: '#e6a65a'
  station: '#182124'
  surface: '#202c30'
  text: '#dde6e4'
  muted: '#a6b6b7'
  line: '#425358'
rounded:
  control: '6px'
  surface: '12px'
spacing:
  small: '8px'
  medium: '16px'
  large: '24px'
typography:
  body:
    fontFamily: 'Trebuchet MS, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.station}'
    rounded: '{rounded.control}'
    padding: '12px 20px'
---

# Theimposterissus interface direction

## Overview

The station palette and original engineer art remain the visual foundation. Redesign the entry and waiting-room composition, not the game's identity. This is a task-focused interface used on personal screens while friends organize a game; legible dark station surfaces keep it consistent with gameplay.

## Colors

Restrained station neutrals with amber primary actions, mint success and coral errors. Incumbent source values are in packages/client/src/style.css: background #182124, raised surface #202c30, text #dde6e4, muted text #a6b6b7, line #425358 and action #e6a65a. These are reference values, not a new palette.

## Typography

Retain the Trebuchet MS/system sans-serif language. Headings should clearly establish the current task, with room codes distinguished as codes rather than decorative technical text.

## Layout

Content-led composition with one primary task at a time. The main container caps at 1120px, with 24px page gutters (16px at 600px and below). Entry caps at 520px. Lobby columns use a 1.3:1 ratio and collapse at 600px. Essential controls precede optional native disclosures. The approved entry composition is recorded in docs/design/entry-redesign.md.

## Elevation & Depth

Station surfaces and restrained borders communicate grouping. Keep the game artwork distinct from operable controls.

## Shapes

Preserve softly squared controls and original engineer silhouettes. Controls must remain recognizable, labelled and usable by touch.

## Components

Buttons and inputs have a 48px minimum height. Amber marks primary actions; transparent secondary controls use station-line borders. Focus uses a 2px amber outline offset by 4px. Buttons transition background and border for 160ms; reduced motion removes transitions.

Create/Join mode buttons use explicit pressed states, an amber border and amber text for selection. A single submit button follows the selected mode. Loading disables entry controls and labels the action Connecting. Errors use coral text in a live status region.

Native details keep optional colour, profile and settings controls accessible without filling the initial view. Colour choices always include names and numbers; mint readiness also has a text label. Tonal surface groups have no shadow.

## Do's and Don'ts

- Do preserve native form semantics, visible focus and reduced-motion alternatives.
- Do use named/numbered colours alongside swatches.
- Do not turn the entry flow into a settings dashboard or require cosmetic choices before joining.
- Do not imply a game has started when the user has only created a lobby.
