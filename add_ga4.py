#!/usr/bin/env python3
"""
Injeta snippet do Google Analytics 4 (G-4282EKRBJD) em todos os arquivos .html do repo.

- Idempotente: detecta se o GA já tá instalado e pula.
- Insere o snippet logo antes de </head>.
- Ignora .git, node_modules e qualquer diretório que comece com '.'.

Uso:
    python3 add_ga4.py
"""
from pathlib import Path

GA_ID = "G-4282EKRBJD"

SNIPPET = f"""<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id={GA_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());
  gtag('config', '{GA_ID}');
</script>
"""

IGNORE_DIRS = {"node_modules", ".git", ".github", "mcp-server-py", "mcp-server"}


def should_skip_path(path: Path) -> bool:
    """Pula arquivos em diretórios ocultos, node_modules, .git, ou MCP servers."""
    return any(part in IGNORE_DIRS or part.startswith(".") for part in path.parts)


def main() -> None:
    added = skipped = no_head = 0
    skipped_files: list[str] = []
    no_head_files: list[str] = []

    for html_file in Path(".").rglob("*.html"):
        if should_skip_path(html_file):
            continue

        content = html_file.read_text(encoding="utf-8")

        # Idempotência: já tem GA?
        if "gtag/js" in content or "googletagmanager.com" in content:
            print(f"⏭️  SKIP (já tem GA): {html_file}")
            skipped_files.append(str(html_file))
            skipped += 1
            continue

        # Precisa ter </head> pra saber onde injetar
        if "</head>" not in content:
            print(f"⚠️  SEM </head>: {html_file}")
            no_head_files.append(str(html_file))
            no_head += 1
            continue

        # Injeta antes do primeiro </head>
        new_content = content.replace("</head>", f"{SNIPPET}</head>", 1)
        html_file.write_text(new_content, encoding="utf-8")
        print(f"✅ ADD:  {html_file}")
        added += 1

    print("\n" + "=" * 50)
    print(f"📊 Resumo:")
    print(f"   ✅ {added} arquivos com GA4 adicionado")
    print(f"   ⏭️  {skipped} já tinham GA (pulados)")
    print(f"   ⚠️  {no_head} sem </head> (pulados)")
    print("=" * 50)

    if no_head_files:
        print("\n⚠️  Arquivos sem </head> (revisar manualmente):")
        for f in no_head_files:
            print(f"   - {f}")


if __name__ == "__main__":
    main()
