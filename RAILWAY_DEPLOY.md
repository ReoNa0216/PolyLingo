# Railway 部署指南

## 为什么选择 Railway？
- 有香港/东京节点，国内访问速度快
- 免费版每有 5美元配额，足够个人使用
- 无需信用卡即可部署

## 部署步骤

### 1. 准备工作
确保以下文件已创建：
- `railway.toml` - Railway 配置
- `nixpacks.toml` - Node.js 版本配置
- `package.json` - 依赖管理

### 2. 注册 Railway
1. 访问 https://railway.app/
2. 使用 GitHub 账号登录
3. 验证邮箱

### 3. 创建项目

#### 方式 A：从 GitHub 导入（推荐）
1. 将后端代码推送到 GitHub
2. 在 Railway Dashboard 点击 "New Project"
3. 选择 "Deploy from GitHub repo"
4. 选择你的仓库
5. 选择 `backend` 目录作为根目录
6. 点击 "Deploy"

#### 方式 B：CLI 部署
```bash
# 安装 Railway CLI
npm install -g @railway/cli

# 登录
railway login

# 初始化项目
cd backend
railway init

# 部署
railway up

# 生成公开域名
railway domain
```

### 4. 配置环境（可选）
在 Railway Dashboard 中设置环境变量：
- `NODE_ENV=production`

### 5. 获取域名
部署成功后：
1. 进入项目 Settings
2. 找到 "Domains"
3. 生成公开域名（如 `xxx.up.railway.app` 或自定义域名）

## 前端配置

1. 打开 PolyLingo 设置
2. 找到 "代理服务器配置"
3. 填入 Railway 域名，如：
   ```
   https://polylingo-proxy-xxxx.up.railway.app
   ```
4. 保存设置

## 测试是否成功

访问以下 URL 测试：
```
https://xxx.up.railway.app/
https://xxx.up.railway.app/api/chinadaily/rss?category=world
https://xxx.up.railway.app/api/zdf/rss
```

## 常见问题

### 部署失败
确保 `package.json` 中有：
```json
"scripts": {
  "start": "node index.js"
}
```

### 端口被占用
Railway 会自动分配端口，代码中需要使用：
```javascript
const PORT = process.env.PORT || 3000;
```

### 静态 IP 问题
如果 China Daily 封禁了 Railway IP，可以：
1. 重新部署获取新 IP
2. 或者购买 Railway Pro 使用静态 IP

## 相关链接
- Railway 官网: https://railway.app/
- Railway CLI: https://docs.railway.app/develop/cli
