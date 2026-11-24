# #78 design: what other tickets need (branch ticket/78-product-design)

- DESIGN.md (repo root) is a SEED: the "Letreiro de rua" world. Tokens in its frontmatter, light and `dark-*` pairs. Re-run `impeccable document` once the React Cartaz exists in frontend/.
- Fonts: Antonio 700 (self-hosted, and embedded in the `ui://` Cartaz resource; no external fetch in MCP Apps), body = system-ui stack. Antonio only for the marquee, position numbers and the stamp.
- Theme: light/dark via tokens; the Cartaz view must follow the Claude host theme (prefers-color-scheme or host variables, to be confirmed by #75).
- Person colors person-1..6 by Presente order (replaces T3's --chart-1..6). The cartaz.css today depends on T3 theme vars (--foreground, --card, --chart-n...); the port must swap them for these tokens.
- Prototype: prototypes/cartaz.prototype.html (phone, fixture data). Surface brief: .impeccable/surfaces/prototypes-cartaz-prototype-html.md.
- impeccable skill lives at /var/www/html/pesquisa-relacionamentos/.claude/skills/impeccable (not in the Skill list); run its scripts from the filmes worktree.
