# Caracol AEO — Servidor MCP (Python / FastMCP)

Servidor MCP em FastMCP com transporte **Streamable HTTP** (padrão atual do ecossistema, substitui stdio para deploy público).

## Tool principal

**`auditar_site_aeo(url)`** — Diagnóstico AEO 0-100 de qualquer site:
- Schema.org JSON-LD detectado e tipos
- Meta tags (title, description, canonical, Open Graph, lang)
- Conteúdo (H1/H2, contagem de palavras, definition-lead detection)
- Técnico (robots.txt para GPTBot/ClaudeBot/PerplexityBot/Google-Extended/Applebot-Extended, sitemap, Last-Modified)
- Recomendações priorizadas (alta/média/baixa)

## Tools de catálogo

`list_blog_posts`, `get_blog_post`, `search_posts`, `get_services`, `get_company_info`.

## Setup local

```bash
cd mcp-server-py
uv pip install -e .
# ou: pip install -e .

# Streamable HTTP (padrão, :8000/mcp)
python server.py

# stdio (apenas dev local com Claude Desktop)
python server.py stdio
```

## Deploy público

Recomendado em `mcp.aeobr.com.br`:

```bash
# Cloud Run / Fly.io / Railway
docker run -p 8000:8000 caracol-aeo-mcp
```

CORS, OAuth 2.1 e rate limiting devem ser configurados na camada de proxy (Cloudflare, Caddy, nginx) antes de expor o `/mcp`.

## Conexão pelo cliente (Claude.ai, ChatGPT Apps, Cursor)

```json
{
  "mcpServers": {
    "caracol-aeo": {
      "url": "https://mcp.aeobr.com.br/mcp"
    }
  }
}
```

Sem instalação local. Sem configurar paths. Um clique.

## Próximos passos (não implementados)

- OAuth 2.1 com discovery em `/.well-known/oauth-authorization-server`
- Rate limiting por IP em `auditar_site_aeo`
- Cache da auditoria por URL (TTL 1h)
- Embeddings para `search_posts` (substituir TF puro)
