export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. 处理 SSE 连接 (Cursor/Claude 会先连这个)
    if (url.pathname === "/sse") {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();

      // 告诉客户端：请往 /messages 发送 POST 请求
      const sendEndpoint = async () => {
        const msg = `event: endpoint\ndata: /messages\n\n`;
        await writer.write(new TextEncoder().encode(msg));
      };

      ctx.waitUntil(sendEndpoint());

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 2. 处理消息交互 (工具调用)
    if (url.pathname === "/messages") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

      try {
        const body = await request.json();
        const { method, params, id } = body;

        // A. 客户端问：你有什么工具？
        if (method === "tools/list") {
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: id,
            result: {
              tools: [{
                name: "google_search",
                description: "Search Google for information. Use this specifically for current events or finding external data.",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "The search keywords" }
                  },
                  required: ["query"]
                }
              }]
            }
          }), { headers: { "Content-Type": "application/json" } });
        }

        // B. 客户端说：我要调用 google_search
        if (method === "tools/call" && params.name === "google_search") {
          const query = params.arguments.query;

          const apiKey = env.GOOGLE_API_KEY;
          const cxId = env.GOOGLE_CX_ID;

          if (!apiKey || !cxId) {
            return new Response(JSON.stringify({
               jsonrpc: "2.0", id: id, isError: true,
               result: { content: [{ type: "text", text: "Error: API Key or CX ID not configured in Cloudflare." }] }
            }));
          }

          // 调用谷歌 API
          const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cxId}&q=${encodeURIComponent(query)}`;
          const resp = await fetch(searchUrl);
          const data = await resp.json();

          let resultText = "No results found.";
          if (data.items && data.items.length > 0) {
            resultText = data.items.map(item => 
              `Title: ${item.title}\nLink: ${item.link}\nSnippet: ${item.snippet}`
            ).join("\n---\n");
          }

          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: id,
            result: {
              content: [{ type: "text", text: resultText }]
            }
          }), { headers: { "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({ jsonrpc: "2.0", id: id, error: { code: -32601, message: "Method not found" } }));

      } catch (err) {
        return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: err.message } }));
      }
    }

    return new Response("Google Search MCP (Zero-Dep) Running. Connect via /sse", { status: 200 });
  }
};
