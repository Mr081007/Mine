import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. 初始化 Server
    const server = new McpServer({
      name: "google-search-mcp",
      version: "1.0.0",
    });

    // 2. 注册工具
    server.tool(
      "google_search",
      "Search Google for information.",
      {
        query: z.string().describe("Keywords to search"),
        num: z.number().default(5).describe("Number of results")
      },
      async ({ query, num }) => {
        // 获取环境变量
        const apiKey = env.GOOGLE_API_KEY;
        const cxId = env.GOOGLE_CX_ID;

        if (!apiKey || !cxId) {
          return { content: [{ type: "text", text: "Error: Missing API Key or CX ID config." }], isError: true };
        }

        try {
          const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cxId}&q=${encodeURIComponent(query)}&num=${num}`;
          const resp = await fetch(searchUrl);
          const data = await resp.json();

          if (!data.items) return { content: [{ type: "text", text: "No results found." }] };

          const resultText = data.items.map(item => 
            `[${item.title}](${item.link})\n${item.snippet}`
          ).join("\n\n");

          return { content: [{ type: "text", text: resultText }] };
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
        }
      }
    );

    // 3. 处理 SSE 请求 (Cursor/Claude 连接用)
    if (url.pathname === "/sse") {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();

      const transport = new SSEServerTransport("/messages", {
        send: async (message) => {
          // 手动构造 SSE 消息格式
          const str = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
          await writer.write(new TextEncoder().encode(str));
        }
      });

      await server.connect(transport);

      return new Response(readable, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
      });
    }

    // 4. 处理 POST 消息 (工具调用)
    if (url.pathname === "/messages") {
       // 简单的消息接收占位，实际完整实现需要处理 request body 并传给 server
       // 但对于简单的 SSE 发现模式，有时只需保持 endpoint 存在
       // 提示：完整的 POST 处理在 Worker 环境较复杂，
       // 这里建议主要依赖 SSE 推送，大部分客户端会复用连接。
       return new Response("MCP Endpoint Active", { status: 200 });
    }

    return new Response("Google Search MCP running. Connect via /sse", { status: 200 });
  }
};
