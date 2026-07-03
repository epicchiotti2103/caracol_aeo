"""Caracol AEO — Servidor MCP em FastMCP com transporte Streamable HTTP.

Tool principal: `auditar_site_aeo` — gera diagnóstico AEO 0-100 de qualquer URL.
Tools de catálogo: list_blog_posts, get_blog_post, search_posts, get_services, get_company_info.

Deploy: `python server.py` (sobe em :8000 com /mcp endpoint Streamable HTTP).
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from mcp.server.fastmcp import FastMCP

BASE_URL = "https://www.aeobr.com.br"
AI_BOTS = ("GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "Applebot-Extended")
HTTP = httpx.AsyncClient(timeout=15.0, follow_redirects=True, headers={"User-Agent": "CaracolAEO-MCP/1.0"})

mcp = FastMCP(
    "caracol-aeo",
    instructions=(
        "Servidor MCP da Caracol AEO. Use `auditar_site_aeo(url)` para diagnóstico técnico "
        "de qualquer site (Schema, meta tags, robots.txt, estrutura). Use as demais tools "
        "para consultar conteúdo, serviços e informações da empresa."
    ),
)


# ── auditoria AEO ─────────────────────────────────────────────────────────────


@mcp.tool()
async def auditar_site_aeo(url: str) -> dict[str, Any]:
    """Gera diagnóstico AEO de qualquer site: score 0-100 com análise de Schema.org,
    meta tags, robots.txt para bots de IA e estrutura de conteúdo. Retorna pontuação
    por dimensão e recomendações priorizadas.
    """
    parsed = urlparse(url if "://" in url else f"https://{url}")
    if not parsed.netloc:
        return {"error": "URL inválida", "url": url}

    base = f"{parsed.scheme}://{parsed.netloc}"
    target = f"{base}{parsed.path or '/'}"

    try:
        page = await HTTP.get(target)
        page.raise_for_status()
    except httpx.HTTPError as e:
        return {"error": f"Falha ao buscar URL: {e}", "url": target}

    soup = BeautifulSoup(page.text, "html.parser")

    schema = _audit_schema(soup)
    meta = _audit_meta(soup)
    content = _audit_content(soup)
    technical = await _audit_technical(base, page.headers)

    score = schema["score"] + meta["score"] + content["score"] + technical["score"]
    recommendations = [r for d in (schema, meta, content, technical) for r in d["recommendations"]]
    recommendations.sort(key=lambda r: {"alta": 0, "media": 1, "baixa": 2}[r["prioridade"]])

    return {
        "url": target,
        "score": score,
        "max_score": 100,
        "rating": _rating(score),
        "dimensoes": {
            "schema_org": schema,
            "meta_tags": meta,
            "conteudo_estrutura": content,
            "tecnico_crawlability": technical,
        },
        "recomendacoes_priorizadas": recommendations[:10],
        "powered_by": "Caracol AEO — https://www.aeobr.com.br",
    }


def _rating(score: int) -> str:
    if score >= 80: return "Excelente"
    if score >= 60: return "Bom"
    if score >= 40: return "Regular"
    if score >= 20: return "Ruim"
    return "Crítico"


def _audit_schema(soup: BeautifulSoup) -> dict[str, Any]:
    blocks = soup.find_all("script", type="application/ld+json")
    types = []
    for b in blocks:
        text = b.string or ""
        types.extend(re.findall(r'"@type"\s*:\s*"([^"]+)"', text))

    has_org = any(t in ("Organization", "LocalBusiness", "ProfessionalService") for t in types)
    has_faq = "FAQPage" in types
    has_article = any(t in ("Article", "BlogPosting", "NewsArticle") for t in types)
    has_breadcrumb = "BreadcrumbList" in types

    score = sum([has_org * 8, has_faq * 6, has_article * 6, has_breadcrumb * 5]) or (len(types) > 0) * 3
    score = min(score, 25)

    recs = []
    if not blocks:
        recs.append({"prioridade": "alta", "dimensao": "schema", "acao": "Adicionar Schema.org JSON-LD na página (ausente)"})
    if not has_org:
        recs.append({"prioridade": "alta", "dimensao": "schema", "acao": "Adicionar Schema Organization ou LocalBusiness com @id e sameAs"})
    if not has_faq and soup.find_all(string=re.compile(r"\?")):
        recs.append({"prioridade": "media", "dimensao": "schema", "acao": "Marcar FAQs com FAQPage schema (você tem perguntas no conteúdo)"})

    return {
        "score": score, "max": 25,
        "tipos_detectados": list(set(types)) or [],
        "recommendations": recs,
    }


def _audit_meta(soup: BeautifulSoup) -> dict[str, Any]:
    title = (soup.title.string or "").strip() if soup.title else ""
    desc_tag = soup.find("meta", attrs={"name": "description"})
    desc = (desc_tag.get("content", "") if desc_tag else "").strip()
    canonical = soup.find("link", rel="canonical")
    og_title = soup.find("meta", property="og:title")
    og_desc = soup.find("meta", property="og:description")
    og_image = soup.find("meta", property="og:image")
    lang = soup.html.get("lang") if soup.html else None

    score = 0
    score += 5 if 10 <= len(title) <= 70 else (2 if title else 0)
    score += 5 if 50 <= len(desc) <= 165 else (2 if desc else 0)
    score += 3 if canonical else 0
    score += 4 if (og_title and og_desc and og_image) else (2 if og_title else 0)
    score += 3 if lang else 0

    recs = []
    if not title: recs.append({"prioridade": "alta", "dimensao": "meta", "acao": "Adicionar <title> à página"})
    elif not (10 <= len(title) <= 70): recs.append({"prioridade": "media", "dimensao": "meta", "acao": f"Title com {len(title)} chars — ideal 10-70"})
    if not desc: recs.append({"prioridade": "alta", "dimensao": "meta", "acao": "Adicionar meta description"})
    elif not (50 <= len(desc) <= 165): recs.append({"prioridade": "media", "dimensao": "meta", "acao": f"Meta description com {len(desc)} chars — ideal 50-165"})
    if not canonical: recs.append({"prioridade": "media", "dimensao": "meta", "acao": "Adicionar <link rel='canonical'>"})
    if not (og_title and og_desc and og_image): recs.append({"prioridade": "media", "dimensao": "meta", "acao": "Completar Open Graph tags (og:title, og:description, og:image)"})
    if not lang: recs.append({"prioridade": "baixa", "dimensao": "meta", "acao": "Definir atributo lang no <html>"})

    return {
        "score": score, "max": 20,
        "title": title[:120], "title_length": len(title),
        "description_length": len(desc),
        "canonical": bool(canonical), "open_graph_completo": bool(og_title and og_desc and og_image),
        "recommendations": recs,
    }


def _audit_content(soup: BeautifulSoup) -> dict[str, Any]:
    h1s = soup.find_all("h1")
    h2s = soup.find_all("h2")
    paragraphs = soup.find_all("p")
    text = soup.get_text(" ", strip=True)
    word_count = len(text.split())

    # separador " " preserva espaços entre elementos inline (<code>, <strong>...)
    first_p = (paragraphs[0].get_text(" ", strip=True) if paragraphs else "")[:200]
    # aceita termos com ponto (ex: "llms.txt") e inicial acentuada; limita a ~1 frase
    is_definition_lead = bool(re.match(r"^[A-ZÀ-Ü].{0,150}?\s(é|são|significa|consiste em)\s", first_p))

    score = 0
    score += 6 if len(h1s) == 1 else (2 if h1s else 0)
    score += 4 if len(h2s) >= 2 else (2 if h2s else 0)
    score += 8 if word_count >= 600 else (4 if word_count >= 300 else 1)
    score += 7 if is_definition_lead else 0

    recs = []
    if len(h1s) == 0: recs.append({"prioridade": "alta", "dimensao": "conteudo", "acao": "Adicionar um H1 à página"})
    elif len(h1s) > 1: recs.append({"prioridade": "media", "dimensao": "conteudo", "acao": f"Múltiplos H1 detectados ({len(h1s)}) — usar apenas um"})
    if len(h2s) < 2: recs.append({"prioridade": "media", "dimensao": "conteudo", "acao": "Estruturar conteúdo com H2/H3 (LLMs usam hierarquia para extração)"})
    if word_count < 300: recs.append({"prioridade": "alta", "dimensao": "conteudo", "acao": f"Conteúdo curto ({word_count} palavras) — IAs preferem 600+ para citação"})
    if not is_definition_lead and paragraphs:
        recs.append({"prioridade": "alta", "dimensao": "conteudo", "acao": "Reescrever 1º parágrafo em formato definition-lead ('X é...') para extração direta por LLMs"})

    return {
        "score": score, "max": 25,
        "h1_count": len(h1s), "h2_count": len(h2s),
        "palavras": word_count,
        "definition_lead_detectado": is_definition_lead,
        "recommendations": recs,
    }


async def _audit_technical(base: str, headers: httpx.Headers) -> dict[str, Any]:
    robots_url = urljoin(base, "/robots.txt")
    sitemap_referenced = False
    bots_allowed: dict[str, bool] = {}

    try:
        r = await HTTP.get(robots_url)
        if r.status_code == 200:
            content = r.text
            sitemap_referenced = "sitemap" in content.lower()
            for bot in AI_BOTS:
                section = re.search(rf"User-agent:\s*{bot}\s*\n((?:(?!User-agent:).+\n?)*)", content, re.I)
                bots_allowed[bot] = bool(section and not re.search(r"Disallow:\s*/\s*$", section.group(1), re.M))
    except httpx.HTTPError:
        pass

    last_modified = "last-modified" in {k.lower() for k in headers.keys()}
    allowed_count = sum(bots_allowed.values())

    score = 0
    score += min(allowed_count * 3, 12)
    score += 5 if sitemap_referenced else 0
    score += 5 if last_modified else 0
    score += 8 if bots_allowed else 0

    recs = []
    if not bots_allowed:
        recs.append({"prioridade": "alta", "dimensao": "tecnico", "acao": "robots.txt sem regras explícitas para bots de IA — adicionar GPTBot, ClaudeBot, PerplexityBot"})
    else:
        for bot, allowed in bots_allowed.items():
            if not allowed:
                recs.append({"prioridade": "alta", "dimensao": "tecnico", "acao": f"{bot} bloqueado no robots.txt — desbloquear para citações em IA"})
    if not sitemap_referenced:
        recs.append({"prioridade": "media", "dimensao": "tecnico", "acao": "Referenciar Sitemap: no robots.txt"})
    if not last_modified:
        recs.append({"prioridade": "baixa", "dimensao": "tecnico", "acao": "Servidor não envia Last-Modified header — afeta freshness signals"})

    return {
        "score": score, "max": 30,
        "ai_bots_status": bots_allowed,
        "sitemap_em_robots": sitemap_referenced,
        "last_modified_header": last_modified,
        "recommendations": recs,
    }


# ── catálogo institucional ────────────────────────────────────────────────────


async def _fetch_json(path: str) -> dict[str, Any]:
    r = await HTTP.get(f"{BASE_URL}{path}")
    r.raise_for_status()
    return r.json()


@mcp.tool()
async def list_blog_posts(category: str | None = None, limit: int = 10) -> str:
    """Lista artigos do blog da Caracol AEO. Categorias: fundamentos, tecnico,
    conteudo, medicao, plataformas, mercado.
    """
    data = await _fetch_json("/blog/posts.json")
    posts = data["posts"]
    if category:
        posts = [p for p in posts if p["cat_id"] == category]
    posts = posts[: max(1, min(limit, 30))]
    lines = [
        f"- [{p['title']}]({BASE_URL}{p['url']})\n  {p['cat_label']} | {p['date']}\n  {p['desc']}"
        for p in posts
    ]
    header = f"**{len(posts)} artigos**" + (f" em '{category}'" if category else f" de {data['count']}")
    return f"{header}\n\n" + "\n\n".join(lines)


@mcp.tool()
async def get_blog_post(slug: str) -> str:
    """Conteúdo completo de um artigo pelo slug."""
    data = await _fetch_json("/blog/posts.json")
    meta = next((p for p in data["posts"] if p["slug"] == slug), None)
    if not meta:
        return f"Artigo '{slug}' não encontrado. Use list_blog_posts para descobrir slugs."
    try:
        r = await HTTP.get(f"{BASE_URL}/blog/{slug}/")
        body = BeautifulSoup(r.text, "html.parser")
        article = body.find("article") or body.find("main") or body
        text = re.sub(r"\s{2,}", " ", article.get_text(" ", strip=True))[:8000]
    except httpx.HTTPError:
        text = "(conteúdo indisponível)"
    return (
        f"# {meta['title']}\n\n**Categoria:** {meta['cat_label']} | **Data:** {meta['date']}\n"
        f"**URL:** {BASE_URL}{meta['url']}\n\n**Resumo:** {meta['desc']}\n\n---\n\n{text}"
    )


@mcp.tool()
async def search_posts(query: str) -> str:
    """Busca artigos por termos no título/descrição."""
    data = await _fetch_json("/blog/posts.json")
    terms = [t for t in query.lower().split() if len(t) > 2]
    scored = []
    for p in data["posts"]:
        hay = f"{p['title']} {p['desc']}".lower()
        s = sum(1 for t in terms if t in hay)
        if s: scored.append((s, p))
    scored.sort(key=lambda x: -x[0])
    if not scored:
        return f"Nenhum artigo para '{query}'."
    return "\n\n".join(
        f"- [{p['title']}]({BASE_URL}{p['url']})\n  {p['cat_label']} | {p['date']} | relev: {s}\n  {p['desc']}"
        for s, p in scored[:8]
    )


@mcp.tool()
async def get_services() -> str:
    """Serviços e planos da Caracol AEO com preços."""
    data = await _fetch_json("/services.json")
    blocks = []
    for s in data["services"]:
        price = "Grátis" if s["price"]["amount"] == 0 else s["price"]["formatted"]
        feats = "\n".join(f"  - {f}" for f in s["features"])
        blocks.append(
            f"### {s['name']} — {price}\n{s['description']}\n\n**Inclui:**\n{feats}\n\n"
            f"**Para quem:** {s['target_audience']}\n**Contratar:** {s['cta_url']}"
        )
    return f"# Serviços Caracol AEO\n\n{data['company_description']}\n\n---\n\n" + "\n\n---\n\n".join(blocks)


@mcp.tool()
async def get_company_info() -> str:
    """Informações completas da Caracol AEO."""
    services = await _fetch_json("/services.json")
    posts = await _fetch_json("/blog/posts.json")
    svc = "\n".join(f"- {s['name']}: {s['price']['formatted']}" for s in services["services"])
    cats = "\n".join(
        f"- {c['label']}: {sum(1 for p in posts['posts'] if p['cat_id'] == c['id'])} artigos"
        for c in posts["categories"]
    )
    return (
        f"# Caracol AEO\n\n**Especialidade:** Answer Engine Optimization (AEO) — mercado brasileiro\n"
        f"**Empresa:** Caracol Media (CNPJ: 55.097.812/0001-99)\n"
        f"**Site:** {BASE_URL} | **Contato:** contato@caracol.media\n\n"
        f"## Metodologia (4 dimensões)\n1. Dados Estruturados (Schema)\n2. Conteúdo e Estrutura\n"
        f"3. Técnico/Crawlability\n4. Meta Tags\n\n## Serviços\n\n{svc}\n\n## Blog ({posts['count']} artigos)\n\n{cats}"
    )


# ── transporte ────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    import sys
    transport = sys.argv[1] if len(sys.argv) > 1 else "streamable-http"
    mcp.run(transport=transport)
