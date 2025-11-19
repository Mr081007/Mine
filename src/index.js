import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse";
import { z } from "zod";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const server = new McpServer({
      name: "google-search-mcp",
      version: "1.0.0",
    });

    server.tool(
      "google_search",
      "Search Google for information.",
      {
        query: z.string().describe("Keywords to search"),
        num: z.number().default(5).describe("Number of results")
      },
      async ({ query, num }) => {
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

    if (url.pathname === "/sse") {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      
      const transport = new SSEServerTransport("/messages", {
        send: async (message) => {
          const str = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
          await writer.write(new TextEncoder().encode(str));
        }
      });

      await server.connect(transport);
      
      return new Response(readable, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
      });
    }

    if (url.pathname === "/messages") {
       return new Response("MCP Endpoint Active", { status: 200 });
    }

    return new Response("Google Search MCP running. Connect via /sse", { status: 200 });
  }
};
