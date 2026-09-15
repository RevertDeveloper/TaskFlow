# Git workflow

La rama estable es `main`. Las ramas de trabajo usan uno de estos prefijos:

- `feature/*` para funcionalidad nueva;
- `fix/*` para correcciones;
- `refactor/*` para cambios internos sin modificación funcional.

Los commits deben ser pequeños y trazables, con prefijos convencionales:
`feat:`, `fix:`, `test:`, `docs:`, `refactor:` o `chore:`. Cada task `TF-*`
debe dejar tests o evidencia de validación y actualizar el estado del roadmap
antes de pasar a la siguiente task.

Antes de abrir un pull request:

1. Ejecutar los checks locales documentados en el README.
2. Revisar `git diff --check` y confirmar que no hay `.env`, credenciales o
   artefactos generados.
3. Describir la task `TF-*`, la evidencia y cualquier blocker residual.

No se hacen commits gigantes que mezclen dominios ni se reescribe la historia
de ramas compartidas.