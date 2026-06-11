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

const PORT    = process.env.PORT || 8787;
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
    // ① 根路径状态端点
    if (req.url === "/" && req.method === "GET") {
      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>红色星球 · 百炼 API 代理</title>
  <style>
    :root {
      --red: #E2231A;
      --red-deep: #B0141A;
      --red-soft: #FCEBEA;
      --gold: #E0B25C;
      --ink: #161A2B;
      --ink-2: #4A4F63;
      --ink-3: #878CA0;
      --line: #ECEEF4;
      --bg: #F6F7FB;
      --card: #FFFFFF;
      --space: linear-gradient(135deg, #1a0608 0%, #3a0a10 45%, #7a1318 100%);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* ── Header ── */
    header {
      background: rgba(255,255,255,.9);
      backdrop-filter: saturate(180%) blur(12px);
      border-bottom: 1px solid var(--line);
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .nav {
      max-width: 900px;
      margin: 0 auto;
      padding: 0 24px;
      height: 64px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .planet {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      background: radial-gradient(circle at 32% 30%, #ff6a5a 0%, var(--red) 42%, var(--red-deep) 100%);
      box-shadow: 0 0 0 3px rgba(226,35,26,.15), inset -3px -3px 6px rgba(0,0,0,.25);
      position: relative;
    }
    .planet::after {
      content: "";
      position: absolute;
      left: -5px; top: 12px;
      width: 38px; height: 8px;
      border-radius: 50%;
      border: 2px solid rgba(224,178,92,.7);
      transform: rotate(-18deg);
    }
    .brand-name {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: .3px;
      color: var(--ink);
    }
    .brand-name span { color: var(--red); }

    /* ── Hero ── */
    .hero {
      background: var(--space);
      color: #fff;
      padding: 72px 24px 80px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .hero::before {
      content: "";
      position: absolute; inset: 0;
      background-image:
        radial-gradient(1.5px 1.5px at 15% 25%, #fff, transparent),
        radial-gradient(1.5px 1.5px at 72% 18%, #ffd, transparent),
        radial-gradient(1px   1px   at 38% 68%, #fff, transparent),
        radial-gradient(1.5px 1.5px at 88% 55%, #fff, transparent),
        radial-gradient(1px   1px   at 52% 42%, #fff, transparent),
        radial-gradient(1px   1px   at 25% 80%, #ffd, transparent),
        radial-gradient(1.5px 1.5px at 60% 75%, #fff, transparent);
      opacity: .6;
    }
    .hero-inner { position: relative; max-width: 640px; margin: 0 auto; }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: rgba(255,255,255,.12);
      border: 1px solid rgba(255,255,255,.22);
      border-radius: 999px;
      padding: 5px 14px;
      font-size: 13px;
      font-weight: 600;
      color: #d4f5d4;
      margin-bottom: 24px;
      letter-spacing: .4px;
    }
    .status-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #4ade80;
      box-shadow: 0 0 0 3px rgba(74,222,128,.3);
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 3px rgba(74,222,128,.3); }
      50%       { box-shadow: 0 0 0 6px rgba(74,222,128,.1); }
    }
    .hero h1 {
      font-size: clamp(26px, 5vw, 40px);
      font-weight: 900;
      letter-spacing: .5px;
      line-height: 1.25;
      margin-bottom: 14px;
    }
    .hero h1 em {
      font-style: normal;
      color: var(--gold);
    }
    .hero p {
      font-size: 15px;
      color: rgba(255,255,255,.7);
      max-width: 480px;
      margin: 0 auto;
    }

    /* ── Main content ── */
    main {
      flex: 1;
      max-width: 900px;
      margin: 0 auto;
      width: 100%;
      padding: 48px 24px 64px;
    }
    .section-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.4px;
      text-transform: uppercase;
      color: var(--ink-3);
      margin-bottom: 20px;
    }

    /* ── Endpoint cards ── */
    .endpoints { display: flex; flex-direction: column; gap: 16px; }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 24px 28px;
      display: flex;
      align-items: flex-start;
      gap: 20px;
      box-shadow: 0 4px 14px rgba(22,26,43,.05);
      transition: box-shadow .2s, transform .2s;
    }
    .card:hover {
      box-shadow: 0 10px 30px rgba(22,26,43,.1);
      transform: translateY(-2px);
    }
    .method-badge {
      flex-shrink: 0;
      background: var(--red-soft);
      color: var(--red-deep);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1px;
      padding: 4px 10px;
      border-radius: 7px;
      margin-top: 3px;
      border: 1px solid rgba(226,35,26,.15);
    }
    .card-body { flex: 1; min-width: 0; }
    .card-path {
      font-size: 15px;
      font-weight: 700;
      font-family: "SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace;
      color: var(--ink);
      word-break: break-all;
      margin-bottom: 6px;
    }
    .card-path .param { color: var(--red); }
    .card-desc {
      font-size: 14px;
      color: var(--ink-2);
    }

    /* ── Footer ── */
    footer {
      text-align: center;
      padding: 24px;
      font-size: 13px;
      color: var(--ink-3);
      border-top: 1px solid var(--line);
    }
    footer strong { color: var(--red); }

    @media (max-width: 560px) {
      .card { flex-direction: column; gap: 10px; }
    }
  </style>
</head>
<body>

  <header>
    <div class="nav">
      <div class="planet"></div>
      <span class="brand-name"><span>红色星球</span> · 百炼 API 代理</span>
    </div>
  </header>

  <section class="hero">
    <div class="hero-inner">
      <div class="status-badge">
        <span class="status-dot"></span>
        服务运行中
      </div>
      <h1>百炼 API <em>代理服务</em></h1>
      <p>提供 CORS 兜底与文件上传能力，将请求安全转发至阿里云 DashScope 百炼平台。</p>
    </div>
  </section>

  <main>
    <p class="section-label">可用端点</p>
    <div class="endpoints">

      <div class="card">
        <span class="method-badge">POST</span>
        <div class="card-body">
          <div class="card-path">/api/v1/apps/<span class="param">{appId}</span>/completion</div>
          <div class="card-desc">对话补全（转发至 DashScope）</div>
        </div>
      </div>

      <div class="card">
        <span class="method-badge">POST</span>
        <div class="card-body">
          <div class="card-path">/upload-file</div>
          <div class="card-desc">本地文件上传至百炼临时 OSS</div>
        </div>
      </div>

    </div>
  </main>

  <footer>
    <strong>红色星球</strong> · 百炼 API 代理 &nbsp;·&nbsp; v1.0.0
  </footer>

</body>
</html>`;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
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
    const r = await fetch(TARGET + req.url, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + API_KEY,
        "X-DashScope-OssResourceResolve": "enable"
      },
      body: (req.method === "GET" || req.method === "HEAD") ? undefined : body
    });
    const text = await r.text();
    res.writeHead(r.status, { "Content-Type": r.headers.get("content-type") || "application/json" });
    res.end(text);

  } catch (e) {
    res.writeHead(500, { "Content-Type":"application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  const v = parseInt(process.versions.node.split(".")[0], 10);
  if (v < 18) console.warn("⚠️  检测到 Node " + process.versions.node + "，请升级到 18+ 以支持文件上传（fetch/FormData/Blob）。");
  console.log(`✅ 百炼代理已启动: http://localhost:${PORT}  → ${TARGET}`);
  console.log("   · 对话转发  /api/v1/apps/{appId}/completion");
  console.log("   · 文件上传  POST /upload-file");
});
