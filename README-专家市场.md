# 红色星球 · 精选专家市场（专家库二级页面）

## 文件
- `experts.html` —— 专家市场页面（独立单文件，双击即可打开）
- `proxy.js` —— 可选的本地代理，解决浏览器直连百炼的 CORS 问题

## 页面结构
1. **专家市场首页**：红色星球品牌风格的 Hero + 筛选栏 + 专家卡片（郑浩、罗琼芝）
2. **专家主页（点击卡片进入）**：
   - 个人简介 / 标签 / 服务数据
   - **基础服务内容**
   - **增值服务项目**（含报价）
   - **专属 AI 机器人 聊天框**：支持文字、图片上传、文件上传

## 罗琼芝 AI 机器人接入（阿里云百炼 · 智能体应用）

在 `experts.html` 顶部 `CONFIG.bailian` 配置：

```js
const CONFIG = {
  bailian: {
    apiKey : "sk-50ca2008e8414c2cbe5bc11fabd9f715",
    appId  : "在此填写罗琼芝的_APP_ID",   // ← 必填：百炼控制台「我的应用」中的 App ID
    useProxy : false,
    directBase : "https://dashscope.aliyuncs.com",
    proxyBase  : "http://localhost:8787"
  }
};
```

调用接口：`POST /api/v1/apps/{appId}/completion`，自动维护 `session_id` 实现多轮对话。

### 若直连报 CORS / 网络错误
浏览器直连 dashscope 经常被跨域拦截。此时：
1. 终端运行 `node proxy.js`
2. 把 `CONFIG.bailian.useProxy` 改为 `true`
3. 刷新页面再试（代理会自动注入鉴权头）

## ⚠️ 安全提醒
当前为**本地测试**，API Key 内嵌在前端，任何打开网页的人都能看到。
**正式上线前请务必**：把密钥移到后端服务（如 proxy.js 思路），前端只调用你自己的后端，绝不暴露 sk- 密钥。

## 多模态：让 AI 真正"读图片 + 读文件"

页面已实现真实的图片与文件读取，分两条链路：

### 图片
- 实现：图片以 base64 直接放入 `input.image_list` 发给应用。
- **应用侧要求**：在百炼控制台把罗琼芝应用的模型设为 **千问VL 系列**（qwen-vl-max / qwen-vl-plus）并开启视觉理解，否则无法识图。

### 文件 / 文档（必须开启代理）
- 实现：本地文件先经 `proxy.js` 调用 `getPolicy` 上传到百炼临时 OSS，得到 `oss://` 链接放入 `input.file_list`，代理自动注入 `X-DashScope-OssResourceResolve: enable` 头。
- **应用侧要求**：在百炼控制台「规划 > 文件处理」开启 **全文引用** 或 **切片检索**。
- **模型匹配**：`CONFIG.bailian.fileModel` 默认 `qwen-max`，需与应用实际文本模型一致；不一致时改成你应用的模型名。
- 支持：doc/docx/ppt/pptx/xls/xlsx/pdf/md/txt 等，单文件 ≤ 10MB。

> 运行环境：`proxy.js` 需要 **Node.js 18+**（用到内置 fetch / FormData / Blob）。

### 生产级可选方案
更稳妥的文件方案是百炼 `session_file_id`（ApplyFileUploadLease → 上传 → AddFile），走百炼 OpenAPI，需要 AccessKey 签名（AK/SK，而非 sk- 密钥）。如需切换，提供 AK/SK 与 WorkspaceId，我可改造 proxy.js。
