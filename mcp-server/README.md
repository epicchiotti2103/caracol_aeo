# Caracol AEO — Servidor MCP

Servidor [Model Context Protocol (MCP)](https://modelcontextprotocol.io) que expõe dados da Caracol AEO para agentes de IA.

## Instalação

```bash
cd mcp-server
npm install
```

## Uso

### Claude Desktop

Adicione ao `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "caracol-aeo": {
      "command": "node",
      "args": ["/caminho/para/caracol_aeo/mcp-server/index.js"]
    }
  }
}
```

### Cursor / VS Code

```json
{
  "mcp": {
    "servers": {
      "caracol-aeo": {
        "command": "node",
        "args": ["/caminho/para/caracol_aeo/mcp-server/index.js"]
      }
    }
  }
}
```

## Ferramentas disponíveis

| Ferramenta | Descrição |
|---|---|
| `list_blog_posts` | Lista artigos com filtragem por categoria e limite |
| `get_blog_post` | Obtém conteúdo completo de um artigo pelo slug |
| `search_posts` | Busca artigos por palavras-chave |
| `get_services` | Retorna serviços e planos com preços |
| `get_company_info` | Retorna informações completas da empresa |

## Recursos disponíveis

| Recurso | URL |
|---|---|
| Blog Posts | `https://www.aeobr.com.br/blog/posts.json` |
| Serviços | `https://www.aeobr.com.br/services.json` |
| Guia LLM | `https://www.aeobr.com.br/llms-full.txt` |

## Exemplos de uso

```
Liste os 5 artigos mais recentes sobre técnico de AEO.
→ list_blog_posts(category="tecnico", limit=5)

Busque artigos sobre Schema markup.
→ search_posts(query="schema markup")

Quais são os planos e preços da Caracol AEO?
→ get_services()
```
