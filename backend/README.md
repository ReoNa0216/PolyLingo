# PolyLingo Proxy Server

CORS Proxy for PolyLingo - 专门用于获取 ZDF 新闻的代理服务

## 功能

- `/api/zdf/rss` - 获取 ZDF RSS 新闻源
- `/api/zdf/article?url=XXX` - 获取单篇文章内容
- `/api/proxy?url=XXX` - 通用代理

## Vercel 部署步骤

### 1. 安装 Vercel CLI（可选）

```bash
npm i -g vercel
```

### 2. 登录 Vercel

```bash
vercel login
```

### 3. 部署

在 backend 目录下运行：

```bash
vercel
```

按照提示操作：
- 确认项目根目录
- 确认项目名称（建议用 `polylingo-proxy`）
- 等待部署完成

### 4. 获取 URL

部署完成后，Vercel 会给你一个 URL：
```
https://polylingo-proxy-xxxxx.vercel.app
```

### 5. 更新前端代码

将这个 URL 复制到 `app.js` 中的 `API_BASE_URL` 变量。

## 测试

部署后访问：
```
https://你的地址.vercel.app/
```

应该返回：
```json
{
  "status": "ok",
  "service": "PolyLingo Proxy",
  ...
}
```

测试 ZDF RSS：
```
https://你的地址.vercel.app/api/zdf/rss
```

## 文件说明

- `index.js` - 主服务器代码
- `package.json` - 依赖配置
- `vercel.json` - Vercel 部署配置

## 注意事项

1. 免费版 Vercel 有 10 秒超时限制（足够 RSS 获取）
2. 如果需要更高频率调用，建议添加 API Key 认证
3. 可以在 Vercel Dashboard 中查看日志和统计
