# Graph view (`/graph`) — v1.1

An interactive, client-side rendering of the asset hierarchy using [Cytoscape.js](https://js.cytoscape.org/). Read-only.

## What it does

- Fetches the full graph in one request from `GET /api/graph`.
- Renders every asset as a node and every parent-child relationship as a directed edge (parent → child).
- Lets the user pan and zoom, switch between three layouts (dagre, breadth-first, cose), and click any node to open its detail page.
- Highlights a node's neighbourhood on hover by fading everything else.

The Cytoscape instance is mounted only after the data fetch resolves (it's client-only — no SSR).

## Cytoscape element format

`/api/graph` returns this shape:

```json
{
  "nodes": [
    { "data": { "id": "<uuid>", "tag": "P-101A", "name": "...", "class": "PUMP-CENTRIFUGAL", "criticality": 2, "lifecycle": "operating" } }
  ],
  "edges": [
    { "data": { "id": "contains-<parent_uuid>-<child_uuid>", "source": "<parent_uuid>", "target": "<child_uuid>", "rel_type": "contains" } }
  ]
}
```

- `data.id` is the only required field on a node — Cytoscape uses it to wire edges.
- `data.source` and `data.target` on an edge are node IDs.
- Edge IDs are deterministic (`contains-{source}-{target}`) so refetching produces stable elements.
- `class` (not `class_code`) matches the conventional Cytoscape attribute name used in the stylesheet selectors.

## Styling → asset attributes

The full stylesheet is the `STYLESHEET` constant in [`src/routes/graph/+page.svelte`](../src/routes/graph/+page.svelte). It's defined once, not per-node.

| Asset attribute       | Visual                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `class` (structural)  | `round-rectangle` shape (SITE, AREA, SYSTEM)                                                    |
| `class` (equipment)   | `ellipse` shape (everything else)                                                               |
| `class` value         | Fill colour from the `CLASS_FILL` map; unknown classes fall back to `CLASS_FILL_DEFAULT` (gray) |
| `criticality`         | Border width: 1–2 → 1px, 3 → 2px, 4–5 → 3px, null → 1px                                         |
| `lifecycle`           | `shutdown` and `decommissioned` → opacity 0.5; everything else → 1.0                            |
| selected node         | Orange border (`#e07a3d`), 3px                                                                  |
| `.faded` class        | Opacity 0.25 — applied to non-neighbours during hover                                           |

## Adding a new class to the colour mapping

1. Open [`src/routes/graph/+page.svelte`](../src/routes/graph/+page.svelte).
2. Add an entry to `CLASS_FILL` (e.g. `'MOTOR-INDUCTION': '#f0c674'`).
3. If you want the class in the legend, add an entry to `LEGEND`.
4. If the class should render as a structural box rather than an ellipse, add the value to `STRUCTURAL`.

The shape selector function reads `STRUCTURAL` and the fill function reads `CLASS_FILL`, so no other changes are needed.

## v2 outlook

This is the v1.1 increment. The graph currently shows only `contains` edges derived from `asset.parent_id`. In v2, when typed relationships land via a dedicated `asset_relationship` table (`drives`, `feeds`, `connectedTo`, …), the API will return one edge per relationship row and the stylesheet will gain selectors keyed off `data(rel_type)`.
