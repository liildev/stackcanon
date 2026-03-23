import { createServer, type IncomingMessage } from "node:http";
import { parseCliPayload } from "./contracts.js";
import { renderAppPage } from "./render.js";

const port = Number(process.env.PORT ?? "4310");

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk: string | Buffer) => {
      body += chunk.toString();
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(renderAppPage({}));
    return;
  }

  if (request.method === "POST" && request.url === "/inspect") {
    const body = await readRequestBody(request);
    const form = new URLSearchParams(body);
    const payload = form.get("payload") ?? "";

    try {
      const parsedPayload = parseCliPayload(payload);
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        renderAppPage({
          payload,
          parsedPayload
        })
      );
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown parse error";
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        renderAppPage({
          payload,
          error: message
        })
      );
      return;
    }
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

server.listen(port, () => {
  console.log(`StackCanon web prototype running at http://localhost:${port}`);
});
