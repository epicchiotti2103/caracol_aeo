import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = "https://www.aeobr.com.br";

// ── data helpers ──────────────────────────────────────────────────────────────

async function fetchPosts() {
  const res = await fetch(`${BASE_URL}/blog/posts.json`);
  if (!res.ok) throw new Error(`Failed to fetch posts: ${res.status}`);
  return res.json();
}

async function fetchServices() {
  const res = await fetch(`${BASE_URL}/services.json`);
  if (!res.ok) throw new Error(`Failed to fetch services: ${res.status}`);
  return res.json();
}

async function fetchPostHtml(slug) {
  const res = await fetch(`${BASE_URL}/blog/${slug}/`);
  if (!res.ok) throw new Error(`Post not found: ${slug}`);
  const html = await res.text();
  // Extract main content between <article> or <main> tags, strip HTML tags
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const raw = articleMatch?.[1] ?? mainMatch?.[1] ?? html;
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 8000);
}

// ── server setup ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "caracol-aeo",
  version: "1.0.0",
  description:
    "Servidor MCP da Caracol AEO. Fornece acesso a artigos técnicos sobre AEO, serviços e informações da empresa para o mercado brasileiro.",
});

// ── tools ─────────────────────────────────────────────────────────────────────

server.tool(
  "list_blog_posts",
  "Lista artigos do blog da Caracol AEO sobre Answer Engine Optimization. " +
    "Suporta filtragem por categoria e limite de resultados.",
  {
    category: z
      .enum(["fundamentos", "tecnico", "conteudo", "medicao", "plataformas", "mercado"])
      .optional()
      .describe(
        "Filtrar por categoria. Valores válidos: fundamentos, tecnico, conteudo, medicao, plataformas, mercado"
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .default(10)
      .describe("Número máximo de artigos a retornar (padrão: 10, máximo: 30)"),
  },
  async ({ category, limit = 10 }) => {
    const data = await fetchPosts();
    let posts = data.posts;

    if (category) {
      posts = posts.filter((p) => p.cat_id === category);
    }

    posts = posts.slice(0, limit);

    const lines = posts.map(
      (p) =>
        `- [${p.title}](${BASE_URL}${p.url})\n  Categoria: ${p.cat_label} | Data: ${p.date}\n  ${p.desc}`
    );

    const header = category
      ? `**${posts.length} artigos na categoria "${category}"**`
      : `**${posts.length} de ${data.count} artigos do blog**`;

    return {
      content: [
        {
          type: "text",
          text: `${header}\n\n${lines.join("\n\n")}`,
        },
      ],
    };
  }
);

server.tool(
  "get_blog_post",
  "Obtém o conteúdo completo de um artigo específico pelo slug. " +
    "Use list_blog_posts primeiro para descobrir slugs disponíveis.",
  {
    slug: z
      .string()
      .describe(
        "Slug do artigo no formato kebab-case (ex: o-que-e-aeo-answer-engine-optimization)"
      ),
  },
  async ({ slug }) => {
    const data = await fetchPosts();
    const meta = data.posts.find((p) => p.slug === slug);

    if (!meta) {
      return {
        content: [
          {
            type: "text",
            text: `Artigo não encontrado: "${slug}". Use list_blog_posts para ver os slugs disponíveis.`,
          },
        ],
        isError: true,
      };
    }

    let content;
    try {
      content = await fetchPostHtml(slug);
    } catch {
      content = "(Conteúdo completo não disponível — consulte o URL do artigo)";
    }

    return {
      content: [
        {
          type: "text",
          text:
            `# ${meta.title}\n\n` +
            `**Categoria:** ${meta.cat_label} | **Data:** ${meta.date}\n` +
            `**URL:** ${BASE_URL}${meta.url}\n\n` +
            `**Resumo:** ${meta.desc}\n\n` +
            `---\n\n${content}`,
        },
      ],
    };
  }
);

server.tool(
  "search_posts",
  "Busca artigos do blog por palavras-chave no título ou descrição.",
  {
    query: z
      .string()
      .min(2)
      .describe("Termos de busca em português (ex: schema markup, robots.txt, share of voice)"),
  },
  async ({ query }) => {
    const data = await fetchPosts();
    const terms = query.toLowerCase().split(/\s+/);

    const scored = data.posts
      .map((p) => {
        const haystack = `${p.title} ${p.desc}`.toLowerCase();
        const score = terms.filter((t) => haystack.includes(t)).length;
        return { post: p, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    if (scored.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Nenhum artigo encontrado para: "${query}". Tente termos diferentes.`,
          },
        ],
      };
    }

    const lines = scored.map(
      ({ post: p, score }) =>
        `- [${p.title}](${BASE_URL}${p.url})\n  ${p.cat_label} | ${p.date} | relevância: ${score}\n  ${p.desc}`
    );

    return {
      content: [
        {
          type: "text",
          text: `**${scored.length} artigos encontrados para "${query}"**\n\n${lines.join("\n\n")}`,
        },
      ],
    };
  }
);

server.tool(
  "get_services",
  "Retorna os serviços e planos da Caracol AEO com preços, funcionalidades e público-alvo.",
  {},
  async () => {
    const data = await fetchServices();

    const lines = data.services.map((s) => {
      const features = s.features.map((f) => `  - ${f}`).join("\n");
      const price = s.price.amount === 0 ? "Grátis" : s.price.formatted;
      return (
        `### ${s.name} — ${price}\n` +
        `${s.description}\n\n` +
        `**Inclui:**\n${features}\n\n` +
        `**Para quem é:** ${s.target_audience}\n` +
        `**Contratar:** ${s.cta_url}`
      );
    });

    return {
      content: [
        {
          type: "text",
          text:
            `# Serviços da Caracol AEO\n\n` +
            `${data.company_description}\n\n` +
            `---\n\n${lines.join("\n\n---\n\n")}`,
        },
      ],
    };
  }
);

server.tool(
  "get_company_info",
  "Retorna informações completas sobre a Caracol AEO: missão, metodologia, serviços e contato.",
  {},
  async () => {
    const services = await fetchServices();
    const posts = await fetchPosts();

    const serviceNames = services.services
      .map((s) => `- ${s.name}: ${s.price.formatted}`)
      .join("\n");

    const categories = posts.categories
      .map((c) => {
        const count = posts.posts.filter((p) => p.cat_id === c.id).length;
        return `- ${c.label}: ${count} artigos`;
      })
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text:
            `# Caracol AEO\n\n` +
            `**Especialidade:** Answer Engine Optimization (AEO) para o mercado brasileiro\n` +
            `**Empresa:** Caracol Media (CNPJ: 55.097.812/0001-99)\n` +
            `**Site:** ${BASE_URL}\n` +
            `**Contato:** contato@aeobr.com.br\n\n` +
            `## O que fazemos\n\n` +
            `Auditamos e otimizamos a visibilidade de marcas nas respostas de IAs generativas ` +
            `como ChatGPT, Perplexity e Google AI Overview.\n\n` +
            `## Metodologia (4 dimensões)\n\n` +
            `1. **Dados Estruturados (Schema):** Schema.org markup para citação por IAs\n` +
            `2. **Conteúdo e Estrutura:** Definition-lead sentences, FAQ, answer-first formatting\n` +
            `3. **Técnico/Crawlability:** robots.txt, server-side rendering, velocidade\n` +
            `4. **Meta Tags:** Title, description, Open Graph e sinais de metadados\n\n` +
            `## Serviços\n\n${serviceNames}\n\n` +
            `## Blog (${posts.count} artigos)\n\n${categories}\n\n` +
            `Acesse todos os artigos: ${BASE_URL}/blog/\n` +
            `API de dados: ${BASE_URL}/blog/posts.json`,
        },
      ],
    };
  }
);

// ── resources ─────────────────────────────────────────────────────────────────

server.resource(
  "blog-posts",
  `${BASE_URL}/blog/posts.json`,
  { mimeType: "application/json", description: "Todos os artigos do blog em JSON estruturado" },
  async (uri) => {
    const res = await fetch(uri.href);
    const text = await res.text();
    return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
  }
);

server.resource(
  "services",
  `${BASE_URL}/services.json`,
  { mimeType: "application/json", description: "Serviços e planos da Caracol AEO" },
  async (uri) => {
    const res = await fetch(uri.href);
    const text = await res.text();
    return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
  }
);

server.resource(
  "llms-full",
  `${BASE_URL}/llms-full.txt`,
  { mimeType: "text/plain", description: "Guia completo do site para modelos de linguagem" },
  async (uri) => {
    const res = await fetch(uri.href);
    const text = await res.text();
    return { contents: [{ uri: uri.href, mimeType: "text/plain", text }] };
  }
);

// ── start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
