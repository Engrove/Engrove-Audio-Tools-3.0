# Engrove Shared UI

This folder contains the public UI foundation for Engrove Audio Tools 3.0.

## Stylesheet entrypoint

Import once from the application entry:

```ts
import './shared/ui/styles/base.css';
```

## Theme

Use `data-theme` on the root element:

```html
<html data-theme="dark">
<html data-theme="light">
```

Dark is the default.

## Density

Use `.compact-theme` on the root element for compact UI density:

```html
<body class="compact-theme">
```

Comfortable density is default.

## Component class naming

Shared public components use the `ea-` prefix:

- `.ea-button`
- `.ea-input`
- `.ea-select`
- `.ea-panel`
- `.ea-card`
- `.ea-tabs`
- `.ea-tab`
- `.ea-badge`
- `.ea-table`
