// SOAP mock:模拟 AzerothCore worldserver SOAP 端点(dev only,research R10)
// 三态开关: normal(正常) / timeout(挂起不响应) / failure(SOAP Fault)
// 运行态切换: GET /__mode            -> 查询当前态
//             GET /__mode?mode=...   -> 切换(normal|timeout|failure)
// 命令处理: 仅认识 `.server info`,其余命令返回错误文本(供白名单/非幂等路径测试)
// 零依赖纯 Node http,compose 与 `pnpm soap:mock` 共用本文件
import http from "node:http";

const PORT = Number(process.env.SOAP_MOCK_PORT ?? 7878);
const USER = process.env.SOAP_MOCK_USER ?? "soaper";
const PASSWORD = process.env.SOAP_MOCK_PASSWORD ?? "change-me";

let mode = "normal";

function extractCommand(xml) {
  // AzerothCore 风格:<command>...</command>(CDATA 或转义文本)
  const m = xml.match(/<command[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/command>/i);
  return m ? m[1].trim() : "";
}

function basicAuthOk(req) {
  const header = req.headers.authorization ?? "";
  const m = header.match(/^Basic (.+)$/);
  if (!m) return false;
  const decoded = Buffer.from(m[1], "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  return (
    decoded.slice(0, idx) === USER && decoded.slice(idx + 1) === PASSWORD
  );
}

function soapEnvelope(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ns1="urn:AC">
  <SOAP-ENV:Body>${body}</SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
}

const WSDL = `<?xml version="1.0" encoding="UTF-8"?>
<definitions name="AC"
  targetNamespace="urn:AC"
  xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:SOAP="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:tns="urn:AC">
  <types>
    <xsd:schema targetNamespace="urn:AC" elementFormDefault="qualified">
      <xsd:element name="executeCommand">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="command" type="xsd:string" minOccurs="0"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="executeCommandResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="result" type="xsd:string" minOccurs="0"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </types>
  <message name="executeCommandRequest"><part name="parameters" element="tns:executeCommand"/></message>
  <message name="executeCommandResponseMessage"><part name="parameters" element="tns:executeCommandResponse"/></message>
  <portType name="ACPortType">
    <operation name="executeCommand">
      <input message="tns:executeCommandRequest"/>
      <output message="tns:executeCommandResponseMessage"/>
    </operation>
  </portType>
  <binding name="ACBinding" type="tns:ACPortType">
    <SOAP:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="executeCommand">
      <SOAP:operation soapAction=""/>
      <input><SOAP:body use="literal"/></input>
      <output><SOAP:body use="literal"/></output>
    </operation>
  </binding>
  <service name="AC">
    <port name="ACPort" binding="tns:ACBinding">
      <SOAP:address location="http://localhost:${PORT}/"/>
    </port>
  </service>
</definitions>`;

function faultString(msg) {
  return `<SOAP-ENV:Fault>
  <faultcode>SOAP-ENV:Server</faultcode>
  <faultstring>${msg}</faultstring>
</SOAP-ENV:Fault>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // 运行态控制(dev only)
  if (url.pathname === "/__mode") {
    const next = url.searchParams.get("mode");
    if (next && ["normal", "timeout", "failure"].includes(next)) {
      mode = next;
      console.log(`[soap-mock] mode -> ${mode}`);
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ mode }));
    return;
  }

  if (!basicAuthOk(req)) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="AC"' });
    res.end();
    return;
  }

  if ((req.method === "GET" && (url.pathname === "/" || url.pathname.endsWith(".wsdl"))) ||
      url.searchParams.has("wsdl")) {
    res.writeHead(200, { "content-type": "text/xml" });
    res.end(WSDL);
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }

  if (mode === "timeout") {
    // 挂起不响应,由客户端超时与重试逻辑接管
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    if (mode === "failure") {
      res.writeHead(500, { "content-type": "text/xml" });
      res.end(soapEnvelope(faultString("mock failure mode")));
      return;
    }

    const command = extractCommand(body);
    let result;
    if (command === ".server info") {
      result =
        "AzerothCore rev. mock 2026-10-23 (Unix, Static) \nConnected players: 0. Character in world: 0.\n";
    } else if (command === "") {
      res.writeHead(500, { "content-type": "text/xml" });
      res.end(soapEnvelope(faultString("missing command")));
      return;
    } else {
      result = `[mock] unknown or denied command: ${command}`;
    }

    const escaped = result
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    res.writeHead(200, { "content-type": "text/xml" });
    res.end(
      soapEnvelope(
        `<ns1:executeCommandResponse><result>${escaped}</result></ns1:executeCommandResponse>`,
      ),
    );
  });
});

server.listen(PORT, () => {
  console.log(`[soap-mock] listening on :${PORT} (mode=${mode})`);
});
