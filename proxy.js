/* ============================================================
   红色星球 · 百炼 API 本地代理 (CORS 兜底 + 文件上传)
   ------------------------------------------------------------
   需要 Node.js 18+（用到内置 fetch / FormData / Blob）。

   运行：  node proxy.js

   然后在 experts.html 的 CONFIG.bailian 中设置：
     useProxy : true
     proxyBase: "http://localhost:8787"   (默认)

   功能：
   1) 转发 /api/v1/apps/{appId}/completion 到百炼，自动注入
      Authorization 与 X-DashScope-OssResourceResolve 头。
   2) /upload-file ：接收本地文件(base64)，走 getPolicy → OSS
      临时上传，返回 oss:// 链接，供 file_list 使用。
   ============================================================ */
const http = require("http");
const fs   = require("fs");
const path = require("path");
const { Readable } = require("stream");

const PORT    = process.env.PORT || 8787;
const PAGE    = path.join(__dirname, "experts.html");
const API_KEY = "sk-50ca2008e8414c2cbe5bc11fabd9f715"; // 罗琼芝
const TARGET  = "https://dashscope.aliyuncs.com";

function readBody(req){
  return new Promise(r => { let b=""; req.on("data",c=>b+=c); req.on("end",()=>r(b)); });
}

/* 本地文件 → 百炼临时 OSS → oss:// 链接 */
async function uploadToOss(filename, contentType, dataBase64, model){
  // 1. 获取上传凭证
  const pr = await fetch(`${TARGET}/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(model)}`,
                         { headers:{ "Authorization":"Bearer "+API_KEY } });
  const pj = await pr.json();
  if(!pj.data) throw new Error("getPolicy 失败: " + JSON.stringify(pj));
  const d = pj.data;
  const key = d.upload_dir + "/" + filename;

  // 2. 组装表单上传到 OSS（file 必须放最后）
  const buf = Buffer.from(dataBase64, "base64");
  const fd = new FormData();
  fd.append("OSSAccessKeyId", d.oss_access_key_id);
  fd.append("Signature", d.signature);
  fd.append("policy", d.policy);
  fd.append("x-oss-object-acl", d.x_oss_object_acl);
  fd.append("x-oss-forbid-overwrite", d.x_oss_forbid_overwrite);
  fd.append("key", key);
  fd.append("success_action_status", "200");
  fd.append("file", new Blob([buf], { type: contentType || "application/octet-stream" }), filename);

  const ur = await fetch(d.upload_host, { method:"POST", body: fd });
  if(!(ur.status===200 || ur.status===204)){
    throw new Error("OSS 上传失败 HTTP " + ur.status + " " + (await ur.text()).slice(0,200));
  }
  return "oss://" + key;
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  try {
    // ① 页面：根路径 / 与 /experts.html 返回静态页面
    const urlPath = req.url.split("?")[0];
    if ((urlPath === "/" || urlPath === "/experts.html") && req.method === "GET") {
      return fs.readFile(PAGE, (err, buf) => {
        if (err) { res.writeHead(404, { "Content-Type":"text/plain; charset=utf-8" }); return res.end("experts.html 未找到"); }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(buf);
      });
    }

    // ① bis 状态端点（JSON）
    if (urlPath === "/status" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        status: "ok",
        service: "红色星球 · 百炼 API 代理",
        version: "1.0.0",
        endpoints: [
          { method: "GET",  path: "/",                                description: "专家市场页面 (experts.html)" },
          { method: "POST", path: "/api/v1/apps/{appId}/completion", description: "对话补全（转发至 DashScope）" },
          { method: "POST", path: "/upload-file",                    description: "本地文件上传至百炼临时 OSS" }
        ]
      }, null, 2));
    }

    // ② 文件上传端点
    if (req.url === "/upload-file" && req.method === "POST") {
      const { filename, contentType, dataBase64, model } = JSON.parse(await readBody(req));
      const ossUrl = await uploadToOss(filename, contentType, dataBase64, model || "qwen-max");
      res.writeHead(200, { "Content-Type":"application/json" });
      return res.end(JSON.stringify({ ossUrl }));
    }

    // ③ 其余请求透传到百炼，注入鉴权与 OSS 解析头
    const body = await readBody(req);
    const upstreamHeaders = {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + API_KEY,
      "X-DashScope-OssResourceResolve": "enable"
    };
    // 透传流式开关：前端开启 SSE 时把头转发给百炼
    if (req.headers["x-dashscope-sse"]) upstreamHeaders["X-DashScope-SSE"] = req.headers["x-dashscope-sse"];

    const r = await fetch(TARGET + req.url, {
      method: req.method,
      headers: upstreamHeaders,
      body: (req.method === "GET" || req.method === "HEAD") ? undefined : body
    });

    // 流式管道转发：不缓冲，逐块写回客户端（兼容普通 JSON 与 SSE）
    res.writeHead(r.status, { "Content-Type": r.headers.get("content-type") || "application/json" });
    if (r.body) { Readable.fromWeb(r.body).pipe(res); }
    else { res.end(await r.text()); }

  } catch (e) {
    res.writeHead(500, { "Content-Type":"application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  const v = parseInt(process.versions.node.split(".")[0], 10);
  if (v < 18) console.warn("⚠️  检测到 Node " + process.versions.node + "，请升级到 18+ 以支持文件上传（fetch/FormData/Blob）。");
  console.log(`✅ 百炼代理已启动: http://localhost:${PORT}  → ${TARGET}`);
  console.log("   · 页面      GET  /  (experts.html)");
  console.log("   · 对话转发  POST /api/v1/apps/{appId}/completion");
  console.log("   · 文件上传  POST /upload-file");
  console.log("   · 状态      GET  /status");
});
